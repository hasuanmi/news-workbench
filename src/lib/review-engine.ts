/**
 * 每日评报引擎（M4）
 *
 * 流程：
 *   1. 规则层筛选文章（日期 / 媒体 / 字数 / 去重 / 启用源）
 *   2. AI 结构化分析（非流式）：今日重点、同题聚类对比、同行亮点
 *   3. AI 流式生成最终评报（SSE 打字机）
 *   4. 落库 daily_review（sections + final_summary）
 *
 * 生成规则 / 展示规则从 app_config 读取（review.generation_rules / review.display_rules），
 * 前台临时条件只影响本次分析，不改默认规则。
 */

import { supabase } from "@/lib/db";
import { ReviewDataError, parseReviewConfig } from "@/lib/review-data-error";
import { reviewDayBounds } from "@/lib/review-date";
import { reviewDayInventory } from "@/lib/review-availability";
import { unifiedInvoke, unifiedStream } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-adapter";
import type { ReviewModule } from "@/lib/review-types";

// ============ 类型 ============

export interface ReviewConditions {
  date: string; // ISO
  mediaIds: string[]; // 空数组 = monitor_review 启用的媒体
  minWordCount: number;
  highlightFlags: string[];
  dimensions: string[];
  topics: string[];
  scanMissing: boolean;
  customRequirement?: string;
}

export interface GenerationRules {
  max_word_count: number;
  modules: { today_focus: boolean; same_topic: boolean; peer_highlights: boolean; gz_daily: boolean };
  same_topic_max: number;
  peer_highlights_max: number;
  summary_max_length: number;
  language_style: string;
}

export interface DisplayRules {
  show_comparison_table: boolean;
  show_media_name: boolean;
  show_article_title: boolean;
  show_article_url: boolean;
  show_evidence: boolean;
}

export const DEFAULT_GEN_RULES: GenerationRules = {
  max_word_count: 1000,
  modules: { today_focus: true, same_topic: true, peer_highlights: true, gz_daily: false },
  same_topic_max: 5,
  peer_highlights_max: 5,
  summary_max_length: 200,
  language_style: "专业、客观、简洁，符合报纸评报口吻",
};

export const DEFAULT_DISPLAY_RULES: DisplayRules = {
  show_comparison_table: true,
  show_media_name: true,
  show_article_title: true,
  show_article_url: true,
  show_evidence: true,
};

export const DIMENSION_LABELS: Record<string, string> = {
  topic: "选题",
  timeliness: "时效性",
  angle: "报道角度",
  depth: "内容深度",
  richness: "信息丰富度",
  presentation: "表现形式",
  local: "广州本地性",
  exclusive: "独家性",
  headline: "标题质量",
  service: "服务性",
};

export interface ReviewArticle {
  id: string;
  media_id: string;
  media_name: string;
  title: string;
  url: string;
  publish_time: string;
  word_count: number;
  section: string | null;
  is_key_report: boolean;
  snippet: string;
  source_evidence?: string | null;
}

// ============ 配置读取 ============

async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase()
    .from("app_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new ReviewDataError("读取评报规则", `app_config.value (${key})`, error);
  return parseReviewConfig(key, data?.value, fallback);
}

export async function getReviewRules(): Promise<{ gen: GenerationRules; display: DisplayRules }> {
  const gen = await getConfig<GenerationRules>("review.generation_rules", DEFAULT_GEN_RULES);
  const display = await getConfig<DisplayRules>("review.display_rules", DEFAULT_DISPLAY_RULES);
  return { gen, display };
}

// ============ 规则层：筛选文章 ============

