/**
 * 线索识别引擎（WF04）
 *
 * 输入：单篇文章（title + content）
 * 输出：AI 结构化判定 JSON → 按置信度路由
 *
 * 置信度路由（配置驱动）：
 *   ≥ ai.confidence_auto (0.85) → auto_approved
 *   ≥ ai.confidence_review (0.6) → pending_review
 *   < ai.confidence_review → rejected
 *
 * 系列去重：同一 media + series_key 的线索合并，更新 article_count / last_seen_at
 */

import { supabase } from "@/lib/db";
import { unifiedInvoke } from "@/lib/llm-client";
import { getAppConfig } from "@/lib/config";
import type { ChatMessage } from "@/lib/llm-adapter";

// ============ 类型 ============

export interface ClueAnalysis {
  is_clue: boolean;
  clue_type: "new_column" | "series" | "special_topic" | "feature_plan" | null;
  series_name: string | null;
  series_key: string | null;
  topic: string | null;
  tags: string[];
  summary: string;
  confidence: number;
  reason: string;
}

export interface ArticleForClue {
  id: string;
  title: string;
  content: string | null;
  media_id: string;
  media_name: string;
  publish_time: string;
  url?: string | null;
}

// ============ AI Prompt ============

const CLUE_SYSTEM_PROMPT = `你是一位资深新闻编辑助手，负责从媒体文章中识别"新闻线索"。

线索 V1 只关注一类：new_column（新栏目）。

new_column（新栏目）的识别依据：
1. 出现"开栏语""开栏的话""编者的话（开栏）"等开栏文字
2. 明确宣示"推出××栏目""即日起开设××栏目""全新推出""首期上线"
3. 出现新的、固定的栏目名称，并伴随栏目策划说明
4. 短时间连续出现多篇同一（新）栏目名文章

判定标准：
- 必须是"新出现"的持续性固定栏目，而非普通日常报道
- 普通消息稿（如"某会议召开""某数据发布"）不算线索
- 已有的、早已存在的栏目（非新推出）不算"新栏目"
- 系列报道、专题、特色策划等一律不是 V1 线索：如识别到这类内容，is_clue 应为 false
- 如果文章只是常规报道，is_clue 应为 false
- 置信度：你对"是否为新栏目"判断的确信程度（0-1），不确定时给低分

输出格式（严格 JSON，不要 markdown 代码块）：
{
  "is_clue": true/false,
  "clue_type": "new_column" | null,
  "series_name": "新栏目名称（如适用）",
  "series_key": "用于去重的标准化键（如 '南方日报-湾区观察'）",
  "topic": "栏目定位主题（一句话）",
  "tags": ["标签1", "标签2"],
  "summary": "50字以内的线索摘要",
  "confidence": 0.85,
  "reason": "判断理由（30字以内，重点给出栏目名称与开栏证据）"
}

is_clue 为 true 时 clue_type 只能为 "new_column"；否则 clue_type 填 null。`;

function buildCluePrompt(article: ArticleForClue, options?: ClueAnalysisOptions): ChatMessage[] {
  const contentSnippet = article.content
    ? article.content.slice(0, 800)
    : "（无正文）";

  // 构建动态条件
  let userContext = "";
  if (options?.topics && options.topics.length > 0) {
    userContext += `\n重点主题：${options.topics.join("、")}`;
  }
  if (options?.customRequirement) {
    userContext += `\n自定义要求：${options.customRequirement}`;
  }

  return [
    { role: "system", content: CLUE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `媒体：${article.media_name}
标题：${article.title}
发布时间：${article.publish_time}
正文摘要：${contentSnippet}
${userContext}

请判断这篇文章是否为"新栏目"线索。`,
    },
  ];
}

// ============ AI 调用与解析 ============

export interface ClueAnalysisOptions {
  clueTypes?: string[];
  topics?: string[];
  customRequirement?: string;
}

