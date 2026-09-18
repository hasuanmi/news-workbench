/**
 * 每日评报「补充要求 → 重新生成完整评报」（WF04-F 重构）
 *
 * 本功能不是普通聊天问答，而是「用户补充要求后重新生成一版完整每日评报」：
 * - 输入：用户新增要求（对本期的补充/调整意见）。
 * - 依据：本期选稿 / 同题聚类 / 同行独有 / 原始评报（四区块结构化 + 最终评报）。
 * - 输出：全新结构化四区块（今日重点 / 同题观察 / 同行亮点 / 广州日报观察）+ 最终评报。
 * - 由路由层调用 applyFollowupRegeneration 全量替换保存为新版本（原版本留快照可恢复）。
 *
 * 架构：
 * - 复用统一 LLM 出口 unifiedInvoke（结构化 JSON）/ unifiedStream（最终评报流式）。
 * - 结构化部分非流式，最终评报流式（SSE 打字机）。
 * - 不直接碰 DB（由路由层读取已保存评报传入，生成后由路由层落库）。
 */

import { unifiedInvoke, unifiedStream, type LLMStreamChunk } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-adapter";
import type { ReviewModule } from "@/lib/review-types";

const MODULE_LABELS: Record<string, string> = {
  today_focus: "今日重点",
  same_topic: "同题观察",
  peer_highlights: "同行亮点",
  gz_daily: "广州日报观察",
};

/** 本次评报的完整上下文（由路由从 daily_review.sections + final_summary 还原） */
export interface ReviewContextInput {
  reportDate: string;
  modules: ReviewModule[];
  finalSummary: string;
  /** 本次对比媒体名单 */
  mediaNames?: string[];
  /** 本次分析维度 code/名称 */
  dimensions?: string[];
  /** 本次生成条件 */
  conditions?: {
    minWordCount?: number;
    topics?: string[];
    scanMissing?: boolean;
    customRequirement?: string;
  } | null;
}

/** 把本次评报的全部材料渲染为带给 AI 的上下文文本（结构化四区块 + 最终评报） */
export function buildReviewContext(input: ReviewContextInput): string {
  const { reportDate, modules, finalSummary, mediaNames, dimensions, conditions } = input;
  const lines: string[] = [];

  lines.push(`【本次评报日期】${reportDate}`);
  if (mediaNames && mediaNames.length > 0) {
    lines.push(`【本次对比媒体】${mediaNames.join("、")}`);
  }
  if (dimensions && dimensions.length > 0) {
    lines.push(`【本次分析维度】${dimensions.join("、")}`);
  }
  if (conditions) {
    const cond: string[] = [];
    if (conditions.minWordCount) cond.push(`最低字数 ${conditions.minWordCount}`);
    if (conditions.topics && conditions.topics.length > 0) cond.push(`关注主题：${conditions.topics.join("、")}`);
    if (conditions.scanMissing) cond.push("已开启同行遗漏扫描");
    if (conditions.customRequirement) cond.push(`编辑自定义要求：${conditions.customRequirement}`);
    if (cond.length > 0) lines.push(`【本次生成条件】${cond.join("；")}`);
  }
  lines.push("");

  for (const mod of modules) {
    const title = MODULE_LABELS[mod.type] || mod.type;
    lines.push(`===== 区块：${title} =====`);
    if (mod.summary) lines.push(`区块摘要：${mod.summary}`);

    if (Array.isArray(mod.topics) && mod.topics.length > 0) {
      for (const topic of mod.topics) {
        lines.push(`同题主题「${topic.theme}」`);
        if (Array.isArray(topic.comparison) && topic.comparison.length > 0) {
          for (const row of topic.comparison) {
            const segs = [`  · ${row.media}`];
            if (row.title) segs.push(`《${row.title}》`);
            if (row.angle) segs.push(`角度：${row.angle}`);
            if (row.highlight) segs.push(`亮点：${row.highlight}`);
            if (row.url) segs.push(`原文：${row.url}`);
            lines.push(segs.join(" "));
          }
        }
        if (topic.analysis) lines.push(`  聚类分析：${topic.analysis}`);
      }
    }

    if (Array.isArray(mod.items) && mod.items.length > 0) {
      for (const item of mod.items) {
        const segs = [`- ${item.media || ""}${item.title ? `《${item.title}》` : ""}`];
        if (item.summary) segs.push(item.summary);
        else if (item.why_noteworthy) segs.push(item.why_noteworthy);
        if (item.url) segs.push(`原文：${item.url}`);
        lines.push(segs.join("："));
      }
    }
    lines.push("");
  }

  lines.push("===== 原始最终评报（供参考与衔接） =====");
  lines.push(finalSummary || "（无）");

  return lines.join("\n").slice(0, 12000); // 控制上下文长度，保留材料密度
}

