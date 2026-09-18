import { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { runJob, getSchedulerConfig, type JobName } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAMES: JobName[] = ["calendar_recommend", "clue_identify", "weekly_briefing", "daily_review"];

/**
 * 鉴权：两种方式任一即可
 *   1. 外部定时器：Authorization: Bearer <CRON_SECRET>
 *   2. 后台管理员：已登录的 admin 会话 cookie（手动触发走 /api/admin，此为兜底）
 */
async function authorize(req: NextRequest): Promise<boolean> {
  // 1. Bearer token
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const secret = process.env.CRON_SECRET || process.env.CRON_TOKEN || "";
  if (bearer && secret && bearer === secret) return true;

  // 2. 登录会话（本版本取消角色区别，登录即可）
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) {
    const session = await verifySessionToken(cookieToken);
    if (session) return true;
  }
  return false;
}

/**
 * POST /api/cron/{job}  触发定时任务
 *   job ∈ clue_identify | weekly_briefing | daily_review
 * GET  /api/cron/{job}  探活（不执行），返回任务是否可用
 */
async function handler(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  const { job } = await ctx.params;

  if (!JOB_NAMES.includes(job as JobName)) {
    return Response.json({ error: `未知任务: ${job}` }, { status: 404 });
  }

  if (!(await authorize(req))) {
    return Response.json({ error: "未授权" }, { status: 401 });
  }

  if (req.method === "GET") {
    return Response.json({ success: true, job, ok: true, enabled:(await getSchedulerConfig())[job as JobName].enabled });
  }

  // 外部定时器触发为自动（受 enabled 开关约束）；带 admin cookie 的也按自动处理，
  // 手动「立即执行」请走 /api/admin/scheduler/run（manual=true，不受开关限制）
  const result = await runJob(job as JobName, false);
  return Response.json(result, { status: result.success ? 200 : 500 });
}

export { handler as GET, handler as POST };
