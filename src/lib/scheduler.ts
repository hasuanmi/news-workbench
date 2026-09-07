/**
 * 定时任务调度器（M5）
 *
 * 设计为「无状态、幂等、可被外部定时器触发」：
 *   - 不依赖进程内 setInterval（Next.js 部署多实例会重复触发）。
 *   - 由外部 crontab / Vercel Cron / 系统定时器按 cron 表达式调用
 *     `POST /api/cron/{job}`（Bearer Token 鉴权），本模块只负责执行。
 *   - 每次执行写 task_log，运行锁（config flag）防同一任务并发重入。
 *
 * 支持任务：
 *   - clue_identify   新闻线索 AI 识别（扫未处理文章）
 *   - weekly_briefing 每周新闻线索简报
 *   - daily_review    每日评报生成
 */

import "server-only";
import { supabase } from "@/lib/db";
import { invalidateConfigCache } from "@/lib/config";
import { runCluePipeline } from "@/lib/clue-pipeline";
import {
  getWeeklyClues,
  generateWeeklyBriefing,
} from "@/lib/weekly-briefing";
import {
  getReviewRules,
  fetchReviewArticles,
  analyzeStructure,
  streamFinalReview,
  saveDailyReview,
  type ReviewConditions,
} from "@/lib/review-engine";

export type JobName = "clue_identify" | "weekly_briefing" | "daily_review";

export interface JobDefinition {
  name: JobName;
  title: string;
  description: string;
  defaultCron: string;
}

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    name: "clue_identify",
    title: "新闻线索 AI 识别",
    description: "扫描未处理的采集文章，AI 识别新栏目 / 系列报道 / 专题 / 特色策划并入库",
    defaultCron: "0 9 * * *",
  },
  {
    name: "weekly_briefing",
    title: "每周线索简报",
    description: "汇总近 7 天已发布线索，AI 生成四段式周简报并落库",
    defaultCron: "0 10 * * 1",
  },
  {
    name: "daily_review",
    title: "每日评报",
    description: "按评报监测媒体筛选当天重点稿，AI 生成结构化评报并落库",
    defaultCron: "30 10 * * *",
  },
];

interface JobConfig {
  enabled: boolean;
  cron: string;
}

const CONFIG_KEY = "scheduler.jobs";

type JobConfigMap = Record<JobName, JobConfig>;

function defaultConfig(): JobConfigMap {
  return {
    clue_identify: { enabled: true, cron: "0 9 * * *" },
    weekly_briefing: { enabled: true, cron: "0 10 * * 1" },
    daily_review: { enabled: true, cron: "30 10 * * *" },
  };
}

/** 读取定时任务配置（缺失项回退默认） */
export async function getSchedulerConfig(): Promise<JobConfigMap> {
  const db = supabase();
  const { data } = await db
    .from("app_config")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();
  const defaults = defaultConfig();
  if (!data?.value) return defaults;
  let stored: Partial<JobConfigMap> = {};
  try {
    stored =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as Partial<JobConfigMap>)
        : (data.value as Partial<JobConfigMap>);
  } catch {
    stored = {};
  }
  const merged = { ...defaults };
  for (const key of Object.keys(defaults) as JobName[]) {
    const s = stored[key];
    if (s) merged[key] = { enabled: !!s.enabled, cron: s.cron || defaults[key].cron };
  }
  return merged;
}

/** 保存定时任务配置（后台手动触发时调用） */
export async function saveSchedulerConfig(cfg: JobConfigMap): Promise<void> {
  const db = supabase();
  await db.from("app_config").upsert({
    key: CONFIG_KEY,
    value: JSON.stringify(cfg),
    description: "定时任务开关与 cron 表达式",
    updated_at: new Date().toISOString(),
  });
  invalidateConfigCache();
}

export interface JobResult {
  job: JobName;
  success: boolean;
  summary: string;
  detail?: Record<string, unknown>;
  error?: string;
}

// 进程内运行锁（同一实例防重入；多实例依赖 task_log running 兜底）
const running = new Set<JobName>();

/**
 * 执行一个定时任务（幂等，可安全重复调用）。
 * @param manual 是否后台手动触发（手动触发不受 enabled 开关限制）
 */
