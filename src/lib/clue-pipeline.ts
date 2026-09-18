/**
 * 线索处理流水线
 *
 * 扫描 article 表中 clue_processed=false 的文章 → 批量 AI 识别 → 写入 news_clue → 标记已处理
 * 记录 task_log（workflow=clue_identify）
 */

import { supabase } from "@/lib/db";
import { analyzeArticle, saveClue, type ArticleForClue } from "@/lib/clue-engine";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  summary?: { pendingArticles: number; mediaCount: number; deepseekCalls: number; calls: { articleId: string; articles: number; status: string }[] };
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
  const runId=randomUUID();
  const calls: {articleId:string;articles:number;status:string}[]=[];
  let mediaCount=0;
  const finish=async(result:PipelineResult)=>{
    result.run_id=runId;result.executed=calls.length>0;
    result.summary={pendingArticles:result.total,mediaCount,deepseekCalls:calls.filter(c=>c.status.startsWith('deepseek:')).length,calls};
    const endedAt=new Date().toISOString();
    const record={...result,started_at:startedAt,ended_at:endedAt,filter};
    const directory=path.join(process.cwd(),'logs/clue-runs');fs.mkdirSync(directory,{recursive:true});
    const {error}=await db.from('task_log').insert({workflow_name:'clue_identify',source_count:result.total,success_count:result.processed,failure_count:result.errors.length,new_data_count:result.cluesFound,status:result.errors.length?'completed_with_errors':result.executed?'completed':'skipped',error_message:result.errors.length?result.errors.slice(0,5).join('; '):null,start_time:startedAt,end_time:endedAt});
    if(error)result.errors.push(`执行日志保存失败: ${error.message}`);
    for(const file of [`${runId}.json`,'latest.json']){const temp=path.join(directory,`${file}.${runId}.tmp`);fs.writeFileSync(temp,JSON.stringify(record,null,2));fs.renameSync(temp,path.join(directory,file));}
    return result;
  };
  // Fail before AI calls or processed flags when required persistence is absent.
  const schemaChecks = await Promise.all([
    db.from("news_clue").select("recent_article_at").limit(1),
    db.from("news_clue_article").select("id").limit(1),
  ]);
  const schemaErrors = schemaChecks.flatMap(check => check.error ? [check.error.message] : []);
  if (schemaErrors.length) return finish({
    total: 0, processed: 0, cluesFound: 0, pending: 0, confirmed: 0, ignored: 0,
    errors: schemaErrors, clues: [], stats: { pending: 0, confirmed: 0, ignored: 0 },
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

  // 2. 取文章（根据条件筛选）
  let query = db
    .from("article")
    .select("id, title, content, media_id, publish_time, url")
    .eq("is_test", false)
    .eq("clue_processed", false)
    .order("publish_time", { ascending: false })
    .limit(100);

  if (startDate) {
    query = query.gte("publish_time", startDate.toISOString());
  }
  if (effectiveFilter?.customEnd) {
    query = query.lte("publish_time", new Date(effectiveFilter.customEnd).toISOString());
  }

  // 媒体范围筛选
  if (effectiveFilter?.customMediaIds?.length) {
    query = query.in("media_id", effectiveFilter.customMediaIds);
  } else if (effectiveFilter?.mediaScope && effectiveFilter.mediaScope !== "all") {
    const { data: mediaRows } = await db
      .from("media")
      .select("id")
      .eq("media_level", effectiveFilter.mediaScope === "central" ? "央媒" : effectiveFilter.mediaScope === "provincial" ? "省媒" : "地市");
    const mediaIds = (mediaRows ?? []).map((m) => m.id);
    if (mediaIds.length > 0) {
      query = query.in("media_id", mediaIds);
    }
  }

  const { data: articles, error } = await query;
  if (error) {
    console.error("查询未处理文章失败:", error);
    return finish({ total: 0, processed: 0, cluesFound: 0, pending: 0, confirmed: 0, ignored: 0, errors: [error.message], clues: [], stats: { pending: 0, confirmed: 0, ignored: 0 } });
  }

  if (!articles || articles.length === 0) {
    return finish({ total: 0, processed: 0, cluesFound: 0, pending: 0, confirmed: 0, ignored: 0, errors: [], clues: [], stats: { pending: 0, confirmed: 0, ignored: 0 } });
  }

  // 2. 批量查媒体名称
  const mediaIds = [...new Set(articles.map((a) => a.media_id))];
  mediaCount=mediaIds.length;
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
      url: article.url,
    };

    try {
      let provider='';
      const analysis = await analyzeArticle(articleForClue, {
        clueTypes: effectiveFilter?.clueTypes,
        topics: effectiveFilter?.topics,
        customRequirement: effectiveFilter?.customRequirement,
        onRequest:host=>{provider=host;calls.push({articleId:article.id,articles:1,status:host==='api.deepseek.com'?'deepseek:started':`${host}:started`});},
      });
      const call=calls.find(c=>c.articleId===article.id);if(call)call.status=provider==='api.deepseek.com'?'deepseek:success':`${provider}:success`;
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
      const call=calls.find(c=>c.articleId===article.id);if(call?.status.endsWith(':started'))call.status=call.status.replace(':started',':failed');
      result.errors.push(`${article.title}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 失败不标记为已处理，修复后可以重试。
  }

  // 获取统计
  const { data: allClues } = await db.from("news_clue").select("review_status").eq("review_status", "pending");
  result.stats = {
    pending: allClues?.length ?? 0,
    confirmed: 0,
    ignored: 0,
  };

  // 4. 记录 task_log
  return finish(result);
}
