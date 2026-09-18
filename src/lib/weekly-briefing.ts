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

根据本周各媒体发布的新闻线索撰写简报，用中文、Markdown 格式、纯正文输出（不要输出 JSON、不要代码块）。

简报结构必须严格使用以下四个二级标题（## 标题），标题文案保持一致：

本周总览
（用 100 字左右概括本周媒体动态特点，放在最前面，不加二级标题）

## 新栏目动态
本周各媒体新推出的栏目，说明其定位和特色

## 重点系列
持续跟踪的重点系列报道，分析进展和亮点

## 关注专题
本周集中报道的专题，分析媒体关注焦点

## 特色策划
大型策划/融媒体产品/特别报道，分析创新点

输出要求：
- 每个维度 2-4 个要点，可使用无序列表
- 要点中注明媒体名称，如「南方日报《大湾区深度调研行》」
- 语言精炼、专业，适合编辑部内部阅读
- 突出媒体特色和差异化
- 总字数 600-800 字
- 只输出简报正文，不要任何额外说明`;

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
    .eq("is_test", false)
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

  // 按 Markdown 标题拆分为四段 + 总览段保存
  try {
    const parsed = parseMarkdownBriefing(fullContent);
    const db = supabase();
    await db.from("weekly_brief").insert({
      week_start: data.weekStart,
      sections: JSON.stringify({
        new_columns: parsed.new_columns,
        key_series: parsed.key_series,
        focus_topics: parsed.focus_topics,
        features: parsed.features,
      }),
      final_summary: parsed.summary,
      review_status: "pending",
    });
  } catch (err) {
    console.error("保存周报失败:", err);
  }
}

/** 将 Markdown 简报按二级标题拆分为结构化段落 */
export function parseMarkdownBriefing(markdown: string): {
  summary: string;
  new_columns: string;
  key_series: string;
  focus_topics: string;
  features: string;
} {
  const headingRegex = /^##\s+(.+)$/;
  const lines = markdown.split("\n");
  const sections: Record<string, string[]> = {};
  const preamble: string[] = [];
  let currentKey: string | null = null;

  const headingToKey: Record<string, string> = {
    新栏目动态: "new_columns",
    重点系列: "key_series",
    关注专题: "focus_topics",
    特色策划: "features",
  };

  for (const line of lines) {
    const m = line.match(headingRegex);
    if (m) {
      const title = m[1].trim();
      currentKey = headingToKey[title] ?? null;
      if (currentKey) sections[currentKey] = [];
      continue;
    }
    if (currentKey && sections[currentKey]) {
      sections[currentKey].push(line);
    } else {
      preamble.push(line);
    }
  }

  const clean = (arr: string[] | undefined) => (arr ?? []).join("\n").trim();
  return {
    summary: preamble.join("\n").replace(/^#.*$/gm, "").trim(),
    new_columns: clean(sections.new_columns),
    key_series: clean(sections.key_series),
    focus_topics: clean(sections.focus_topics),
    features: clean(sections.features),
  };
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
