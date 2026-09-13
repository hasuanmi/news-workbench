/**
 * 每日评报「继续追问 / AI 协作修改」（WF04-F）
 *
 * 严格基于「本次评报」上下文：本次日期、对比媒体、相关文章、同题聚类结果、
 * 分析维度、生成条件与已生成评报。不做脱离当前材料的普通聊天。
 *
 * 支持的编辑操作：
 *   1. 展开某一主题  2. 重新比较指定媒体  3. 调整分析维度
 *   4. 补充遗漏      5. 修改语言风格      6. 精简 / 扩写某一部分
 *
 * 架构：
 * - 复用统一 LLM 出口 unifiedStream（自定义模型优先，豆包回退）。
 * - 纯函数组装上下文 + 流式生成，不直接碰 DB（由路由层读取已保存评报传入）。
 * - 长生成用 SSE 流式，避免同步超时。
 */

import { unifiedStream, type LLMStreamChunk } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-adapter";
import type { ReviewModule } from "@/lib/review-types";

export type FollowupMode = "question" | "revise";

/** 本次评报的完整上下文（由路由从 daily_review.sections.conditions + 模块还原） */
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

const SYSTEM_PROMPT = `你是广州日报值班编辑的"每日评报"AI 协作助手。你只能基于提供的【本次评报材料】作答或改稿，严禁脱离材料引入未给出的媒体、标题、数据或事实；材料不足时明确说明"本次评报材料中暂无相关依据"。

本次允许的协作操作仅限以下六类：
1. 展开某一主题：把评报中已有主题展开，补充该主题下已有的同题角度/同行做法细节。
2. 重新比较指定媒体：针对编辑点名的媒体，基于材料中的同题对比与条目重新横向比较。
3. 调整分析维度：按编辑指定的维度（如选题、时效、角度、深度、表现形式、独有价值）重新组织分析。
4. 补充遗漏：基于"同行亮点 / 广州日报观察 / 独有价值"材料，补充广州可借鉴或可能遗漏的点。
5. 修改语言风格：在不改变事实的前提下，按编辑要求调整语气与篇幅（如更精炼、更书面、编辑部口吻）。
6. 精简或扩写某一部分：只针对编辑指定的区块或段落精简/扩写，其它部分保持不变。

区分两种模式：
- 追问(question)：用专业、简洁、客观的中文回答，引用材料中的媒体与标题作为依据，可给可操作建议，但不直接改稿。
- 协作修改(revise)：输出可直接替换的成稿文本。若编辑指定了区块，只重写该区块并在开头用一行"【对应区块：xxx】"标注；若要求改最终评报，则输出完整的新最终评报。不得编造材料外内容。

输出要求：中文、专业克制、编辑部术语（同题、同行、评报、选题、版面），不使用营销化表达，不输出 JSON。`;

const MODULE_LABELS: Record<string, string> = {
  today_focus: "今日重点",
  same_topic: "同题观察",
  peer_highlights: "同行亮点",
  gz_daily: "广州日报观察",
};

/** 把本次评报的全部材料渲染为带给 AI 的上下文文本 */
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

    // 同题聚类：完整对比表（媒体 / 角度 / 亮点 / 标题 / 链接）
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

    // 相关文章条目：媒体 / 标题 / 摘要 / 原文链接（可核验依据）
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

  lines.push("===== 区块：最终评报（当前版本） =====");
  lines.push(finalSummary || "（无）");

  return lines.join("\n").slice(0, 9000); // 控制上下文长度，保留材料密度
}

/**
 * 流式执行追问/协作修改。
 * @param param 本次评报上下文 + 用户输入 + 多轮历史
 * @yields 流式文本分片
 */
export async function* runFollowup(params: {
  mode: FollowupMode;
  context: ReviewContextInput;
  input: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): AsyncGenerator<LLMStreamChunk> {
  const context = buildReviewContext(params.context);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `以下是【本次评报材料】，所有问答与改稿都只能基于它：\n\n${context}` },
  ];

  // 携带多轮对话历史（如有），保证围绕同一份评报连贯协作
  for (const h of params.history ?? []) {
    messages.push({ role: h.role as ChatMessage["role"], content: h.content });
  }

  const modeText = params.mode === "question" ? "追问" : "协作修改";
  const modeGuide =
    params.mode === "revise"
      ? "请按「协作修改」要求输出可直接替换的成稿；若针对某区块，开头标注【对应区块：xxx】。"
      : "请按「追问」要求作答，不要直接重写整份评报。";
  messages.push({
    role: "user",
    content: `${modeText}（${modeGuide}）：\n${params.input}`,
  });

  yield* unifiedStream(messages, { temperature: params.mode === "revise" ? 0.4 : 0.3 });
}