export async function runJob(job: JobName, manual = false): Promise<JobResult> {
  if (!JOB_DEFINITIONS.some((d) => d.name === job)) {
    return { job, success: false, summary: "未知任务", error: `unknown job: ${job}` };
  }

  const cfg = await getSchedulerConfig();
  if (!manual && !cfg[job].enabled) {
    return { job, success: true, summary: "任务已停用，跳过" };
  }

  if (running.has(job)) {
    return { job, success: false, summary: "任务正在执行中，跳过本次触发", error: "already running" };
  }

  // task_log 兜底：若已有 running 记录（上次异常中断），允许继续；此处先开一条
  const db = supabase();
  const { data: logRow, error: logErr } = await db
    .from("task_log")
    .insert({
      workflow_name: job,
      status: "running",
      start_time: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (logErr) {
    return { job, success: false, summary: "无法创建任务日志", error: logErr.message };
  }
  const logId = logRow.id;

  running.add(job);
  const finish = async (
    ok: boolean,
    patch: {
      status: "success" | "failed";
      source_count?: number;
      success_count?: number;
      failure_count?: number;
      new_data_count?: number;
      error_message?: string;
    }
  ) => {
    running.delete(job);
    await db
      .from("task_log")
      .update({ end_time: new Date().toISOString(), ...patch })
      .eq("id", logId);
  };

  try {
    if (job === "clue_identify") {
      const r = await runCluePipeline();
      await finish(true, {
        status: "success",
        source_count: r.total,
        success_count: r.processed,
        new_data_count: r.cluesFound,
        failure_count: r.errors.length,
        ...(r.errors.length ? { error_message: r.errors.slice(0, 5).join("; ") } : {}),
      });
      return {
        job,
        success: true,
        summary: `扫描 ${r.total} 篇，处理 ${r.processed} 篇，发现线索 ${r.cluesFound} 条`,
        detail: r as unknown as Record<string, unknown>,
      };
    }

    if (job === "weekly_briefing") {
      const now = new Date();
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      const weekStart = monday.toISOString().split("T")[0];

      const data = await getWeeklyClues(weekStart);
      if (data.clues.length === 0) {
        await finish(true, { status: "success", source_count: 0 });
        return { job, success: true, summary: "本周无线索，跳过简报生成" };
      }
      let content = "";
      for await (const chunk of generateWeeklyBriefing(data)) {
        content += chunk;
      }
      await finish(true, {
        status: "success",
        source_count: data.clues.length,
        new_data_count: content.length,
      });
      return {
        job,
        success: true,
        summary: `已生成 ${weekStart} 周简报，覆盖线索 ${data.clues.length} 条`,
        detail: { weekStart, clueCount: data.clues.length, length: content.length },
      };
    }

    if (job === "daily_review") {
      const dateStr = new Date().toISOString().split("T")[0];
      const { gen } = await getReviewRules();
      // 定时任务用默认条件：评报监测媒体 + 配置字数阈值 + 默认维度 + 开启同行扫描
      // fetchReviewArticles 内部对 Mock 短文会自动放宽到 >=100 字，不致任务失败
      const conditions: ReviewConditions = {
        date: new Date().toISOString(),
        mediaIds: [],
        minWordCount: 2000,
        highlightFlags: [],
        dimensions: ["topic", "timeliness", "angle", "depth", "presentation"],
        topics: [],
        scanMissing: true,
      };
      const { articles, gzMediaNames } = await fetchReviewArticles(conditions);
      if (articles.length === 0) {
        await finish(true, { status: "success", source_count: 0 });
        return { job, success: true, summary: `${dateStr} 无符合条件文章，跳过评报生成` };
      }
      const { modules } = await analyzeStructure(dateStr, articles, conditions, gen, gzMediaNames);
      let finalSummary = "";
      for await (const chunk of streamFinalReview(dateStr, modules, conditions, gen)) {
        finalSummary += chunk;
      }
      const id = await saveDailyReview({ dateStr, modules, finalSummary, conditions });
      await finish(true, {
        status: "success",
        source_count: articles.length,
        new_data_count: finalSummary.length,
      });
      return {
        job,
        success: true,
        summary: `已生成 ${dateStr} 评报（${articles.length} 篇，${finalSummary.length} 字）`,
        detail: { date: dateStr, articleCount: articles.length, reviewId: id },
      };
    }

    await finish(false, { status: "failed", error_message: "unreachable" });
    return { job, success: false, summary: "未实现", error: "unreachable" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finish(false, { status: "failed", error_message: message });
    return { job, success: false, summary: "任务执行失败", error: message };
  }
}

/** 读取最近任务运行日志（后台定时任务页用） */
export async function getRecentJobLogs(limit = 20): Promise<
  Array<{
    id: string;
    workflow_name: string;
    status: string;
    start_time: string;
    end_time: string | null;
    source_count: number;
    success_count: number;
    failure_count: number;
    new_data_count: number;
    error_message: string | null;
  }>
> {
  const db = supabase();
  const names = JOB_DEFINITIONS.map((d) => d.name);
  const { data } = await db
    .from("task_log")
    .select(
      "id, workflow_name, status, start_time, end_time, source_count, success_count, failure_count, new_data_count, error_message"
    )
    .in("workflow_name", names)
    .order("start_time", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{
    id: string;
    workflow_name: string;
    status: string;
    start_time: string;
    end_time: string | null;
    source_count: number;
    success_count: number;
    failure_count: number;
    new_data_count: number;
    error_message: string | null;
  }>;
}
