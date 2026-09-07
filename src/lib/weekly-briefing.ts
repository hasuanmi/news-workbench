/**
 * 每周媒体简报引擎（WF06）
 *
 * 读取过去 7 天已发布线索 → AI 二次分析 → 生成四段简报
 * sections: { new_columns, key_series, focus_topics, features }
 * 支持 SSE 流式输出
 */

import { supabase } from "@/lib/db";
import { unifiedStream } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-adapter";

export interface WeeklyBriefingData {
  weekStart: string;
  weekEnd: string;
  clues: Array<{
    id: string;
    clue_type: string | null;
    series_name: string | null;
    topic: string | null;
    summary: string;
    media_name: string;
    tags: string[];
    article_count: number;
  }>;
}

const WEEKLY_SYSTEM_PROMPT = `你是一位资深媒体研究编辑，负责撰写每周媒体简报。

根据本周各媒体发布的新闻线索，从四个维度进行分析：

1. **新栏目动态**（new_columns）：本周各媒体新推出的栏目，分析其定位和特色
2. **重点系列**（key_series）：持续跟踪的重点系列报道，分析进展和亮点
3. **关注专题**（focus_topics）：本周集中报道的专题，分析媒体关注焦点
4. **特色策划**（features）：大型策划/融媒体产品/特别报道，分析创新点

输出要求：
- 每个维度 2-4 个要点
- 语言精炼、专业，适合编辑部内部阅读
- 突出媒体特色和差异化
- 总字数 600-800 字

输出格式（严格 JSON，不要 markdown 代码块）：
{
  "new_columns": "新栏目动态段落（markdown 格式）",
  "key_series": "重点系列段落（markdown 格式）",
  "focus_topics": "关注专题段落（markdown 格式）",
  "features": "特色策划段落（markdown 格式）",
  "summary": "100字以内的本周总览"
}`;

export async function getWeeklyClues(weekStart: string): Promise<WeeklyBriefingData> {
  const db = supabase();
  const startDate = new Date(weekStart);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const start = startDate.toISOString().split("T")[0] + "T00:00:00";
  const end = endDate.toISOString().split("T")[0] + "T23:59:59";

  const { data: clues, error } = await db
    .from("news_clue")
    .select("*")
    .in("review_status", ["auto_approved", "approved"])
    .gte("first_found_at", start)
    .lte("first_found_at", end)
    .order("first_found_at", { ascending: false });

  if (error) throw new Error(`查询线索失败: ${error.message}`);

  // 批量查媒体名称
  const mediaIds = [...new Set((clues ?? []).map((c) => c.media_id))];
  let mediaMap = new Map<string, string>();
  if (mediaIds.length > 0) {
    const { data: mediaRows } = await db
      .from("media")
      .select("id, media_name")
      .in("id", mediaIds);
    mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));
  }

  return {
    weekStart,
    weekEnd: endDate.toISOString().split("T")[0],
    clues: (clues ?? []).map((c) => ({
      id: c.id,
      clue_type: c.clue_type,
      series_name: c.series_name,
      topic: c.topic,
      summary: c.summary,
      media_name: mediaMap.get(c.media_id) ?? "未知媒体",
      tags: typeof c.tags === "string" ? safeJsonParse(c.tags, []) : c.tags,
      article_count: c.article_count,
    })),
  };
}

export function buildWeeklyPrompt(data: WeeklyBriefingData): ChatMessage[] {
  const clueSummary = data.clues
    .map((c) => {
      const type = c.clue_type ?? "未分类";
      return `- [${c.media_name}] (${type}) ${c.series_name || c.topic || c.summary}`;
    })
    .join("\n");

  return [
    { role: "system", content: WEEKLY_SYSTEM_PROMPT },
    {
      role: "user",
      content: `本周时间范围：${data.weekStart} 至 ${data.weekEnd}
共 ${data.clues.length} 条线索：

${clueSummary || "（本周暂无线索）"}

请生成本周媒体简报。`,
    },
  ];
}

export async function* generateWeeklyBriefing(
  data: WeeklyBriefingData,
): AsyncGenerator<string> {
  if (data.clues.length === 0) {
    yield "本周暂无新闻线索，无法生成简报。";
    return;
  }

  const messages = buildWeeklyPrompt(data);

  let fullContent = "";
  for await (const chunk of unifiedStream(messages, { temperature: 0.3 })) {
    if (chunk.content) {
      fullContent += chunk.content;
      yield chunk.content;
    }
  }

  // 尝试解析 JSON 并保存
  const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const db = supabase();
      await db.from("weekly_brief").insert({
        week_start: data.weekStart,
        sections: JSON.stringify({
          new_columns: parsed.new_columns || "",
          key_series: parsed.key_series || "",
          focus_topics: parsed.focus_topics || "",
          features: parsed.features || "",
        }),
        final_summary: parsed.summary || "",
        review_status: "pending",
      });
    } catch (err) {
      console.error("保存周报失败:", err);
    }
  }
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