export async function fetchReviewArticles(conditions: ReviewConditions): Promise<{
  dateStr: string;
  articles: ReviewArticle[];
  gzMediaNames: string[];
  diagnostics: { total: number; mediaCount: number; selected: number; afterWords: number; eligible: number };
}> {
  const db = supabase();
  const { date: dateStr, start, end } = reviewDayBounds(conditions.date);

  // 目标媒体：显式传入优先；为空则取 monitor_review 启用媒体
  let mediaIds = conditions.mediaIds.filter(Boolean);
  let mediaMap = new Map<string, string>();
  if (mediaIds.length === 0) {
    const { data: mediaRows, error: mediaError } = await db
      .from("media")
      .select("id, media_name")
      .eq("monitor_review", true)
      .eq("enabled", true);
    if (mediaError) throw new ReviewDataError("读取评报媒体范围", "media.id,media_name,monitor_review,enabled", mediaError);
    mediaIds = (mediaRows ?? []).map((m) => m.id);
    mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));
  } else {
    const { data: mediaRows, error: mediaError } = await db
      .from("media")
      .select("id, media_name")
      .in("id", mediaIds);
    if (mediaError) throw new ReviewDataError("读取评报媒体范围", "media.id,media_name", mediaError);
    mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));
  }

  if (mediaIds.length === 0) {
    throw new Error("未找到参与评报的媒体，请在「媒体与数据源」中设置评报监测媒体");
  }

  // 广州日报系媒体名称（用于同行遗漏扫描）
  const gzMediaNames = [...mediaMap.values()].filter((n) => n.includes("广州日报"));

  const query = db
    .from("article")
    .select("*")
    .eq("is_test", false)
    .in("media_id", mediaIds)
    .gte("publish_time", start)
    .lt("publish_time", end)
    .order("publish_time", { ascending: false }).order("id");

  const inventory = await reviewDayInventory(dateStr);
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new ReviewDataError("读取候选文章", "article.is_test,media_id,publish_time", error);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }

  // 真实选稿严格遵守后台字数阈值，不因样本不足自动放宽。
  const threshold = conditions.minWordCount;
  const filtered = (rows ?? []).filter((a) => (a.word_count ?? 0) >= threshold);

  // content_hash 去重已由唯一索引保证；这里按标题+媒体再去一次重
  const seen = new Set<string>();
  const articles: ReviewArticle[] = [];
  for (const a of filtered) {
    const key = `${a.media_id}:${a.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    articles.push({
      id: a.id,
      media_id: a.media_id,
      media_name: mediaMap.get(a.media_id) ?? "未知媒体",
      title: a.title,
      url: a.url,
      publish_time: a.publish_time,
      word_count: a.word_count ?? 0,
      section: a.section,
      is_key_report: a.is_key_report,
      snippet: (a.content ?? "").replace(/\s+/g, " ").slice(0, 220),
      source_evidence: (a.content ?? "").match(/(?:来源\s*[:：]\s*新华社[^\n]{0,40}|新华社[^\s。，,]{0,15}电)/)?.[0] ?? null,
    });
  }

  return { dateStr, articles, gzMediaNames, diagnostics: { ...inventory, selected: rows.length, afterWords: filtered.length, eligible: articles.length } };
}

// ============ AI 结构化分析（非流式） ============

interface StructuredAnalysis {
  modules: ReviewModule[];
}

function buildAnalysisMessages(
  dateStr: string,
  articles: ReviewArticle[],
  conditions: ReviewConditions,
  rules: GenerationRules,
  gzMediaNames: string[],
  selection?: { peer_highlights: Array<{ url: string }>; xinhua_background: Array<{ url: string }> },
): ChatMessage[] {
  const articleLines = articles
    .map(
      (a, i) =>
        `[${i + 1}] 媒体：${a.media_name}｜标题：${a.title}｜字数：${a.word_count}${a.section ? `｜版面：${a.section}` : ""}｜摘要：${a.snippet}｜新华社来源证据：${a.source_evidence ?? "未发现明确署名"}｜链接：${a.url}`,
    )
    .join("\n");

  const enabledModules: string[] = [];
  if (rules.modules.today_focus) enabledModules.push("today_focus 今日重点");
  if (rules.modules.same_topic) enabledModules.push("same_topic 同题观察");
  if (rules.modules.peer_highlights) enabledModules.push("peer_highlights 同行亮点");
  if (rules.modules.gz_daily) enabledModules.push("gz_daily 广州日报观察");

  const system = `你是资深新闻评报专家，负责横向对比多家媒体同一天的报道。基于给定文章数据做结构化分析，严格输出 JSON（不要 markdown 代码块、不要多余文字）。

JSON 结构：
{
  "today_focus": {
    "summary": "当天共同关注主题与主要报道情况概述（100字内）",
    "items": [ { "media": "媒体名", "title": "报道/主题标题", "summary": "一句话说明", "url": "原文链接" } ]
  },
  "same_topic": [
    {
      "theme": "共同主题名称",
      "comparison": [ { "media": "媒体名", "angle": "主要报道角度", "highlight": "特点", "title": "代表文章标题", "url": "链接" } ],
      "analysis": "各媒体差异总结（50字内）"
    }
  ],
  "peer_highlights": [
    { "media": "媒体名", "title": "文章标题", "summary": "AI摘要（50字内）", "why_noteworthy": "为什么值得广州日报关注（30字内）", "url": "链接" }
  ],
  "gz_daily": {
    "summary": "广州日报当天报道特点与可改进点概述",
    "items": [ { "media": "广州日报", "title": "标题", "summary": "说明", "url": "链接" } ]
  }
}

规则：
- 只输出需要的模块；某模块无内容则对应值为 null 或空数组
- 同题观察最多 ${rules.same_topic_max} 个主题，每个主题对比 ${2} 家以上媒体
- 同行亮点最多 ${rules.peer_highlights_max} 条
- peer_highlights 只放：${gzMediaNames.length > 0 ? gzMediaNames.join("、") : "广州日报"} 没有重点覆盖、但其他媒体做了重点的报道
- 所有内容必须基于给定文章，禁止编造链接和标题
- 未提供版面编号、头版、整版等事实时，只评网站文章，不得推断纸报头条、显要位置、版面排布或版式
- 纯新华社转载只作为共同背景，不能进入原创差异比较或同行独有；不得将缺少署名证据的文章推断为新华社通稿
- 如提供本期选稿校验结果，同行亮点必须取自其 peer_highlights。仅能判断本轮已采集数据，不得宣称完整纸报或全网独有`;

  const user = `评报日期：${dateStr}
参与媒体：${[...new Set(articles.map((a) => a.media_name))].join("、")}
共 ${articles.length} 篇符合条件文章：
${selection ? `本期选稿已校验的同行亮点与新华社背景：${JSON.stringify(selection)}` : ""}

${articleLines}

分析要求：
- 启用模块：${enabledModules.join("；")}
- 评报维度：${conditions.dimensions.map((d) => DIMENSION_LABELS[d] || d).join("、") || "默认维度"}
${conditions.topics.length > 0 ? `- 重点关注主题：${conditions.topics.join("、")}` : ""}
${conditions.scanMissing ? `- 同行遗漏扫描：开启（找出其他媒体重点报道但广州日报未重点覆盖的内容）` : ""}
${conditions.customRequirement ? `- 本次自定义要求：${conditions.customRequirement}` : ""}
${conditions.highlightFlags.length > 0 ? `- 版面信号参考（数据中可能缺失，缺失则忽略）：${conditions.highlightFlags.join("、")}` : ""}

请输出结构化 JSON。`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function safeParseJson(raw: string): any {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回无法解析为 JSON");
  let s = match[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  try {
    return JSON.parse(s);
  } catch {
    // 二次尝试：转义未转义引号
    s = s.replace(/(?<!\\)"/g, '\\"').replace(/\\"/g, '"');
    return JSON.parse(s);
  }
}

export async function analyzeStructure(
  dateStr: string,
  articles: ReviewArticle[],
  conditions: ReviewConditions,
  rules: GenerationRules,
  gzMediaNames: string[],
  selection?: { peer_highlights: Array<{ url: string }>; xinhua_background: Array<{ url: string }> },
): Promise<StructuredAnalysis> {
  const messages = buildAnalysisMessages(dateStr, articles, conditions, rules, gzMediaNames, selection);
  const raw = await unifiedInvoke(messages, { temperature: 0.3 });
  const parsed = safeParseJson(raw);
  const sourceUrls = new Set(articles.map(a => a.url));
  const reprintUrls = new Set(selection?.xinhua_background.map(a => a.url) ?? articles.filter(a => a.source_evidence && !/采访|现场|了解到|我们走访|数据显示|统计|独家|本地|探访|记者走访|新增|原创/.test(`${a.title} ${a.snippet}`)).map(a => a.url));
  const peerUrls = selection ? new Set(selection.peer_highlights.map(a => a.url)) : sourceUrls;

  const modules: ReviewModule[] = [];

  if (rules.modules.today_focus && parsed.today_focus) {
    modules.push({
      type: "today_focus",
      summary: parsed.today_focus.summary ?? "",
      items: (parsed.today_focus.items ?? []).filter((it: any) => sourceUrls.has(it.url)).map((it: any) => ({
        media: it.media,
        title: it.title,
        summary: it.summary,
        url: it.url,
      })),
    });
  }

  if (rules.modules.same_topic && Array.isArray(parsed.same_topic)) {
    modules.push({
      type: "same_topic",
      topics: parsed.same_topic.slice(0, rules.same_topic_max).map((t: any) => ({
        theme: t.theme,
        comparison: (t.comparison ?? []).filter((r: any) => sourceUrls.has(r.url) && !reprintUrls.has(r.url)).map((r: any) => ({
          media: r.media,
          angle: r.angle,
          highlight: r.highlight,
          title: r.title,
          url: r.url,
        })),
        analysis: t.analysis,
      })).filter((t: any) => new Set(t.comparison.map((r: any) => r.media)).size >= 2),
    });
  }

  if (rules.modules.peer_highlights && Array.isArray(parsed.peer_highlights)) {
    modules.push({
      type: "peer_highlights",
      items: parsed.peer_highlights.filter((p: any) => peerUrls.has(p.url) && !reprintUrls.has(p.url)).slice(0, rules.peer_highlights_max).map((p: any) => ({
        media: p.media,
        title: p.title,
        summary: p.summary,
        url: p.url,
        why_noteworthy: p.why_noteworthy,
      })),
    });
  }

  if (rules.modules.gz_daily && parsed.gz_daily) {
    modules.push({
      type: "gz_daily",
      summary: parsed.gz_daily.summary ?? "",
      items: (parsed.gz_daily.items ?? []).filter((it: any) => sourceUrls.has(it.url)).map((it: any) => ({
        media: it.media,
        title: it.title,
        summary: it.summary,
        url: it.url,
      })),
    });
  }

  return { modules };
}

// ============ AI 流式生成最终评报 ============

function buildFinalMessages(
  dateStr: string,
  modules: ReviewModule[],
  conditions: ReviewConditions,
  rules: GenerationRules,
): ChatMessage[] {
  const structureText = JSON.stringify(modules, null, 1);

  const system = `你是资深报纸评报主笔，基于已完成的结构化分析，撰写当天的最终评报。
用中文、连贯的自然语言（不要列表、不要 JSON、不要标题符号堆砌），分段输出。
内容包含四部分：今日共同重点、同题报道差异、同行亮点（其他媒体有而广州日报没有重点覆盖的）、广州日报可借鉴之处。
只依据已提供文章和结构，不添加事实。未提供纸报版面证据时不得描述纸报头条、显要位置或版面排布。同行有无仅指本轮已采集样本；纯转载不作为原创比较。
语言风格：${rules.language_style}。
总字数控制在 ${rules.max_word_count} 字以内。只输出评报正文。`;

  const user = `评报日期：${dateStr}
评报维度：${conditions.dimensions.map((d) => DIMENSION_LABELS[d] || d).join("、") || "默认维度"}
${conditions.topics.length > 0 ? `重点主题：${conditions.topics.join("、")}` : ""}
${conditions.customRequirement ? `本次要求：${conditions.customRequirement}` : ""}

结构化分析结果：
${structureText}

请撰写最终评报。`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function* streamFinalReview(
  dateStr: string,
  modules: ReviewModule[],
  conditions: ReviewConditions,
  rules: GenerationRules,
): AsyncGenerator<string> {
  const messages = buildFinalMessages(dateStr, modules, conditions, rules);
  for await (const chunk of unifiedStream(messages, { temperature: 0.4 })) {
    if (chunk.content) yield chunk.content;
  }
}

// ============ 落库 ============

export async function saveDailyReview(params: {
  dateStr: string;
  modules: ReviewModule[];
  finalSummary: string;
  conditions: ReviewConditions;
}): Promise<string> {
  const db = supabase();
  const sections = {
    today_focus: params.modules.find((m) => m.type === "today_focus") ?? null,
    same_topic: params.modules.find((m) => m.type === "same_topic") ?? null,
    peer_highlights: params.modules.find((m) => m.type === "peer_highlights") ?? null,
    gz_daily: params.modules.find((m) => m.type === "gz_daily") ?? null,
    conditions: {
      minWordCount: params.conditions.minWordCount,
      dimensions: params.conditions.dimensions,
      topics: params.conditions.topics,
      scanMissing: params.conditions.scanMissing,
      customRequirement: params.conditions.customRequirement ?? "",
    },
  };

  // 同一天重复生成：upsert（report_date 唯一），version +1
  const { data: existing } = await db
    .from("daily_review")
    .select("id, version")
    .eq("report_date", params.dateStr)
    .maybeSingle();

  if (existing) {
    const newVersion = (existing.version ?? 1) + 1;
    const { error } = await db
      .from("daily_review")
      .update({
        sections: JSON.stringify(sections),
        is_test: false,
        test_run_id: null,
        final_summary: params.finalSummary,
        review_status: "pending",
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(`更新评报失败: ${error.message}`);
    // 记录本次重新生成的原始版本快照
    await writeRevisionQuiet({
      reviewId: existing.id,
      version: newVersion,
      sections,
      finalSummary: params.finalSummary,
      source: "generate",
      changeNote: "重新生成",
    });
    return existing.id;
  }

  const { data, error } = await db
    .from("daily_review")
    .insert({
      report_date: params.dateStr,
      sections: JSON.stringify(sections),
      final_summary: params.finalSummary,
      review_status: "pending",
      version: 1,
    })
    .select("id")
    .single();
  if (error) throw new Error(`保存评报失败: ${error.message}`);
  // 首次生成的原始版本快照
  await writeRevisionQuiet({
    reviewId: data.id,
    version: 1,
    sections,
    finalSummary: params.finalSummary,
    source: "generate",
    changeNote: "首次生成",
  });
  return data.id;
}

/** 快照写入失败不应阻断评报主流程（仅记录日志） */
async function writeRevisionQuiet(params: {
  reviewId: string;
  version: number;
  sections: unknown;
  finalSummary: string;
  source: RevisionSource;
  changeNote?: string;
}): Promise<void> {
  try {
    await writeRevision({ ...params, createdBy: undefined });
  } catch (e) {
    console.error("写入评报版本快照失败（不影响主流程）:", e);
  }
}

// ============================================================================
// 版本快照 + 「更新到当前评报」+ 恢复（WF04-F 协作修改落库）
// ============================================================================

type RevisionSource = "generate" | "followup" | "restore";

/** 把一份评报当前内容写入版本快照表 */
async function writeRevision(params: {
  reviewId: string;
  version: number;
  sections: unknown;
  finalSummary: string;
  source: RevisionSource;
  changeNote?: string;
  createdBy?: string;
}): Promise<void> {
  const { error } = await supabase().from("daily_review_revision").insert({
    review_id: params.reviewId,
    version: params.version,
    sections: JSON.stringify(params.sections),
    final_summary: params.finalSummary,
    source: params.source,
    change_note: params.changeNote ?? null,
    created_by: params.createdBy ?? null,
  });
  if (error) throw new Error(`写入评报版本快照失败: ${error.message}`);
}

/**
 * 用协作修改结果更新当前评报。
 * - 仅允许整体替换最终评报，或替换单个区块（保持其它区块与 conditions 不变）。
 * - 更新前先把当前内容存一份快照（source=followup，附改动说明），保留原始版本。
 * - daily_review.version +1。
 */
export async function applyFollowupRevision(params: {
  reviewId: string;
  /** 要替换的目标区块；不填表示替换最终评报 */
  targetModule?: ReviewModule["type"] | "final_summary";
  finalSummary?: string;
  moduleContent?: { summary?: string }; // 区块级修改目前更新区块摘要；同题/条目保持
  changeNote?: string;
  createdBy?: string;
}): Promise<{ id: string; version: number }> {
  const dba = supabase();
  const { data: cur, error: readErr } = await dba
    .from("daily_review")
    .select("id, version, sections, final_summary")
    .eq("id", params.reviewId)
    .single();
  if (readErr || !cur) throw new Error("评报不存在或已被删除");

  // 1. 先存当前版本快照（保留原始版本，可恢复）
  await writeRevision({
    reviewId: cur.id,
    version: cur.version ?? 1,
    sections: cur.sections,
    finalSummary: cur.final_summary ?? "",
    source: "followup",
    changeNote: params.changeNote,
    createdBy: params.createdBy,
  });

  // 2. 在当前 sections 基础上做定点替换
  let sections: Record<string, unknown> = {};
  try {
    sections =
      typeof cur.sections === "string" ? JSON.parse(cur.sections) : cur.sections ?? {};
  } catch {
    sections = {};
  }

  let nextSummary = cur.final_summary ?? "";
  if (params.targetModule === "final_summary" || !params.targetModule) {
    if (typeof params.finalSummary === "string" && params.finalSummary.trim()) {
      nextSummary = params.finalSummary;
    }
  } else if (params.targetModule && params.moduleContent) {
    const mod = (sections[params.targetModule] as ReviewModule | null) ?? null;
    if (mod) {
      sections[params.targetModule] = {
        ...mod,
        ...(params.moduleContent.summary !== undefined
          ? { summary: params.moduleContent.summary }
          : {}),
      };
    }
  }

  const nextVersion = (cur.version ?? 1) + 1;
  const { error: updErr } = await dba
    .from("daily_review")
    .update({
      sections: JSON.stringify(sections),
      final_summary: nextSummary,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cur.id);
  if (updErr) throw new Error(`更新评报失败: ${updErr.message}`);

  return { id: cur.id, version: nextVersion };
}

/**
 * 「补充要求后重新生成完整评报」：基于当前评报材料 + 用户新要求，
 * 用全新结构化四区块 + 最终评报**全量替换**当前评报为新版本。
 * - 更新前先把当前内容存一份快照（source=followup，附用户要求），保留原版本可恢复。
 * - 保留原 conditions（生成条件/维度等），只替换内容区块与最终评报。
 * - daily_review.version +1。
 */
export async function applyFollowupRegeneration(params: {
  reviewId: string;
  modules: ReviewModule[];
  finalSummary: string;
  changeNote?: string;
  createdBy?: string;
}): Promise<{ id: string; version: number }> {
  const dba = supabase();
  const { data: cur, error: readErr } = await dba
    .from("daily_review")
    .select("id, version, sections, final_summary")
    .eq("id", params.reviewId)
    .single();
  if (readErr || !cur) throw new Error("评报不存在或已被删除");

  // 1. 先存当前版本快照（保留原版本，可恢复）
  await writeRevision({
    reviewId: cur.id,
    version: cur.version ?? 1,
    sections: cur.sections,
    finalSummary: cur.final_summary ?? "",
    source: "followup",
    changeNote: params.changeNote,
    createdBy: params.createdBy,
  });

  // 2. 保留原 conditions，替换四区块内容
  let oldSections: Record<string, unknown> = {};
  try {
    oldSections = typeof cur.sections === "string" ? JSON.parse(cur.sections) : cur.sections ?? {};
  } catch {
    oldSections = {};
  }
  const conditions = oldSections.conditions ?? null;

  const sections: Record<string, unknown> = {
    today_focus: params.modules.find((m) => m.type === "today_focus") ?? null,
    same_topic: params.modules.find((m) => m.type === "same_topic") ?? null,
    peer_highlights: params.modules.find((m) => m.type === "peer_highlights") ?? null,
    gz_daily: params.modules.find((m) => m.type === "gz_daily") ?? null,
    conditions,
  };

  const nextVersion = (cur.version ?? 1) + 1;
  const { error: updErr } = await dba
    .from("daily_review")
    .update({
      sections: JSON.stringify(sections),
      final_summary: params.finalSummary,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cur.id);
  if (updErr) throw new Error(`更新评报失败: ${updErr.message}`);

  return { id: cur.id, version: nextVersion };
}

/** 列出某份评报的版本快照（含当前版本，倒序） */
export async function listReviewRevisions(reviewId: string) {
  const dba = supabase();
  const { data, error } = await dba
    .from("daily_review_revision")
    .select("id, version, source, change_note, created_at, created_by")
    .eq("review_id", reviewId)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`读取版本列表失败: ${error.message}`);
  return data ?? [];
}

/**
 * 恢复到某个历史版本快照：
 * - 恢复前先把当前内容存一份快照（source=restore），确保恢复也可撤销；
 * - 用目标快照内容覆盖 daily_review，version 继续 +1（不复用旧版本号，避免歧义）。
 */
export async function restoreReviewRevision(params: {
  reviewId: string;
  revisionId: string;
  createdBy?: string;
}): Promise<{ id: string; version: number }> {
  const dba = supabase();

  const { data: target, error: revErr } = await dba
    .from("daily_review_revision")
    .select("id, version, sections, final_summary")
    .eq("id", params.revisionId)
    .eq("review_id", params.reviewId)
    .single();
  if (revErr || !target) throw new Error("目标版本不存在");

  const { data: cur, error: readErr } = await dba
    .from("daily_review")
    .select("id, version, sections, final_summary")
    .eq("id", params.reviewId)
    .single();
  if (readErr || !cur) throw new Error("评报不存在或已被删除");

  // 恢复前快照当前内容（可撤销本次恢复）
  await writeRevision({
    reviewId: cur.id,
    version: cur.version ?? 1,
    sections: cur.sections,
    finalSummary: cur.final_summary ?? "",
    source: "restore",
    changeNote: `恢复前自动备份（随后恢复到 v${target.version}）`,
    createdBy: params.createdBy,
  });

  const nextVersion = (cur.version ?? 1) + 1;
  const { error: updErr } = await dba
    .from("daily_review")
    .update({
      sections:
        typeof target.sections === "string" ? target.sections : JSON.stringify(target.sections ?? {}),
      final_summary: target.final_summary ?? "",
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cur.id);
  if (updErr) throw new Error(`恢复评报失败: ${updErr.message}`);

  return { id: cur.id, version: nextVersion };
}
