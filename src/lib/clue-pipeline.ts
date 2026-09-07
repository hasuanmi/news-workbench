/**
 * 线索处理流水线
 *
 * 扫描 article 表中 clue_processed=false 的文章 → 批量 AI 识别 → 写入 news_clue → 标记已处理
 * 记录 task_log（workflow=clue_identify）
 */

import { supabase } from "@/lib/db";
import { analyzeArticle, saveClue, type ArticleForClue } from "@/lib/clue-engine";

export interface PipelineResult {
  total: number;
  processed: number;
  cluesFound: number;
  autoApproved: number;
  pendingReview: number;
  rejected: number;
  errors: string[];
}

export async function runCluePipeline(options?: {
  limit?: number;
  mediaId?: string;
}): Promise<PipelineResult> {
  const limit = options?.limit ?? 50;
  const db = supabase();

  // 1. 取未处理文章
  let query = db
    .from("article")
    .select("id, title, content, media_id, publish_time")
    .eq("clue_processed", false)
    .order("publish_time", { ascending: false })
    .limit(limit);

  if (options?.mediaId) {
    query = query.eq("media_id", options.mediaId);
  }

  const { data: articles, error } = await query;
  if (error) {
    console.error("查询未处理文章失败:", error);
    return { total: 0, processed: 0, cluesFound: 0, autoApproved: 0, pendingReview: 0, rejected: 0, errors: [error.message] };
  }

  if (!articles || articles.length === 0) {
    return { total: 0, processed: 0, cluesFound: 0, autoApproved: 0, pendingReview: 0, rejected: 0, errors: [] };
  }

  // 2. 批量查媒体名称
  const mediaIds = [...new Set(articles.map((a) => a.media_id))];
  const { data: mediaRows } = await db
    .from("media")
    .select("id, media_name")
    .in("id", mediaIds);
  const mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));

  // 3. 逐篇 AI 识别
  const result: PipelineResult = {
    total: articles.length,
    processed: 0,
    cluesFound: 0,
    autoApproved: 0,
    pendingReview: 0,
    rejected: 0,
    errors: [],
  };

  for (const article of articles) {
    const articleForClue: ArticleForClue = {
      id: article.id,
      title: article.title,
      content: article.content,
      media_id: article.media_id,
      media_name: mediaMap.get(article.media_id) ?? "未知媒体",
      publish_time: article.publish_time,
    };

    try {
      const analysis = await analyzeArticle(articleForClue);
      const { action } = await saveClue(articleForClue, analysis);

      result.processed++;
      if (analysis.is_clue && action !== "skipped") {
        result.cluesFound++;
        if (analysis.confidence >= 0.85) result.autoApproved++;
        else if (analysis.confidence >= 0.6) result.pendingReview++;
        else result.rejected++;
      } else {
        result.rejected++;
      }
    } catch (err) {
      result.errors.push(`${article.title}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 标记已处理（无论是否识别为线索）
    await db.from("article").update({ clue_processed: true }).eq("id", article.id);
  }

  // 4. 记录 task_log
  await db.from("task_log").insert({
    workflow_name: "clue_identify",
    source_count: result.total,
    success_count: result.processed,
    failure_count: result.errors.length,
    new_data_count: result.cluesFound,
    status: result.errors.length > 0 ? "completed_with_errors" : "completed",
    error_message: result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null,
    start_time: new Date(Date.now() - result.total * 2000).toISOString(),
    end_time: new Date().toISOString(),
  });

  return result;
}
