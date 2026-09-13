/**
 * 每日评报「继续追问 / AI 协作修改」（WF04-F）
 *
 * 基于已保存的 daily_review（四区块 sections + 最终评报）作为上下文，
 * 接收编辑的追问 / 修改意见，流式输出 AI 协作结果。
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

const SYSTEM_PROMPT = `你是一位资深新闻值班编辑的 AI 协作助手，协助广州日报编辑对一份已生成的"每日评报"进行追问答疑与协作修改。

背景规则：
- 你基于给定的一份评报（含"今日重点 / 同题观察 / 同行亮点 / 广州日报观察"四区块 + 最终评报）作答。
- "追问"（question）：编辑对评报内容提出疑问，你用专业、简洁、客观的中文回答，可引用评报原文依据；末尾可给出可操作的改进建议。
- "协作修改"（revise）：编辑给出修改意见，你在保留原始客观事实与既有证据的前提下，重写评报目标区块/最终评报，使其符合编辑要求；不要编造评报中没有的媒体或标题。
- 回复面向内部编辑，使用编辑部术语（同题、同行、评报、选题）。
- 不需输出 JSON，直接输出自然语言。

输出要求：
- 中文，语气专业克制，不使用营销化表达。`;

/** 把已保存评报渲染为带给 AI 的上下文文本 */
export function buildReviewContext(
  reportDate: string,
  modules: ReviewModule[],
  finalSummary: string,
): string {
  const lines: string[] = [];
  lines.push(`评报日期：${reportDate}`);
  lines.push("");

  const moduleLabels: Record<string, string> = {
    today_focus: "今日重点",
    same_topic: "同题观察",
    peer_highlights: "同行亮点",
    gz_daily: "广州日报观察",
  };

  for (const mod of modules) {
    const title = moduleLabels[mod.type] || mod.type;
    lines.push(`【${title}】`);
    if (mod.summary) lines.push(`摘要：${mod.summary}`);
    if (Array.isArray(mod.topics) && mod.topics.length > 0) {
      for (const topic of mod.topics) {
        lines.push(`- 主题「${topic.theme}」`);
        if (Array.isArray(topic.comparison)) {
          for (const row of topic.comparison) {
            lines.push(`  · ${row.media}：${row.angle} — ${row.highlight}`);
          }
        }
        if (topic.analysis) lines.push(`  分析：${topic.analysis}`);
      }
    }
    if (Array.isArray(mod.items) && mod.items.length > 0) {
      for (const item of mod.items) {
        lines.push(`- ${item.media || ""}《${item.title || ""}》：${item.summary || item.why_noteworthy || ""}`);
      }
    }
    lines.push("");
  }

  lines.push("【最终评报】");
  lines.push(finalSummary || "（无）");
  return lines.join("\n").slice(0, 6000); // 控制上下文长度
}

/**
 * 流式执行追问/协作修改。
 * @param param 已保存评报上下文 + 用户输入
 * @yields 流式文本分片
 */
export async function* runFollowup(params: {
  mode: FollowupMode;
  reportDate: string;
  modules: ReviewModule[];
  finalSummary: string;
  input: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): AsyncGenerator<LLMStreamChunk> {
  const context = buildReviewContext(params.reportDate, params.modules, params.finalSummary);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `以下是一份已生成的每日评报：\n\n${context}` },
  ];

  // 携带多轮对话历史（如有），保证连贯追问
  for (const h of params.history ?? []) {
    messages.push({ role: h.role as ChatMessage["role"], content: h.content });
  }

  const modeText = params.mode === "question" ? "追问" : "协作修改";
  messages.push({
    role: "user",
    content: `${modeText}请求：\n${params.input}`,
  });

  yield* unifiedStream(messages, { temperature: 0.4 });
}