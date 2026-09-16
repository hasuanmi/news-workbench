import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  getSchedulerConfig,
  saveSchedulerConfig,
  getRecentJobLogs,
  getJobRuntimeStatuses,
  JOB_DEFINITIONS,
} from "@/lib/scheduler";
import CronExpressionParser from "cron-parser";

export const runtime = "nodejs";

/** GET /api/admin/scheduler — 任务定义 + 配置 + 运行状态 + 最近日志 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const cfg = await getSchedulerConfig();
  const logs = await getRecentJobLogs(30);
  const statuses = await getJobRuntimeStatuses();

  // 是否配了触发密钥：有 CRON_SECRET/CRON_TOKEN 才算具备被外部定时触发的前提
  const cronSecretSet = !!(process.env.CRON_SECRET || process.env.CRON_TOKEN);
  // 是否有任何一次真实的定时触发记录（manual=false 无法从 task_log 区分，只能看是否有外部调用迹象）。
  // 由于当前架构是「外部 crontab 调用 /api/cron/{job}」，enable 开关不代表真正在跑——
  // 只有 CRON_SECRET 配置 + 外部定时器存在才算「已自动运行」。这里如实暴露配置前提。
  const autoScheduled = cronSecretSet;

  const now = new Date();
  const jobs = JOB_DEFINITIONS.map((d) => {
    const st = statuses[d.name] ?? {};
    let nextRunAt: string | null = null;
    try {
      const cron = cfg[d.name].cron || d.defaultCron;
      const interval = CronExpressionParser.parse(cron, { currentDate: now });
      nextRunAt = interval.next().toDate().toISOString();
    } catch {
      nextRunAt = null;
    }
    return {
      name: d.name,
      title: d.title,
      description: d.description,
      defaultCron: d.defaultCron,
      enabled: cfg[d.name].enabled,
      cron: cfg[d.name].cron,
      lastRunAt: st.lastRunAt ?? null,
      lastRunStatus: st.lastRunStatus ?? null,
      lastSuccessAt: st.lastSuccessAt ?? null,
      lastProcessedCount: st.lastProcessedCount ?? null,
      lastError: st.lastError ?? null,
      nextRunAt,
    };
  });

  return Response.json({
    success: true,
    jobs,
    logs,
    cronSecretSet,
    autoScheduled,
    /** 环境是否为沙箱/开发环境（正式部署需外部配置 cron） */
    env: process.env.COZE_PROJECT_ENV || "dev",
    message: autoScheduled
      ? "已配置触发密钥与外部定时器后即可自动运行（见 DEPLOY.md 定时任务）。"
      : "尚未自动运行：当前未配置触发密钥（CRON_SECRET/CRON_TOKEN），系统不会自行定时执行；仅支持后台手动「立即执行」。正式部署后请在服务器配置 crontab 调用 /api/cron/{job}（详见 DEPLOY.md 定时任务）。",
  });
}

/** PUT /api/admin/scheduler — 保存任务配置 { jobs: { name: { enabled, cron } } } */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const incoming = body?.jobs;
  if (!incoming || typeof incoming !== "object") {
    return Response.json({ error: "参数 jobs 缺失" }, { status: 400 });
  }

  const current = await getSchedulerConfig();
  const next = { ...current };
  for (const def of JOB_DEFINITIONS) {
    const patch = incoming[def.name];
    if (patch && typeof patch === "object") {
      next[def.name] = {
        enabled: typeof patch.enabled === "boolean" ? patch.enabled : current[def.name].enabled,
        cron:
          typeof patch.cron === "string" && patch.cron.trim()
            ? patch.cron.trim()
            : current[def.name].cron,
      };
    }
  }

  await saveSchedulerConfig(next);
  return Response.json({ success: true, jobs: next });
}
