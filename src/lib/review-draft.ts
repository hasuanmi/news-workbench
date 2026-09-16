/**
 * 每日评报 · 阶段1：本期选稿（M4 增强）
 *
 * 目标媒体固定为后台配置 review.comparison_media（广州日报 / 南方日报 / 南方都市报 /
 * 新快报 / 羊城晚报 / 信息时报），前台不再每天勾选媒体。
 *
 * 流程：
 *   1. 规则层筛选文章（日期 / 目标媒体 / 字数 / 去重）
 *   2. AI 高亮分组：同题报道（按选题分组）+ 同行独有报道（其他媒体重点、广州日报当天无对应）
 *      + 新华社通稿背景（多家转新华社同一通稿 → 作为共同重大新闻背景，不作各媒体比较）
 *   3. 落库 review_draft（可追溯、可排除、可版本）
 */

import { supabase } from "@/lib/db";
import { unifiedInvoke } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-adapter";
import {
  fetchReviewArticles,
  type ReviewArticle,
  type ReviewConditions,
} from "@/lib/review-engine";

export interface DraftArticle {
  article_id: string;
  media: string;
  title: string;
  url: string;
  publish_time: string;
  is_xinhua_reprint: boolean;
  xinhua_original: string | null;
  original_added: boolean; // 是否在通稿基础上新增本地/原创内容
  why?: string; // 同行独有/值得关注的理由
}

export interface SameTopicGroup {
  id: string;
  theme: string;
  articles: DraftArticle[];
  angle_note: string; // 各媒体切入角度差异
}

export interface PeerHighlight {
  media: string;
  article_id: string;
  title: string;
  url: string;
  publish_time: string;
  why_noteworthy: string; // 为什么值得广州日报关注
}

export interface DraftPayload {
  same_topic: SameTopicGroup[];
  peer_highlights: PeerHighlight[];
  xinhua_background: DraftArticle[]; // 多家转新华社同一通稿 → 共同背景
  excluded_article_ids: string[];
}

export interface DraftRow {
  id: string;
  report_date: string;
  draft: DraftPayload;
  status: string;
  min_word_count: number;
  excluded_article_ids: string[];
  created_at: string;
}

export const DEFAULT_COMPARISON_MEDIA = [
  "广州日报",
  "南方日报",
  "南方都市报",
  "新快报",
  "羊城晚报",
  "信息时报",
];

async function getConfigRaw<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase()
    .from("app_config")
    .select("value")
    .eq("key", key)
    .single();
  if (!data?.value) return fallback;
  try {
    return typeof data.value === "string" ? JSON.parse(data.value) : (data.value as T);
  } catch {
    return fallback;
  }
}

/** 目标比较媒体（按名称解析为 media_id）；缺省用固定六家。 */
export async function resolveComparisonMedia(mediaIds?: string[]): Promise<{
  mediaIds: string[];
  mediaNames: string[];
}> {
  const cfg = await getConfigRaw<string[]>("review.comparison_media", DEFAULT_COMPARISON_MEDIA);
  const names = Array.isArray(cfg) && cfg.length ? cfg : DEFAULT_COMPARISON_MEDIA;

  // 显式传入的 mediaIds 优先；否则用固定六家按名称匹配
  if (Array.isArray(mediaIds) && mediaIds.length > 0) {
    const { data: m2 } = await supabase().from("media").select("id, media_name").in("id", mediaIds);
    return {
      mediaIds: (m2 ?? []).map((x) => x.id),
      mediaNames: (m2 ?? []).map((x) => x.media_name),
    };
  }

  const { data: rows } = await supabase()
    .from("media")
    .select("id, media_name")
    .eq("enabled", true)
    .in("media_name", names);
  return {
    mediaIds: (rows ?? []).map((m) => m.id),
    mediaNames: (rows ?? []).map((m) => m.media_name),
  };
}

// ============ 选稿默认规则（后台统一维护，前台不再逐次勾选） ============

export interface SelectionRules {
  min_word_count: number;
  highlight_flags: string[];
  dimensions: string[];
  scan_missing: boolean;
  exclude_xinhua_reprint: boolean;
}

