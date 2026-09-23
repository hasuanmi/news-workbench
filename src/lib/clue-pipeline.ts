/**
 * 线索处理流水线
 *
 * 扫描 article 表中 clue_processed=false 的文章 → 批量 AI 识别 → 写入 news_clue → 标记已处理
 * 记录 task_log（workflow=clue_identify）
 *
 * 分批处理：每批 CLUE_BATCH_SIZE 篇，内部循环直到近3天 pending=0 或达到 CLUE_MAX_BATCHES 上限，
 * 防止单轮处理量失控（避免 DeepSeek 额度 / 超时失控）。失败文章不标记 processed，留待后续重试。
 */

import { supabase } from "@/lib/db";
import { analyzeArticle, saveClue, type ArticleForClue } from "@/lib/clue-engine";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildClueIdentifyQuery, resolveClueIdentifyMediaIds } from "@/lib/clue-identify-config";

/** 每批处理的文章数（与 run-summary / 识别任务口径一致：100 篇/批） */
export const CLUE_BATCH_SIZE = 100;
/**
 * 单轮自动任务的最大批次数上限：100 篇 × 10 批 = 最多 1000 篇/轮。
 * 达到上限即停止，避免 DeepSeek 额度或运行时间失控；残余 pending 留待下一轮/手动重试。
 */
export const CLUE_MAX_BATCHES = 10;

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
  run_id?: string;
  executed?: boolean;
  summary?: {
    pendingArticles: number;
    mediaCount: number;
    deepseekCalls: number;
    batchCount: number;
    totalProcessed: number;
    totalFetched: number;
    calls: { articleId: string; articles: number; status: string }[];
  };
  total: number;
  processed: number;
  cluesFound: number;
  pending: number;
  confirmed: number;
  ignored: number;
  errors: string[];
  clues?: Record<string, unknown>[];
  stats?: { pending: number; confirmed: number; ignored: number };
}

