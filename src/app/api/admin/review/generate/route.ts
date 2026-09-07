import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";
import { unifiedInvoke } from "@/lib/llm-client";

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

const REVIEW_SYSTEM_PROMPT = `你是一位资深新闻评报专家，负责对比分析多家媒体同一天的报道，生成结构化评报。

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
        {"media": "媒体名", "angle": "报道角度", "feature": "特点"}
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
  "finalReview": "最终评报正文（800-1000 字，自然语言，分段，包含：今日共同重点、同题报道差异、同行亮点、广州日报可借鉴之处）"
}

注意：
- 如果某部分没有内容，对应数组为空
- finalReview 必须是连贯的自然语言，不要列表格式
- 所有分析基于提供的文章数据，不要编造`;

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
  const mediaIds = [...new Set(articles.map((a) => a.media_id))];
  const { data: mediaRows } = await db.from("media").select("id, media_name").in("id", mediaIds);
  const mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));

  // 3. 构建 AI 输入
  const articlesText = articles
    .map((a) => {
      const mediaName = mediaMap.get(a.media_id) || "未知媒体";
      return `【${mediaName}】${a.title}\n发布时间：${a.publish_time}\n字数：${a.word_count}\n摘要：${a.content?.slice(0, 300) || "无"}\n`;
    })
    .join("\n");

  // 4. 调用 AI
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

  const userPrompt = `以下是${dateStr}的文章数据（共${articles.length}篇）：

${articlesText}

请根据以下要求生成评报：
- 评报维度：${filter.dimensions.map((d) => dimensionLabels[d] || d).join("、")}
${filter.topics.length > 0 ? `- 重点关注主题：${filter.topics.join("、")}` : ""}
${filter.scanMissing ? "- 需要找出\"其他媒体重点报道但广州日报没有重点覆盖\"的内容" : ""}
${filter.customRequirement ? `- 自定义要求：${filter.customRequirement}` : ""}

请输出结构化评报 JSON。`;

  try {
    const response = await unifiedInvoke([
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    // 解析 JSON（清理控制字符）
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI 返回无法解析为 JSON");
    }

    let jsonStr = jsonMatch[0];
    // 移除控制字符（保留换行和制表符）
    jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    // 转义未转义的引号
    jsonStr = jsonStr.replace(/(?<!\\)"/g, '\\"').replace(/\\"/g, '"');

    const result = JSON.parse(jsonStr);

    return NextResponse.json({ success: true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI 调用失败" }, { status: 500 });
  }
}
