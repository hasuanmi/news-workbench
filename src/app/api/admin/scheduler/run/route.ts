import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runJob, type JobName } from "@/lib/scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;

const JOB_NAMES: JobName[] = ["clue_identify", "weekly_briefing", "daily_review"];

/**
 * POST /api/admin/scheduler/run — 后台手动触发任务（manual=true，不受 enabled 开关限制）
 * Body: { job: JobName }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const job = String(body?.job ?? "") as JobName;
  if (!JOB_NAMES.includes(job)) {
    return Response.json({ error: "未知任务" }, { status: 400 });
  }

  const result = await runJob(job, true);
  return Response.json(result, { status: result.success ? 200 : 500 });
}
