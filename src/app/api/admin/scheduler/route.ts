import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  getSchedulerConfig,
  saveSchedulerConfig,
  getRecentJobLogs,
  JOB_DEFINITIONS,
} from "@/lib/scheduler";

export const runtime = "nodejs";

/** GET /api/admin/scheduler — 任务定义 + 配置 + 最近日志 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const cfg = await getSchedulerConfig();
  const logs = await getRecentJobLogs(30);

  return Response.json({
    success: true,
    jobs: JOB_DEFINITIONS.map((d) => ({
      name: d.name,
      title: d.title,
      description: d.description,
      defaultCron: d.defaultCron,
      enabled: cfg[d.name].enabled,
      cron: cfg[d.name].cron,
    })),
    logs,
    cronConfigured: !!(process.env.CRON_SECRET || process.env.CRON_TOKEN),
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
