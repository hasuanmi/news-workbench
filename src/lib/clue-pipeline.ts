/**
 * 线索处理流水线
 *
 * 扫描 article 表中 clue_processed=false 的文章 → 批量 AI 识别 → 写入 news_clue → 标记已处理
 * 记录 task_log（workflow=clue_identify）
 */

import { supabase } from "@/lib/db";
import { analyzeArticle, saveClue, type ArticleForClue } from "@/lib/clue-engine";

export interface PipelineFilter {
  timeRange?: "24h" | "3d" | "7d" | "custom";
  customStart?: string;
  customEnd?: string;
  mediaScope?: "all" | "central" | "provincial" | "municipal" | "custom";
  customMediaIds?: string[];
  clueTypes?: string[];
  topics?: string[];
  customRequirement?: string;
}

export interface PipelineResult {
  total: number;
  processed: number;
  cluesFound: number;
  pending: number;
  confirmed: number;
  ignored: number;
  errors: string[];
  clues?: any[];
  stats?: any;
}

export async function runCluePipeline(filter?: PipelineFilter): Promise<PipelineResult> {
  const db = supabase();

  // 1. 根据时间范围计算起始日期
  const now = new Date();
  let startDate: Date | undefined;
  if (filter?.timeRange === "24h") startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  else if (filter?.timeRange === "3d") startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  else if (filter?.timeRange === "7d") startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (filter?.timeRange === "custom" && filter.customStart) {
    startDate = new Date(filter.customStart);
  }

  // 2. 取文章（根据条件筛选）
  let query = db
    .from("article")
    .select("id, title, content, media_id, publish_time")
    .eq("clue_processed", false)
    .order("publish_time", { ascending: false })
    .limit(100);

  if (startDate) {
    query = query.gte("publish_time", startDate.toISOString());
  }
  if (filter?.customEnd) {
    query = query.lte("publish_time", new Date(filter.customEnd).toISOString());
  }

  // 媒体范围筛选
  if (filter?.mediaScope && filter.mediaScope !== "all") {
    const { data: mediaRows } = await db
      .from("media")
      .select("id")
      .eq("media_level", filter.mediaScope === "central" ? "央媒" : filter.mediaScope === "provincial" ? "省媒" : "地市");
    const mediaIds = (mediaRows ?? []).map((m) => m.id);
    if (mediaIds.length > 0) {
      query = query.in("media_id", mediaIds);
    }
  } else if (filter?.customMediaIds && filter.customMediaIds.length > 0) {
    query = query.in("media_id", filter.customMediaIds);
  }

  const { data: articles, error } = await query;
  if (error) {
    console.error("查询未处理文章失败:", error);
    return { total: 0, processed: 0, cluesFound: 0, pending: 0, confirmed: 0, ignored: 0, errors: [error.message], clues: [], stats: { pending: 0, confirmed: 0, ignored: 0 } };
  }

  if (!articles || articles.length === 0) {
    return { total: 0, processed: 0, cluesFound: 0, pending: 0, confirmed: 0, ignored: 0, errors: [], clues: [], stats: { pending: 0, confirmed: 0, ignored: 0 } };
  }

  // 2. 批量查媒体名称
  const mediaIds = [...new Set(articles.map((a) => a.media_id))];
  const { data: mediaRows } = await db
    .from("media")
    .select("id, media_name")
    .in("id", mediaIds);
  const mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));

  // 3. 逐篇 AI 识别（传入用户条件）
  const result: PipelineResult = {
    total: articles.length,
    processed: 0,
    cluesFound: 0,
    pending: 0,
    confirmed: 0,
    ignored: 0,
    errors: [],
    clues: [],
    stats: { pending: 0, confirmed: 0, ignored: 0 },
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
      const analysis = await analyzeArticle(articleForClue, {
        clueTypes: filter?.clueTypes,
        topics: filter?.topics,
        customRequirement: filter?.customRequirement,
      });
      const { action, clue } = await saveClue(articleForClue, analysis);

      result.processed++;
      if (analysis.is_clue && action !== "skipped") {
        result.cluesFound++;
        result.pending++;
        if (clue && result.clues) result.clues.push(clue);
      }
    } catch (err) {
      result.errors.push(`${article.title}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 标记已处理（无论是否识别为线索）
    await db.from("article").update({ clue_processed: true }).eq("id", article.id);
  }

  // 获取统计
  const { data: allClues } = await db.from("news_clue").select("review_status").eq("review_status", "pending");
  result.stats = {
    pending: allClues?.length ?? 0,
    confirmed: 0,
    ignored: 0,
  };

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