export const DEFAULT_SELECTION_RULES: SelectionRules = {
  min_word_count: 2000,
  highlight_flags: ["front_page", "full_page", "cross_page", "series", "special"],
  dimensions: ["topic", "timeliness", "angle", "depth", "presentation"],
  scan_missing: true,
  exclude_xinhua_reprint: true,
};

/** 读取后台统一维护的选稿默认规则（review.selection_rules） */
export async function getSelectionRules(): Promise<SelectionRules> {
  return getConfigRaw<SelectionRules>("review.selection_rules", DEFAULT_SELECTION_RULES);
}

/** 由后台默认规则 + 前台临时可选项组装完整选稿条件（前台只传 date/topics/customRequirement） */
export async function buildConditionsFromRules(partial: {
  date?: string;
  topics?: string[];
  customRequirement?: string;
  minWordCount?: number;
  highlightFlags?: string[];
  dimensions?: string[];
  scanMissing?: boolean;
}): Promise<ReviewConditions> {
  const rules = await getSelectionRules();
  const { mediaIds } = await resolveComparisonMedia();
  return {
    date: partial.date || new Date().toISOString(),
    mediaIds,
    minWordCount: typeof partial.minWordCount === "number" ? partial.minWordCount : rules.min_word_count,
    highlightFlags: Array.isArray(partial.highlightFlags) ? partial.highlightFlags : rules.highlight_flags,
    dimensions: Array.isArray(partial.dimensions) ? partial.dimensions : rules.dimensions,
    topics: Array.isArray(partial.topics) ? partial.topics : [],
    scanMissing: partial.scanMissing ?? rules.scan_missing,
    customRequirement: partial.customRequirement,
  };
}

// ============ 新华社来源识别 ============

const XINHUA_PATTERNS = [/新华社\s*\d+/, /新华社(?!社)/, /新华社[^\s。，,]{0,8}电/, /Xinhua/i];

export function isXinhuaArticle(a: ReviewArticle): { isXinhua: boolean; span: string | null } {
  const source = [a.title, a.snippet, a.section ?? ""].join(" ");
  const match = source.match(/(新华社[^\s。，,]{0,20})/);
  return { isXinhua: Boolean(match), span: match?.[1] ?? null };
}

/** 判断是"纯转载"还是"在通稿基础上新增原创"（新增才纳入比较） */
export function isXinhuaReprint(a: ReviewArticle): boolean {
  const d = isXinhuaArticle(a);
  if (!d.isXinhua) return false;
  const text = [a.title, a.snippet].join(" ");
  // 出现本地采访/案例/原创数据等词汇 → 视为有新增原创，不当作纯转载
  const localAdded = /采访|现场|了解到|我们走访|数据显示|统计|独家|本地|探访|记者走访|新增|原创/.test(text);
  return d.isXinhua && !localAdded;
}

// ============ AI 选稿：同题分组 + 同行独有 + 新华社背景 ============