export async function runCluePipeline(filter?: PipelineFilter): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const db = supabase();
  const runId = randomUUID();
  const calls: { articleId: string; articles: number; status: string }[] = [];
  const failedThisRun = new Set<string>(); // 本轮失败的文章，回避重复处理（仍保留 clue_processed=false 留待重试）
  const mediaSet = new Set<string>();
  let batchCount = 0;

  const finish = async (result: PipelineResult) => {
    result.run_id = runId;
    result.executed = calls.length > 0;
    result.summary = {
      pendingArticles: result.pending,
      mediaCount: mediaSet.size,
      deepseekCalls: calls.filter((c) => c.status.startsWith("deepseek:")).length,
      batchCount,
      totalProcessed: result.processed,
      totalFetched: result.total,
      calls,
    };
    const endedAt = new Date().toISOString();
    const record = { ...result, started_at: startedAt, ended_at: endedAt, filter };
    const directory = path.join(process.cwd(), "logs/clue-runs");
    fs.mkdirSync(directory, { recursive: true });
    const { error } = await db.from("task_log").insert({
      workflow_name: "clue_identify",
      source_count: result.total,
      success_count: result.processed,
      failure_count: result.errors.length,
      new_data_count: result.cluesFound,
      // 注意：task_log.status 为 varchar(16)，状态值必须 <=16 字符，否则插入会报
      // "value too long for type character varying(16)"，导致本轮被误判为失败。
      status: result.errors.length ? "with_errors" : result.executed ? "completed" : "skipped",
      error_message: result.errors.length ? result.errors.slice(0, 5).join("; ") : null,
      start_time: startedAt,
      end_time: endedAt,
    });
    if (error) result.errors.push(`执行日志保存失败: ${error.message}`);
    for (const file of [`${runId}.json`, "latest.json"]) {
      const temp = path.join(directory, `${file}.${runId}.tmp`);
      fs.writeFileSync(temp, JSON.stringify(record, null, 2));
      fs.renameSync(temp, path.join(directory, file));
    }
    return result;
  };

  // Fail before AI calls or processed flags when required persistence is absent.
  const schemaChecks = await Promise.all([
    db.from("news_clue").select("recent_article_at").limit(1),
    db.from("news_clue_article").select("id").limit(1),
  ]);
  const schemaErrors = schemaChecks.flatMap((check) => (check.error ? [check.error.message] : []));
  if (schemaErrors.length)
    return finish({
      total: 0,
      processed: 0,
      cluesFound: 0,
      pending: 0,
      confirmed: 0,
      ignored: 0,
      errors: schemaErrors,
      clues: [],
      stats: { pending: 0, confirmed: 0, ignored: 0 },
    });

  // 未显式传时间范围时（如定时任务），从配置 clue.identify_rules.default_time_range 读默认窗口，
  // 保证历史系列不会因为库里存在旧文章而反复进入今日待确认。
  let effectiveFilter = filter;
  if (!filter || filter.timeRange === undefined) {
    let defaultRange: PipelineFilter["timeRange"] = "24h";
    try {
      const { data: ruleRow } = await db
        .from("app_config")
        .select("value")
        .eq("key", "clue.identify_rules")
        .maybeSingle();
      if (ruleRow?.value) {
        const parsed =
          typeof ruleRow.value === "string" ? JSON.parse(ruleRow.value) : ruleRow.value;
        if (
          parsed?.default_time_range === "24h" ||
          parsed.default_time_range === "3d" ||
          parsed.default_time_range === "7d"
        ) {
          defaultRange = parsed.default_time_range;
        }
      }
    } catch {
      /* 用默认 */
    }
    effectiveFilter = { ...(filter ?? {}), timeRange: defaultRange };
  }

  // 1. 根据时间范围计算起始日期
  const now = new Date();
  let startDate: Date | undefined;
  if (effectiveFilter?.timeRange === "24h") startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  else if (effectiveFilter?.timeRange === "3d") startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  else if (effectiveFilter?.timeRange === "7d") startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (effectiveFilter?.timeRange === "custom" && effectiveFilter.customStart) {
    startDate = new Date(effectiveFilter.customStart);
  }

  // 媒体范围解析（自定义名单优先；否则按 media_level 范围；缺省回退 monitor_clue 名单，见下方 resolveClueIdentifyMediaIds）
  let scopeMediaIds: string[] = effectiveFilter?.customMediaIds ?? [];
  if (scopeMediaIds.length === 0 && effectiveFilter?.mediaScope && effectiveFilter.mediaScope !== "all") {
    const { data: mediaRows } = await db
      .from("media")
      .select("id")
      .eq(
        "media_level",
        effectiveFilter.mediaScope === "central" ? "央媒" : effectiveFilter.mediaScope === "provincial" ? "省媒" : "地市"
      );
    scopeMediaIds = (mediaRows ?? []).map((m) => m.id);
  }
  // 仍未确定范围则回退监测名单。注意：媒体名单必须在同步建查询之前解析完，
  // 因为 buildClueIdentifyQuery 返回的是 Postgrest builder（thenable），不能 await。
  if (scopeMediaIds.length === 0) scopeMediaIds = await resolveClueIdentifyMediaIds();

  const result: PipelineResult = {
    total: 0,
    processed: 0,
    cluesFound: 0,
    pending: 0,
    confirmed: 0,
    ignored: 0,
    errors: [],
    clues: [],
    stats: { pending: 0, confirmed: 0, ignored: 0 },
  };

  // 2. 分批循环：每批 CLUE_BATCH_SIZE 篇，直到近期 pending=0 或达到上限
  while (batchCount < CLUE_MAX_BATCHES) {
    batchCount++;
    // 注意：不能 await——builder 是 thenable，await 会解包成 { data, error }，后续 .order() 会报错
    let query = buildClueIdentifyQuery(db, { limit: CLUE_BATCH_SIZE, mediaIds: scopeMediaIds }) as any;
    query = query.order("publish_time", { ascending: false });
    if (effectiveFilter?.customEnd) {
      query = query.lte("publish_time", new Date(effectiveFilter.customEnd).toISOString());
    }
    // 本轮已失败的文章不再重复喂给 DeepSeek（仍保留 clue_processed=false 供后续重试）
    if (failedThisRun.size) {
      query = query.not("id", "in", `(${[...failedThisRun].join(",")})`);
    }

    const { data: articles, error } = await query;
    if (error) {
      result.errors.push(`查询未处理文章失败: ${error.message}`);
      break;
    }
    if (!articles || articles.length === 0) {
      // 近期待识别文章已清空，正常结束循环
      break;
    }

    // 媒体名称映射（按本批媒体去重累计）
    const articlesTyped = (articles ?? []) as Array<{ media_id: string }>;
    const batchMediaIds: string[] = [...new Set(articlesTyped.map((a) => a.media_id))];
    batchMediaIds.forEach((id) => mediaSet.add(id));
    const { data: mediaRows } = await db
      .from("media")
      .select("id, media_name")
      .in("id", batchMediaIds);
    const mediaMap = new Map((mediaRows ?? []).map((m: { id: string; media_name: string }) => [m.id, m.media_name]));

    // 逐篇 AI 识别（传入用户条件）
    for (const article of articles as Array<{
      id: string;
      title: string;
      content: string;
      media_id: string;
      publish_time: string;
      url: string;
    }>) {
      const articleForClue: ArticleForClue = {
        id: article.id,
        title: article.title,
        content: article.content,
        media_id: article.media_id,
        media_name: mediaMap.get(article.media_id) ?? "未知媒体",
        publish_time: article.publish_time,
        url: article.url,
      };

      try {
        let provider = "";
        const analysis = await analyzeArticle(articleForClue, {
          clueTypes: effectiveFilter?.clueTypes,
          topics: effectiveFilter?.topics,
          customRequirement: effectiveFilter?.customRequirement,
          onRequest: (host) => {
            provider = host;
            calls.push({
              articleId: article.id,
              articles: 1,
              status: host === "api.deepseek.com" ? "deepseek:started" : `${host}:started`,
            });
          },
        });
        const call = calls.find((c) => c.articleId === article.id);
        if (call) call.status = provider === "api.deepseek.com" ? "deepseek:success" : `${provider}:success`;
        const { action, clue } = await saveClue(articleForClue, analysis);
        const { error: markError } = await db.from("article").update({ clue_processed: true }).eq("id", article.id);
        if (markError) throw new Error(`标记文章处理状态失败: ${markError.message}`);

        result.processed++;
        if (analysis.is_clue && action !== "skipped") {
          result.cluesFound++;
          result.pending++;
          if (clue && result.clues) result.clues.push(clue);
        }
      } catch (err) {
        const call = calls.find((c) => c.articleId === article.id);
        if (call?.status.endsWith(":started")) call.status = call.status.replace(":started", ":failed");
        // 失败不标记为已处理，留待重试；本轮回避重复处理
        failedThisRun.add(article.id);
        result.errors.push(`${article.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    result.total += articles.length;
  }

  if (batchCount >= CLUE_MAX_BATCHES && failedThisRun.size + result.processed < result.total) {
    result.errors.push(
      `已达到单轮最大批次数上限（${CLUE_MAX_BATCHES} 批 × ${CLUE_BATCH_SIZE} 篇）；残余待识别文章留待下一轮或手动重试。`
    );
  }

  // 3. 真实剩余 pending（同一过滤条件，count 不受 limit 钳制）
  try {
    let pq = buildClueIdentifyQuery(db, { count: true, mediaIds: scopeMediaIds }) as any;
    if (effectiveFilter?.customEnd) pq = pq.lte("publish_time", new Date(effectiveFilter.customEnd).toISOString());
    if (failedThisRun.size) pq = pq.not("id", "in", `(${[...failedThisRun].join(",")})`);
    const { count } = await pq;
    result.pending = count ?? 0;
  } catch {
    /* 保留 0 */
  }

  // 4. 获取统计
  const { data: allClues } = await db.from("news_clue").select("review_status").eq("review_status", "pending");
  result.stats = {
    pending: allClues?.length ?? 0,
    confirmed: 0,
    ignored: 0,
  };

  // 5. 记录 task_log
  return finish(result);
}
