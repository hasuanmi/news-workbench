import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runRuleDedup } from "@/lib/calendar-dedup";
import { getTargetYear } from "@/lib/calendar-candidate";

/**
 * POST /api/admin/calendar/candidates/dedup
 * 运行规则层去重（确定性，不调 AI）。合并重复候选，返回簇数/合并数。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const targetYear = Number(body.targetYear) || (await getTargetYear());
  if (!Number.isFinite(targetYear) || targetYear < 2000) {
    return NextResponse.json({ error: "目标年度无效" }, { status: 400 });
  }

  try {
    const res = await runRuleDedup(targetYear);
    return NextResponse.json({ success: true, ...res });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
