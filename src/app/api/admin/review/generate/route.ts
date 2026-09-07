import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";
import { unifiedInvoke } from "@/lib/llm-client";
import type { ReviewModule } from "@/lib/review-types";

export interface ReviewFilter {
  date: string;
  mediaIds: string[];
  minWordCount: number;
  highlightFlags: string[];
  dimensions: string[];
  topics: string[];
  scanMissing: boolean;
  customRequirement?: string;
}

/** 从 app_config 读取配置 */
async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase()
    .from("app_config")
    .select("value")
    .eq("key", key)
    .single();
  if (!data?.value) return fallback;
  return typeof data.value === "string" ? JSON.parse(data.value) : data.value;
}

/** 生成规则 */
interface GenerationRules {
  max_word_count: number;
  modules: { today_focus: boolean; same_topic: boolean; peer_highlights: boolean; gz_daily: boolean };
  same_topic_max: number;
  peer_highlights_max: number;
  summary_max_length: number;
  language_style: string;
}

/** 展示规则 */
interface DisplayRules {
  show_comparison_table: boolean;
  show_media_name: boolean;
  show_article_title: boolean;
  show_article_url: boolean;
  show_evidence: boolean;
}

const DEFAULT_GEN_RULES: GenerationRules = {
  max_word_count: 1000,
  modules: { today_focus: true, same_topic: true, peer_highlights: true, gz_daily: true },
  same_topic_max: 5,
  peer_highlights_max: 5,
  summary_max_length: 200,
  language_style: "专业、客观、简洁",
};

