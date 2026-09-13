import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";
import { runFollowup, type FollowupMode } from "@/lib/review-followup";
import type { ReviewModule } from "@/lib/review-types";

const encoder = new TextEncoder();
const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

/**
 * POST /api/review/[id]/followup — 对已保存评报进行「继续追问 / AI 协作修改」
 *
 * SSE 事件：
 *   { phase: "start" }
 *   { delta: "..." }      流式文本分片
 *   { done: true }
 *   { error } | [DONE]
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const mode: FollowupMode = body.mode === "revise" ? "revise" : "question";
  const input: string = typeof body.input === "string" ? body.input.trim() : "";
  const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(body.history)
    ? body.history.filter(
        (h: unknown) =>
          h &&
          typeof h === "object" &&
          ((h as { role?: unknown }).role === "user" || (h as { role?: unknown }).role === "assistant") &&
          typeof (h as { content?: unknown }).content === "string",
      )
    : [];

  if (!input) {
    return new Response(JSON.stringify({ error: "请输入追问内容或修改意见" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 读取已保存评报
  const db = supabase();
  const { data: review, error } = await db
    .from("daily_review")
    .select("report_date, sections, final_summary")
    .eq("id", id)
    .single();
  if (error || !review) {
    return new Response(JSON.stringify({ error: "评报不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sections: { [key: string]: ReviewModule } = {};
  try {
    sections =
      typeof review.sections === "string" ? JSON.parse(review.sections) : review.sections ?? {};
  } catch {
    sections = {};
  }
  const moduleOrder = ["today_focus", "same_topic", "peer_highlights", "gz_daily"];
  const modules = moduleOrder
    .map((key) => sections[key])
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  const stream = new ReadableStream({
    async start(controller) {
      // 客户端中断（如关闭页面）后 controller 已关闭，再 enqueue 会抛错，这里统一安全注入
    let closed = false;
    const push = (data: Uint8Array) => {
      if (closed) return;
      try {
        controller.enqueue(data);
      } catch {
        closed = true;
      }
    };
      push(sse({ phase: "start" }));
      try {
        const gen = runFollowup({
          mode,
          reportDate: review.report_date,
          modules,
          finalSummary: review.final_summary ?? "",
          input,
          history,
        });
        let any = false;
        for await (const chunk of gen) {
          any = true;
          if (chunk.content) push(sse({ delta: chunk.content }));
          if (chunk.done) break;
        }
        if (!any) {
          push(sse({ error: "AI 未返回内容，请检查模型配置后重试" }));
        } else {
          push(sse({ done: true }));
        }
      } catch (err) {
        console.error("评报追问失败:", err);
        push(sse({ error: err instanceof Error ? err.message : String(err) }));
      } finally {
        push(encoder.encode("data: [DONE]\n\n"));
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* 已关闭则忽略 */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}