const STRUCTURE_SYSTEM = `你是广州日报值班编辑的资深评报主笔。请基于【本次评报材料】与编辑给出的【新增要求】，重新生成一版完整、可整体替换旧版的评报结构化数据。

硬性要求：
1. 严格基于提供的材料（本期选稿 / 同题聚类 / 同行独有 / 原始评报），可调整组织、切入角度、详略与语言侧重，以满足新增要求；不得新增材料之外的媒体、标题、数据或事实。
2. 必须输出严格 JSON：不要 Markdown 代码块、不要多余文字，直接输出 JSON 结构，如下：
{
  "today_focus": { "summary": "今日重点概述", "items": [ { "media": "", "title": "", "summary": "", "url": "" } ] },
  "same_topic": [ { "theme": "同题主题", "comparison": [ { "media": "", "angle": "", "highlight": "", "title": "", "url": "" } ], "analysis": "聚类分析" } ],
  "peer_highlights": [ { "media": "", "title": "", "summary": "", "url": "", "why_noteworthy": "" } ],
  "gz_daily": { "summary": "广州日报观察", "items": [ { "media": "", "title": "", "summary": "", "url": "" } ] }
}
3. today_focus / gz_daily 有 summary 与 items；same_topic / peer_highlights 为数组。
4. 所有 url 沿用材料中的原文链接，不得编造。
5. 网站样本不能证明纸报头条、显要版面或版式，不得补写这类事实；同行有无仅指本轮已采集样本。纯新华社转载保留为背景，不得改为原创比较。`;

const FINAL_SYSTEM = `你是资深报纸评报主笔。基于重写后的结构化四区块，撰写一版完整、自然连贯的最终评报。
用中文、连贯的自然语言（不要列表、不要 JSON、不要 ### / ** / - 等任何标记符号），段落式输出。
内容应覆盖四部分：今日共同重点，然后是同题报道差异，然后是同行亮点（其他媒体有而广州日报没有重点覆盖的），最后是广州日报可借鉴之处。
语言风格专业、客观、简洁，符合报纸评报口吻。未经原文证实的事实、纸报版面判断、全网独有结论不得添加；纯转载不作为原创比较。只输出评报正文。`;

/** 从 LLM 返回的原生文本中健壮地提取并解析 JSON（容忍 ```json 包裹 / 首尾空白） */
function safeParseJson(raw: string): Record<string, any> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("AI 未返回有效的结构化数据");
  }
  return JSON.parse(cleaned.slice(first, last + 1));
}

/** 结构化 prompt 组装 */
function buildStructureMessages(
  context: string,
  requirement: string,
): ChatMessage[] {
  return [
    { role: "system", content: STRUCTURE_SYSTEM },
    {
      role: "user",
      content: `以下是【本次评报材料】：
${context}

【编辑新增要求】
${requirement || "（无，按材料原样重新组织为一版完整评报）"}

请输出完整的重新生成结果（严格 JSON）。`,
    },
  ];
}

/** 最终评报 prompt 组装（基于重写后结构化四区块 + 新增要求） */
function buildFinalMessages(
  dateStr: string,
  modules: ReviewModule[],
  requirement: string,
): ChatMessage[] {
  const structureText = JSON.stringify(modules, null, 1);
  return [
    { role: "system", content: FINAL_SYSTEM },
    {
      role: "user",
      content: `评报日期：${dateStr}
${requirement ? `本次编辑新增要求：${requirement}` : ""}

重写后的结构化四区块：
${structureText}

请撰写最终评报正文（自然段落，不用任何标记符号）。`,
    },
  ];
}

/** 生成重新评报的结构化四区块（非流式，输出 ReviewModule[]） */
export async function regenerateStructure(
  input: ReviewContextInput & { requirement: string },
): Promise<ReviewModule[]> {
  const context = buildReviewContext(input);
  const raw = await unifiedInvoke(buildStructureMessages(context, input.requirement), {
    temperature: 0.3,
  });
  const parsed = safeParseJson(raw);

  const modules: ReviewModule[] = [];

  if (parsed.today_focus) {
    modules.push({
      type: "today_focus",
      summary: parsed.today_focus.summary ?? "",
      items: (parsed.today_focus.items ?? []).map((it: any) => ({
        media: it?.media,
        title: it?.title,
        summary: it?.summary,
        url: it?.url,
      })),
    });
  }

  if (Array.isArray(parsed.same_topic)) {
    modules.push({
      type: "same_topic",
      topics: parsed.same_topic
        .slice(0, 8)
        .map((t: any) => ({
          theme: t?.theme,
          comparison: (t?.comparison ?? []).map((r: any) => ({
            media: r?.media,
            angle: r?.angle,
            highlight: r?.highlight,
            title: r?.title,
            url: r?.url,
          })),
          analysis: t?.analysis,
        })),
    });
  }

  if (Array.isArray(parsed.peer_highlights)) {
    modules.push({
      type: "peer_highlights",
      items: parsed.peer_highlights.slice(0, 8).map((p: any) => ({
        media: p?.media,
        title: p?.title,
        summary: p?.summary,
        url: p?.url,
        why_noteworthy: p?.why_noteworthy,
      })),
    });
  }

  if (parsed.gz_daily) {
    modules.push({
      type: "gz_daily",
      summary: parsed.gz_daily.summary ?? "",
      items: (parsed.gz_daily.items ?? []).map((it: any) => ({
        media: it?.media,
        title: it?.title,
        summary: it?.summary,
        url: it?.url,
      })),
    });
  }

  if (modules.length < 2) {
    throw new Error("AI 返回的结构化数据不完整，请重试");
  }
  return modules;
}

/** 流式生成重新评报的最终评报文本 */
export async function* streamRegeneratedFinalReview(
  dateStr: string,
  modules: ReviewModule[],
  requirement: string,
): AsyncGenerator<LLMStreamChunk> {
  const messages = buildFinalMessages(dateStr, modules, requirement);
  yield* unifiedStream(messages, { temperature: 0.4 });
}
