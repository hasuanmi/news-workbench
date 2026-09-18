import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  getSchedulerConfig,
  saveSchedulerConfig,
  getRecentJobLogs,
  getJobRuntimeStatuses,
  JOB_DEFINITIONS,
} from "@/lib/scheduler";
import { getLocalTriggers } from "@/lib/local-triggers";

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
  // 查询真实 Windows 任务；配置密钥或 cron 表达式不能证明触发器已安装。
  const triggers = await getLocalTriggers();
  const autoScheduled = Object.values(triggers).some(trigger => trigger.enabled);

  const jobs = JOB_DEFINITIONS.map((d) => {
    const st = statuses[d.name] ?? {};
    let nextRunAt: string | null = null;
    const trigger=triggers[d.name];
    if(trigger?.enabled && cfg[d.name].enabled)nextRunAt=trigger.nextTriggerAt;
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
      autoScheduled: !!(trigger?.enabled && cfg[d.name].enabled),
      trigger: trigger ? {...trigger,provider:"Windows Task Scheduler",dependency:d.name==="clue_identify"?"08:30开始三家媒体抓取，完成后立即识别；实际识别时间随抓取耗时变化":null} : null,
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
    message: autoScheduled ? "已核实 Windows 真实任务：每天07:30日历推荐，08:30启动三家真实媒体抓取、完成后识别新栏目（北京时间）。本机须开机并登录。每周简报和每日评报未安装自动触发器。" : cronSecretSet
      ? "触发密钥已配置；外部定时器是否运行尚未验证。请先手动执行验收，再配置并验证外部定时调用。"
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
