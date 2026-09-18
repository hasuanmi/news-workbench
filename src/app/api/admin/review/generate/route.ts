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
import { getDraftWithArticles, buildConditionsFromRules, type DraftPayload } from "@/lib/review-draft";
import type { ReviewModule } from "@/lib/review-types";

/**
 * POST /api/admin/review/generate — 生成每日评报（SSE 流式）
 *
 * 两种模式：
 *   A. 两段式：body 传 { reportDate } → 复用当期已确认选稿（含排除），从选稿生成最终评报
 *   B. 兼容旧模式：body 传 { date, mediaIds, ... } → 直接筛选 + 结构化分析 + 生成（不经选稿）
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

  const body = await req.json().catch(() => {});
  const forceMode = typeof body.reportDate === "string" && body.reportDate.trim().length > 0;

  // 组装条件（兼容两种模式）：长期规则取后台默认，body 仅作为临时覆盖（前台不再传）
  const baseConditions: ReviewConditions = await buildConditionsFromRules({
    date: body.date || new Date().toISOString(),
    topics: Array.isArray(body.topics) ? body.topics : undefined,
    customRequirement: body.customRequirement,
    minWordCount: typeof body.minWordCount === "number" ? body.minWordCount : undefined,
    highlightFlags: Array.isArray(body.highlightFlags) ? body.highlightFlags : undefined,
    dimensions: Array.isArray(body.dimensions) ? body.dimensions : undefined,
    scanMissing: typeof body.scanMissing === "boolean" ? body.scanMissing : undefined,
  });

  const encoder = new TextEncoder();
  const send = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { gen, display } = await getReviewRules();

        controller.enqueue(send({ phase: "fetching" }));

        let dateStr: string;
        let articles: Awaited<ReturnType<typeof fetchReviewArticles>>["articles"];
        let gzMediaNames: string[];
        let conditions: ReviewConditions = baseConditions;
        let draft: DraftPayload | null = null;

        if (forceMode) {
          // 模式 A：复用已确认选稿
          dateStr = body.reportDate;
          const draftCtx = await getDraftWithArticles(dateStr);
          if (!draftCtx) {
            controller.enqueue(send({ error: `${dateStr} 尚未生成选稿，请先执行「本期选稿」` }));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          draft = draftCtx.draft;
          conditions = draftCtx.conditions;
          articles = draftCtx.articles;
          gzMediaNames = draftCtx.gzMediaNames;

          // 应用排除稿
          const excluded = new Set(draft?.excluded_article_ids ?? []);
          if (excluded.size > 0) {
            articles = draftCtx.articles.filter((a) => !excluded.has(a.id));
          }
          if (articles.length === 0) {
            controller.enqueue(send({ error: "本次选稿已全部被排除，没有可评报的文章" }));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
        } else {
          // 模式 B：直接筛选
          const r = await fetchReviewArticles(baseConditions);
          dateStr = r.dateStr;
          articles = r.articles;
          gzMediaNames = r.gzMediaNames;
          conditions = baseConditions;

          if (articles.length === 0) {
            controller.enqueue(send({ error: `${dateStr} 没有符合条件的文章，请放宽字数阈值或检查媒体数据源` }));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
        }

        // AI 结构化分析
        controller.enqueue(send({ phase: "analyzing", articleCount: articles.length }));
        const { modules }: { modules: ReviewModule[] } = await analyzeStructure(
          dateStr,
          articles,
          conditions,
          gen,
          gzMediaNames,
          draft ?? undefined,
        );
        controller.enqueue(send({ phase: "structure", modules, display_rules: display }));

        // 流式生成最终评报
        let finalSummary = "";
        for await (const chunk of streamFinalReview(dateStr, modules, conditions, gen)) {
          finalSummary += chunk;
          controller.enqueue(send({ phase: "final", content: chunk }));
        }

        // 落库
        try {
          const id = await saveDailyReview({ dateStr, modules, finalSummary, conditions });
          controller.enqueue(send({ phase: "saved", id, date: dateStr }));
        } catch (e) {
          controller.enqueue(
            send({ warning: `评报已生成但保存失败：${e instanceof Error ? e.message : String(e)}` }),
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(send({ error: err instanceof Error ? err.message : String(err) }));
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