export async function analyzeArticle(
  article: ArticleForClue,
  options?: ClueAnalysisOptions,
): Promise<ClueAnalysis> {
  const messages = buildCluePrompt(article, options);

  let raw: string;
  try {
    raw = await unifiedInvoke(messages, { temperature: 0.1 });
  } catch (err) {
    console.error("线索识别 AI 调用失败:", err);
    return {
      is_clue: false,
      clue_type: null,
      series_name: null,
      series_key: null,
      topic: null,
      tags: [],
      summary: "AI 调用失败",
      confidence: 0,
      reason: `AI 调用异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return parseClueResponse(raw);
}

// 线索 V1 只保留 new_column；历史 series/special_topic/feature_plan 数据保留但不再作为识别目标
const CLUE_TYPE_ALIASES: Record<string, string> = {
  new_column: "new_column",
  column: "new_column",
  newcolumn: "new_column",
  新栏目: "new_column",
  栏目: "new_column",
};

function normalizeClueType(raw: unknown): "new_column" | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = raw.trim().toLowerCase();
  const mapped = CLUE_TYPE_ALIASES[key] ?? CLUE_TYPE_ALIASES[key.replace(/[\s_-]+/g, "")];
  return mapped === "new_column" ? "new_column" : null;
}

function parseClueResponse(raw: string): ClueAnalysis {
  // 提取 JSON（AI 可能包裹在 ```json ... ``` 中）
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return fallbackAnalysis("AI 返回无法解析为 JSON", raw);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const isClue = Boolean(parsed.is_clue);
    const clueType = normalizeClueType(parsed.clue_type);
    return {
      // V1 线索只认 new_column；AI 判是线索但类型归不出 new_column 时视为非线索
      is_clue: isClue && clueType === "new_column",
      clue_type: isClue && clueType === "new_column" ? "new_column" : null,
      series_name: parsed.series_name || null,
      series_key: parsed.series_key || null,
      topic: parsed.topic || null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === "string") : [],
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "",
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
    };
  } catch {
    return fallbackAnalysis("JSON 解析失败", raw);
  }
}

function fallbackAnalysis(reason: string, raw: string): ClueAnalysis {
  return {
    is_clue: false,
    clue_type: null,
    series_name: null,
    series_key: null,
    topic: null,
    tags: [],
    summary: "",
    confidence: 0,
    reason: `${reason}: ${raw.slice(0, 100)}`,
  };
}

// ============ 置信度路由 ============

export function routeByConfidence(
  confidence: number,
  thresholds: { auto: number; review: number },
): "auto_approved" | "pending_review" | "rejected" {
  if (confidence >= thresholds.auto) return "auto_approved";
  if (confidence >= thresholds.review) return "pending_review";
  return "rejected";
}

async function getConfidenceThresholds(): Promise<{ auto: number; review: number }> {
  const config = await getAppConfig();
  return {
    auto: config.clueAutoThreshold || 0.85,
    review: config.clueReviewThreshold || 0.6,
  };
}

// ============ 写入 news_clue（含系列去重） ============

/**
 * 把命中的文章快照写入线索-文章关联表（供前台展示关联原文 + 新鲜度）。
 * 幂等：同一 (clue_id, article_id) 不重复写；命中已存在时更新标题/链接/发布时间。
 */
async function recordClueArticle(clueId: string, article: ArticleForClue): Promise<void> {
  const db = supabase();
  await db.from("news_clue_article").upsert(
    {
      clue_id: clueId,
      article_id: article.id,
      title: article.title,
      url: article.url || null,
      publish_time: article.publish_time || null,
      media_id: article.media_id,
    },
    { onConflict: "clue_id,article_id" },
  );
}

export async function saveClue(
  article: ArticleForClue,
  analysis: ClueAnalysis,
): Promise<{ clueId: string; action: "created" | "updated" | "skipped"; clue?: any }> {
  // V1: 所有线索都设为 pending，由用户手动确认
  const status = analysis.is_clue ? "pending" : "rejected";

  const db = supabase();

  // 系列去重：同 media + series_key 已有线索 → 更新
  if (analysis.is_clue && analysis.series_key) {
    const { data: existing } = await db
      .from("news_clue")
      .select("id")
      .eq("media_id", article.media_id)
      .eq("series_key", analysis.series_key)
      .maybeSingle();

    if (existing) {
      const { data: current } = await db
        .from("news_clue")
        .select("article_count")
        .eq("id", existing.id)
        .single();
      const count = (current?.article_count ?? 0) + 1;

      await db
        .from("news_clue")
        .update({
          article_count: count,
          last_seen_at: new Date().toISOString(),
          // 同步最新一篇原文的发布时间（新鲜度取 max）
          recent_article_at: article.publish_time || new Date().toISOString(),
          summary: analysis.summary,
          confidence: analysis.confidence,
          tags: JSON.stringify(analysis.tags),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      // 落关联明细
      await recordClueArticle(existing.id, article);

      const { data: updatedClue } = await db
        .from("news_clue")
        .select("*")
        .eq("id", existing.id)
        .single();

      return { clueId: existing.id, action: "updated", clue: updatedClue };
    }
  }

  // 非线索文章不写入 news_clue（保留 rejected 由上层计数），避免 null 约束错误
  if (!analysis.is_clue) {
    return { clueId: "", action: "skipped" };
  }

  // 新建线索（is_clue 必为 true，兜底非法类型）
  const finalType = analysis.clue_type ?? "feature_plan";
  const { data, error } = await db
    .from("news_clue")
    .insert({
      article_id: article.id,
      media_id: article.media_id,
      clue_type: finalType,
      series_name: analysis.series_name,
      series_key: analysis.series_key || `${article.media_id}:${article.id}`,
      topic: analysis.topic,
      summary: analysis.summary,
      tags: JSON.stringify(analysis.tags),
      reason: analysis.reason,
      confidence: analysis.confidence,
      review_status: status,
      article_count: 1,
      first_found_at: article.publish_time,
      last_seen_at: article.publish_time,
      recent_article_at: article.publish_time || new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("写入 news_clue 失败:", error);
    return { clueId: "", action: "skipped" };
  }

  // 落关联明细
  await recordClueArticle(data.id, article);

  return { clueId: data.id, action: "created", clue: data };
}
