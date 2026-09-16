import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";
import {
  regenerateStructure,
  streamRegeneratedFinalReview,
  buildReviewContext,
} from "@/lib/review-followup";
import { applyFollowupRegeneration } from "@/lib/review-engine";
import type { ReviewModule } from "@/lib/review-types";

const encoder = new TextEncoder();
const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

/**
 * POST /api/review/[id]/followup — 「补充要求 → 重新生成完整每日评报」
 *
 * 本功能不是普通聊天问答：用户提交补充要求后，基于
 * 本期选稿 / 同题聚类 / 同行独有 / 原始评报 / 用户新增要求，
 * 重新生成一版完整评报，并全量替换保存为当前评报的新版本（原版本留快照可恢复）。
 *
 * SSE 事件流：
 *   { phase:"start" }
 *   { phase:"structure", modules }        // 重构后的结构化四区块（非流式）
 *   { phase:"final", delta }               // 最终评报流式文本
 *   { phase:"saved", id, version }         // 已保存为新版本
 *   { phase:"done" } / { phase:"error", error }
 *   data: [DONE]
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const input: string = typeof body.input === "string" ? body.input.trim() : "";

  if (!input) {
    return new Response(JSON.stringify({ error: "请输入补充要求" }), {
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

  let sections: { [key: string]: unknown } = {};
  try {
    sections = typeof review.sections === "string" ? JSON.parse(review.sections) : review.sections ?? {};
  } catch {
    sections = {};
  }
  const moduleOrder = ["today_focus", "same_topic", "peer_highlights", "gz_daily"];
  const modules = moduleOrder.map((key) => sections[key]).filter((m): m is ReviewModule => Boolean(m));
  const conditions = (sections.conditions ?? null) as
    | { minWordCount?: number; dimensions?: string[]; topics?: string[]; scanMissing?: boolean; customRequirement?: string }
    | null;

  // 本次对比媒体名单（缺省回退配置）
  let mediaNames: string[] = [];
  const { data: mediaCfg } = await db
    .from("app_config")
    .select("value")
    .eq("key", "review.media_names")
    .maybeSingle();
  if (mediaCfg?.value) {
    try {
      const parsed = typeof mediaCfg.value === "string" ? JSON.parse(mediaCfg.value) : mediaCfg.value;
      if (Array.isArray(parsed)) mediaNames = parsed.map(String);
    } catch {
      /* ignore */
    }
  }
  const dimensions = Array.isArray(conditions?.dimensions) ? conditions!.dimensions : [];

  // 本次评报完整上下文（含原始四区块 + 最终评报），给 AI 作依据
  const contextInput = {
    reportDate: review.report_date,
    modules,
    finalSummary: review.final_summary ?? "",
    mediaNames,
    dimensions,
    conditions,
  };
  const contextText = buildReviewContext(contextInput);

  const stream = new ReadableStream({
    async start(controller) {
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
        // 阶段1：重构结构化四区块（非流式，输出模块 JSON 供前端直接渲染）
        const regeneratedModules = await regenerateStructure({
          ...contextInput,
          requirement: input,
        });
        push(sse({ phase: "structure", modules: regeneratedModules }));

        // 阶段2：流式生成最终评报
        let finalSummary = "";
        for await (const chunk of streamRegeneratedFinalReview(
          review.report_date,
          regeneratedModules,
          input,
        )) {
          if (chunk.content) {
            finalSummary += chunk.content;
            push(sse({ phase: "final", delta: chunk.content }));
          }
          if (chunk.done) break;
        }

        // 阶段3：全量替换保存为新版本（原版本已自动快照，可恢复）
        const saved = await applyFollowupRegeneration({
          reviewId: id,
          modules: regeneratedModules,
          finalSummary,
          changeNote: `重新生成评报：${input}`,
          createdBy: "admin",
        });
        push(sse({ phase: "saved", id: saved.id, version: saved.version }));
        push(sse({ phase: "done", version: saved.version }));
      } catch (err) {
        console.error("评报重新生成失败:", err);
        push(sse({ phase: "error", error: err instanceof Error ? err.message : String(err) }));
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