import { NextRequest } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { supabase } from "@/lib/db";

export const runtime = "nodejs";

// SSE 流式生成节点的选题策划建议（AI 总结）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: ev, error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!ev) return new Response(JSON.stringify({ error: "节点不存在" }), { status: 404 });

  let categoryName: string | null = null;
  if (ev.category_id) {
    const { data: cat } = await supabase()
      .schema("public")
      .from("calendar_category")
      .select("category_name")
      .eq("id", ev.category_id)
      .maybeSingle();
    categoryName = cat?.category_name ?? null;
  }

  const regionLabel = ev.region === "local" ? "广东/广州本地" : "国内/国际";
  const tags = Array.isArray(ev.tags) ? (ev.tags as string[]).join("、") : "";

  const systemPrompt =
    "你是广州日报的资深新闻策划编辑，擅长围绕重要时间节点提前策划报道。" +
    "请根据给定的新闻日历节点，输出一份简洁实用的选题策划建议，供值班编辑参考。";

  const userPrompt =
    `【节点名称】${ev.event_name}\n` +
    `【节点类型】${ev.event_type === "fixed" ? "固定节点（每年周期性）" : "动态节点"}\n` +
    `【重要等级】${ev.importance ?? "B"} 级\n` +
    `【地域】${regionLabel}\n` +
    (categoryName ? `【分类】${categoryName}\n` : "") +
    (ev.anniversary ? `【周年】今年为${ev.anniversary}周年\n` : "") +
    (ev.description ? `【背景/描述】${ev.description}\n` : "") +
    (tags ? `【标签】${tags}\n` : "") +
    "\n请输出：\n" +
    "1. 一句话点明这个节点的新闻价值（为什么值得报）；\n" +
    "2. 3~5 条可落地的选题/报道角度建议，结合广州日报本地视角；\n" +
    "3. 1~2 条采访对象或呈现形式建议。\n" +
    "用 Markdown，控制在 400 字以内，务实、具体，不要空话套话。";

  const encoder = new TextEncoder();
  const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
  const client = new LLMClient(new Config(), customHeaders);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const llmStream = client.stream(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          { model: "doubao-seed-2-0-pro-260215", temperature: 0.7, thinking: "disabled" },
        );
        for await (const chunk of llmStream) {
          if (chunk.content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.content.toString() })}\n\n`),
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI 总结生成失败";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