function buildDraftMessages(
  dateStr: string,
  articles: ReviewArticle[],
  gzMediaNames: string[],
  conditions: ReviewConditions,
): ChatMessage[] {
  const picks = articles
    .map(
      (a, i) =>
        `[${i}] 媒体：${a.media_name}｜标题：${a.title}｜字数：${a.word_count}${a.section ? `｜版面：${a.section}` : ""}｜摘要：${a.snippet}｜链接：${a.url}`,
    )
    .join("\n");

  const system = `你是资深新闻评报选稿编辑，负责从当天多家媒体的报道中筛出"本期参与评报"的稿件，并完成分组与新华社通稿识别。严格输出 JSON（不要 markdown 代码块、不要多余文字）。

输出结构：
{
  "same_topic": [
    {
      "theme": "共同选题名称",
      "article_indexes": [0, 5, 9],
      "angle_note": "各媒体切入角度差异（30字内）"
    }
  ],
  "peer_highlights": [
    { "media": "媒体名", "index": 3, "why_noteworthy": "为什么值得广州日报关注（30字内）" }
  ],
  "xinhua_background_indexes": [4, 7]
}

规则：
1. same_topic：同一选题有多家媒体（≥2）报道才分组；每组给出 article_indexes（对应输入序号），并简要说明各媒体角度差异。最多 ${5} 组。
2. peer_highlights：其他媒体有重点报道、但 ${gzMediaNames.join("、") || "广州日报"} 当天没有明显对应报道的内容；每篇给出 media/index/why_noteworthy。最多 ${5} 条。
3. xinhua_background_indexes：多家媒体只是转载新华社同一通稿、无各自原创采编的稿子归入此列——作为当天共同重大新闻背景展示，不参与各媒体比较。识别依据：来源含"新华社""新华社记者""新华社××电"或原始来源字段。若某家媒体在通稿基础上增加了本地采访/本地案例/原创数据/原创延伸，则不要归入此列，而应放入对应 same_topic 中比较其新增原创部分。
4. 所有 index 均取自输入序号；同一篇文章可同时出现在 same_topic 与 xinhua_background（作为背景背景同时展示）。
5. 普通日常报道不要选入；必须基于给定文章，禁止编造链接和标题。`;

  const user = `评报日期：${dateStr}
参与媒体：${[...new Set(articles.map((a) => a.media_name))].join("、")}
共 ${articles.length} 篇待选文章：

${picks}

${conditions.customRequirement ? `本次要求：${conditions.customRequirement}` : ""}
请输出选稿分组 JSON。`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function safeParseJson(raw: string): Record<string, any> {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI 返回无法解析为 JSON");
  let s = m[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  try {
    return JSON.parse(s);
  } catch {
    s = s.replace(/(?<!\\)"/g, '\\"').replace(/\\"/g, '"');
    return JSON.parse(s);
  }
}

function toDraftArticle(a: ReviewArticle, suffix = ""): DraftArticle {
  const isXin = isXinhuaArticle(a);
  return {
    article_id: a.id,
    media: a.media_name,
    title: a.title + (suffix || ""),
    url: a.url,
    publish_time: a.publish_time,
    is_xinhua_reprint: isXinhuaReprint(a),
    xinhua_original: isXin.isXinhua ? isXin.span : null,
    original_added: isXin.isXinhua && !isXinhuaReprint(a),
  };
}

/** 阶段1：筛选 + AI 分组，返回选稿结果（未落库） */
export async function buildDraft(conditions: ReviewConditions, dateStr: string, articles: ReviewArticle[], gzMediaNames: string[]): Promise<DraftPayload> {
  const messages = buildDraftMessages(dateStr, articles, gzMediaNames, conditions);
  const raw = await unifiedInvoke(messages, { temperature: 0.2 });
  const parsed = safeParseJson(raw);

  const index = (i: unknown) => {
    const n = typeof i === "number" ? i : Number.parseInt(String(i), 10);
    return Number.isFinite(n) ? n : -1;
  };
  const articleAt = (i: number): ReviewArticle | null => (i >= 0 && i < articles.length ? articles[i] : null);

  const same_topic: SameTopicGroup[] = (Array.isArray(parsed.same_topic) ? parsed.same_topic : [])
    .filter((g) => Array.isArray(g?.article_indexes))
    .slice(0, 5)
    .map((g: any, idx: number) => ({
      id: `st-${idx}`,
      theme: String(g.theme ?? `同题${idx + 1}`),
      articles: g.article_indexes
        .map((i: unknown) => articleAt(index(i)))
        .filter((a: ReviewArticle | null): a is ReviewArticle => Boolean(a))
        .map((a: ReviewArticle) => toDraftArticle(a)),
      angle_note: String(g.angle_note ?? ""),
    }))
    .filter((g: SameTopicGroup) => g.articles.length >= 1);

  const peer_highlights: PeerHighlight[] = (Array.isArray(parsed.peer_highlights) ? parsed.peer_highlights : [])
    .slice(0, 5)
    .map((p: any) => {
      const a = articleAt(index(p?.index));
      if (!a) return null;
      return {
        media: a.media_name,
        article_id: a.id,
        title: a.title,
        url: a.url,
        publish_time: a.publish_time,
        why_noteworthy: String(p?.why_noteworthy ?? ""),
      };
    })
    .filter((p: PeerHighlight | null): p is PeerHighlight => Boolean(p));

  const xinhua_background: DraftArticle[] = (Array.isArray(parsed.xinhua_background_indexes)
    ? parsed.xinhua_background_indexes
    : [])
    .map((i: unknown) => articleAt(index(i)))
    .filter((a: ReviewArticle | null): a is ReviewArticle => Boolean(a))
    .map((a: ReviewArticle) => toDraftArticle(a, "（新华社通稿/共同背景）"));

  return { same_topic, peer_highlights, xinhua_background, excluded_article_ids: [] };
}

// ============ 落库 / 读取 / 排除 ============

export async function saveDraft(params: {
  report_date: string;
  draft: DraftPayload;
  min_word_count: number;
  conditions: ReviewConditions;
  created_by?: string;
}): Promise<DraftRow> {
  const db = supabase();
  const existing = await db
    .from("review_draft")
    .select("id")
    .eq("report_date", params.report_date)
    .maybeSingle();

  const draftPayload = {
    ...params.draft,
    conditions: {
      minWordCount: params.conditions.minWordCount,
      dimensions: params.conditions.dimensions,
      topics: params.conditions.topics,
      scanMissing: params.conditions.scanMissing,
      customRequirement: params.conditions.customRequirement ?? "",
    },
  };

  if (existing.data?.id) {
    const { data } = await db
      .from("review_draft")
      .update({ draft: draftPayload, status: "selected", updated_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select()
      .single();
    return data as DraftRow;
  }

  const { data, error } = await db
    .from("review_draft")
    .insert({
      report_date: params.report_date,
      draft: draftPayload,
      status: "selected",
      min_word_count: params.min_word_count,
      excluded_article_ids: [],
      created_by: params.created_by || null,
    })
    .select()
    .single();
  if (error) throw new Error(`保存选稿失败: ${error.message}`);
  return data as DraftRow;
}

export async function loadDraftByDate(report_date: string): Promise<DraftRow | null> {
  const db = supabase();
  const { data } = await db
    .from("review_draft")
    .select("*")
    .eq("report_date", report_date)
    .maybeSingle();
  if (!data) return null;
  let draft: DraftPayload;
  try {
    draft = typeof data.draft === "string" ? JSON.parse(data.draft) : data.draft;
  } catch {
    draft = { same_topic: [], peer_highlights: [], xinhua_background: [], excluded_article_ids: [] };
  }
  return {
    ...data,
    draft,
    excluded_article_ids: Array.isArray(data.excluded_article_ids)
      ? data.excluded_article_ids
      : (data.excluded_article_ids ? JSON.parse(data.excluded_article_ids) : []),
  } as DraftRow;
}

export async function updateDraftExclusions(report_date: string, excluded: string[]): Promise<void> {
  const db = supabase();
  await db
    .from("review_draft")
    .update({ excluded_article_ids: JSON.stringify(excluded), updated_at: new Date().toISOString() })
    .eq("report_date", report_date);
}

/** 获取带规则层的完整选稿数据（供生成阶段复用已确认稿件） */
export async function getDraftWithArticles(report_date: string): Promise<{
  draft: DraftPayload;
  conditions: ReviewConditions;
  articles: ReviewArticle[];
  gzMediaNames: string[];
} | null> {
  const row = await loadDraftByDate(report_date);
  if (!row) return null;
  const rd = row.draft as DraftPayload;
  const cond = (rd as any).conditions as Partial<ReviewConditions> | undefined;
  const { mediaIds, mediaNames } = await resolveComparisonMedia(
    Array.isArray((rd as any).conditions?.mediaIds) && (rd as any).conditions.mediaIds.length
      ? (rd as any).conditions.mediaIds
      : undefined,
  );
  const conditions: ReviewConditions = {
    date: `${report_date}T12:00:00`,
    mediaIds,
    minWordCount: cond?.minWordCount ?? row.min_word_count ?? 2000,
    highlightFlags: [],
    dimensions: cond?.dimensions ?? [],
    topics: cond?.topics ?? [],
    scanMissing: cond?.scanMissing ?? true,
    customRequirement: cond?.customRequirement,
  };
  const fetched = await fetchReviewArticles(conditions);
  // 排除稿以 review_draft.excluded_article_ids 列（客户端可追溯排除）为准
  const effectiveExcluded = Array.isArray(row.excluded_article_ids) ? row.excluded_article_ids : [];
  return {
    draft: { ...rd, excluded_article_ids: effectiveExcluded },
    conditions,
    articles: fetched.articles,
    gzMediaNames: fetched.gzMediaNames,
  };
}