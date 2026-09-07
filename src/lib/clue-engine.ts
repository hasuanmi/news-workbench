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
}

// ============ AI Prompt ============

const CLUE_SYSTEM_PROMPT = `你是一位资深新闻编辑助手，负责从媒体文章中识别"新闻线索"。

新闻线索的定义（四类）：
1. new_column（新栏目）：媒体新推出的持续性固定栏目，通常标题或正文会提到"新栏目""全新推出""首期"等
2. series（系列报道）：围绕同一主题的连续报道，通常标题含"系列""第X篇""上/中/下"等
3. special_topic（专题）：围绕重大主题形成的专题聚合
4. feature_plan（特色策划）：连续整版/跨版专题、大型调查、融媒体策划、重大主题特别报道

判定标准：
- 必须是具有持续跟踪价值的线索，而非普通日常报道
- 普通消息稿（如"某会议召开""某数据发布"）不算线索
- 如果文章只是常规报道，is_clue 应为 false
- 置信度：你对判断的确信程度（0-1），不确定时给低分

输出格式（严格 JSON，不要 markdown 代码块）：
{
  "is_clue": true/false,
  "clue_type": "new_column" | "series" | "special_topic" | "feature_plan" | null,
  "series_name": "系列/栏目/专题名称（如适用）",
  "series_key": "用于去重的标准化键（如 '人民日报-高质量发展调研行'）",
  "topic": "核心主题（一句话）",
  "tags": ["标签1", "标签2"],
  "summary": "50字以内的线索摘要",
  "confidence": 0.85,
  "reason": "判断理由（30字以内）"
}

如果 is_clue 为 false，clue_type/series_name/series_key/topic 填 null，tags 可为空数组。`;

function buildCluePrompt(article: ArticleForClue): ChatMessage[] {
  const contentSnippet = article.content
    ? article.content.slice(0, 800)
    : "（无正文）";

  return [
    { role: "system", content: CLUE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `媒体：${article.media_name}
标题：${article.title}
发布时间：${article.publish_time}
正文摘要：${contentSnippet}

请判断这篇文章是否为新闻线索。`,
    },
  ];
}

// ============ AI 调用与解析 ============

export async function analyzeArticle(
  article: ArticleForClue,
): Promise<ClueAnalysis> {
  const messages = buildCluePrompt(article);

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

function parseClueResponse(raw: string): ClueAnalysis {
  // 提取 JSON（AI 可能包裹在 ```json ... ``` 中）
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return fallbackAnalysis("AI 返回无法解析为 JSON", raw);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      is_clue: Boolean(parsed.is_clue),
      clue_type: parsed.is_clue
        ? (["new_column", "series", "special_topic", "feature_plan"].includes(parsed.clue_type)
          ? parsed.clue_type
          : null)
        : null,
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

export async function saveClue(
  article: ArticleForClue,
  analysis: ClueAnalysis,
): Promise<{ clueId: string; action: "created" | "updated" | "skipped" }> {
  const thresholds = await getConfidenceThresholds();
  const status = analysis.is_clue
    ? routeByConfidence(analysis.confidence, thresholds)
    : "rejected";

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
          summary: analysis.summary,
          confidence: analysis.confidence,
          tags: JSON.stringify(analysis.tags),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      return { clueId: existing.id, action: "updated" };
    }
  }

  // 新建线索
  const { data, error } = await db
    .from("news_clue")
    .insert({
      article_id: article.id,
      media_id: article.media_id,
      clue_type: analysis.clue_type,
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
    })
    .select("id")
    .single();

  if (error) {
    console.error("写入 news_clue 失败:", error);
    return { clueId: "", action: "skipped" };
  }

  return { clueId: data.id, action: "created" };
}
