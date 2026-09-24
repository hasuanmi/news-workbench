import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { recommendCandidatesFromWeb } from "@/lib/calendar-candidate";
import { calendarToday } from "@/lib/calendar-policy";

/**
 * POST /api/admin/calendar/candidates/recommend
 * AI 推荐候选：结合历史关注类型 + 当年联网公开信息，返回建议列表（供预览，不直接入池）。
 * 每条带来源依据（source_url）与推荐理由（ai_reason）；模糊无来源的不返回。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const targetYear = Number(body.targetYear) || (await (await import("@/lib/calendar-candidate")).getTargetYear());
  if (targetYear !== calendarToday().getUTCFullYear()) {
    return NextResponse.json({ error: "AI推荐仅补充当前年度动态事件；下一年度请预览固定或可推导节点" }, { status: 400 });
  }

  try {
    const { candidates, searched } = await recommendCandidatesFromWeb(targetYear, {
      focusCategories: Array.isArray(body.focusCategories) ? body.focusCategories : undefined,
      region: body.region,
      months:
        Array.isArray(body.months) && body.months.length
          ? body.months.map(Number).filter((n: number) => n >= 1 && n <= 12)
          : undefined,
      industries: body.industries,
      keywords: body.keywords,
      extraRequirements: body.extraRequirements,
    });
    return NextResponse.json({ success: true, targetYear, searched, candidates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[candidate-recommend] 异常:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
