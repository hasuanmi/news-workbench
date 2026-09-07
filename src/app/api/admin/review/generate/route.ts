import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  fetchReviewArticles,
  analyzeStructure,
  streamFinalReview,
  saveDailyReview,
  getReviewRules,
  type ReviewConditions,
} from "@/lib/review-engine";
import type { ReviewModule } from "@/lib/review-types";

/**
 * POST /api/admin/review/generate — 生成每日评报（SSE 流式）
 *
 * 事件序列：
 *   { phase: "fetching" }          开始筛选文章
 *   { phase: "analyzing" }         AI 结构化分析中
 *   { phase: "structure", modules, display_rules }  结构化四区块
 *   { phase: "final", content }    最终评报流式分片
 *   { phase: "saved", id }         落库完成
 *   { error } 或 [DONE]
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const conditions: ReviewConditions = {
    date: body.date || new Date().toISOString(),
    mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds : [],
    minWordCount: typeof body.minWordCount === "number" ? body.minWordCount : 2000,
    highlightFlags: Array.isArray(body.highlightFlags) ? body.highlightFlags : [],
    dimensions: Array.isArray(body.dimensions) ? body.dimensions : [],
    topics: Array.isArray(body.topics) ? body.topics : [],
    scanMissing: body.scanMissing !== false,
    customRequirement: body.customRequirement,
  };

  const encoder = new TextEncoder();
  const send = (obj: unknown) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { gen, display } = await getReviewRules();

        // 1. 规则层筛选文章
        controller.enqueue(send({ phase: "fetching" }));
        const { dateStr, articles, gzMediaNames } = await fetchReviewArticles(conditions);

        if (articles.length === 0) {
          controller.enqueue(send({ error: `${dateStr} 没有符合条件的文章，请放宽字数阈值或检查媒体数据源` }));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        // 2. AI 结构化分析
        controller.enqueue(send({ phase: "analyzing", articleCount: articles.length }));
        const { modules }: { modules: ReviewModule[] } = await analyzeStructure(
          dateStr,
          articles,
          conditions,
          gen,
          gzMediaNames,
        );
        controller.enqueue(send({ phase: "structure", modules, display_rules: display }));

        // 3. 流式生成最终评报
        let finalSummary = "";
        for await (const chunk of streamFinalReview(dateStr, modules, conditions, gen)) {
          finalSummary += chunk;
          controller.enqueue(send({ phase: "final", content: chunk }));
        }

        // 4. 落库
        try {
          const id = await saveDailyReview({ dateStr, modules, finalSummary, conditions });
          controller.enqueue(send({ phase: "saved", id, date: dateStr }));
        } catch (e) {
          // 落库失败不影响前端已拿到的结果
          controller.enqueue(
            send({ warning: `评报已生成但保存失败：${e instanceof Error ? e.message : String(e)}` }),
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(
          send({ error: err instanceof Error ? err.message : String(err) }),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