const DEFAULT_DISPLAY_RULES: DisplayRules = {
  show_comparison_table: true,
  show_media_name: true,
  show_article_title: true,
  show_article_url: true,
  show_evidence: true,
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const filter: ReviewFilter = {
    date: body.date || new Date().toISOString(),
    mediaIds: body.mediaIds || [],
    minWordCount: body.minWordCount || 2000,
    highlightFlags: body.highlightFlags || [],
    dimensions: body.dimensions || [],
    topics: body.topics || [],
    scanMissing: body.scanMissing !== false,
    customRequirement: body.customRequirement,
  };

  if (filter.mediaIds.length === 0) {
    return NextResponse.json({ error: "请至少选择一家媒体" }, { status: 400 });
  }

  // 读取生成规则和展示规则
  const genRules = await getConfig<GenerationRules>("review.generation_rules", DEFAULT_GEN_RULES);
  const displayRules = await getConfig<DisplayRules>("review.display_rules", DEFAULT_DISPLAY_RULES);

  const db = supabase();

  // 1. 查询当天文章
  const dateStr = new Date(filter.date).toISOString().split("T")[0];
  const start = `${dateStr}T00:00:00`;
  const end = `${dateStr}T23:59:59`;

  let query = db
    .from("article")
    .select("*")
    .gte("publish_time", start)
    .lte("publish_time", end)
    .gte("word_count", filter.minWordCount)
    .order("publish_time", { ascending: false });

  const { data: articles, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ error: "当天没有符合条件的文章" }, { status: 404 });
  }

  // 2. 批量查媒体名称
  const articleMediaIds = [...new Set(articles.map((a) => a.media_id))];
  const { data: mediaRows } = await db.from("media").select("id, media_name").in("id", articleMediaIds);
  const mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));

  // 3. 构建 AI 输入
  const articlesText = articles
    .map((a) => {
      const mediaName = mediaMap.get(a.media_id) || "未知媒体";
      return `【${mediaName}】${a.title}\n发布时间：${a.publish_time}\n字数：${a.word_count}\n摘要：${a.content?.slice(0, 300) || "无"}\n`;
    })
    .join("\n");

  // 4. 构建启用的模块列表
  const enabledModules: string[] = [];
  if (genRules.modules.today_focus) enabledModules.push("今日重点");
  if (genRules.modules.same_topic) enabledModules.push("同题观察");
  if (genRules.modules.peer_highlights) enabledModules.push("同行亮点");
  if (genRules.modules.gz_daily) enabledModules.push("广州日报观察");

  // 5. 构建系统提示词
  const dimensionLabels: Record<string, string> = {
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

  const systemPrompt = `你是一位资深新闻评报专家，负责对比分析多家媒体同一天的报道，生成结构化评报。

评报输出格式（严格 JSON，不要 markdown 代码块）：
{
  "todayHighlights": {
    "themes": ["共同关注主题 1", "主题 2"],
    "media": ["媒体 1", "媒体 2"],
    "summary": "今日主要报道情况概述（100 字以内）"
  },
  "topicComparison": [
    {
      "topic": "主题名称",
      "rows": [
        {"media": "媒体名", "angle": "报道角度", "feature": "特点", "title": "文章标题", "url": "原文链接"}
      ],
      "aiSummary": "AI 对各媒体报道差异的分析（50 字以内）"
    }
  ],
  "peerHighlights": [
    {
      "media": "媒体名",
      "title": "文章标题",
      "summary": "AI 摘要（50 字以内）",
      "reason": "为什么值得关注（30 字以内）",
      "url": "原文链接（如有）"
    }
  ],
  "finalReview": "最终评报正文（${genRules.max_word_count}字以内，自然语言，分段，包含：今日共同重点、同题报道差异、同行亮点、广州日报可借鉴之处）"
}

注意：
- 如果某部分没有内容，对应数组为空
- finalReview 必须是连贯的自然语言，不要列表格式
- 语言风格：${genRules.language_style}
- 所有分析基于提供的文章数据，不要编造`;

  const userPrompt = `以下是${dateStr}的文章数据（共${articles.length}篇）：

${articlesText}

请根据以下要求生成评报：
- 输出模块：${enabledModules.join("、")}
- 评报维度：${filter.dimensions.map((d) => dimensionLabels[d] || d).join("、")}
${filter.topics.length > 0 ? `- 重点关注主题：${filter.topics.join("、")}` : ""}
${filter.scanMissing ? "- 需要找出\"其他媒体重点报道但广州日报没有重点覆盖\"的内容" : ""}
${filter.customRequirement ? `- 自定义要求：${filter.customRequirement}` : ""}
- 同题主题最多 ${genRules.same_topic_max} 个
- 同行亮点最多 ${genRules.peer_highlights_max} 条

请输出结构化评报 JSON。`;

  try {
    const response = await unifiedInvoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    // 解析 JSON（清理控制字符）
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI 返回无法解析为 JSON");
    }

    let jsonStr = jsonMatch[0];
    jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    jsonStr = jsonStr.replace(/(?<!\\)"/g, '\\"').replace(/\\"/g, '"');

    const result = JSON.parse(jsonStr);

    // 转换为 ReviewModule[] 格式
    const modules: ReviewModule[] = [];

    if (genRules.modules.today_focus && result.todayHighlights) {
      modules.push({
        type: "today_focus",
        summary: result.todayHighlights.summary,
        items: (result.todayHighlights.themes || []).map((theme: string) => ({
          title: theme,
          media: result.todayHighlights.media?.join("、"),
        })),
      });
    }

    if (genRules.modules.same_topic && result.topicComparison) {
      modules.push({
        type: "same_topic",
        topics: (result.topicComparison || []).slice(0, genRules.same_topic_max).map((tc: any) => ({
          theme: tc.topic,
          comparison: (tc.rows || []).map((r: any) => ({
            media: r.media,
            angle: r.angle,
            highlight: r.feature,
            title: r.title,
            url: r.url,
          })),
          analysis: tc.aiSummary,
        })),
      });
    }

    if (genRules.modules.peer_highlights && result.peerHighlights) {
      modules.push({
        type: "peer_highlights",
        items: (result.peerHighlights || []).slice(0, genRules.peer_highlights_max).map((ph: any) => ({
          media: ph.media,
          title: ph.title,
          summary: ph.summary,
          url: ph.url,
          why_noteworthy: ph.reason,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      modules,
      finalSummary: result.finalReview || "",
      display_rules: displayRules,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI 调用失败" }, { status: 500 });
  }
}
