import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  generateCandidatesFromHistory,
  getTargetYear,
} from "@/lib/calendar-candidate";

/**
 * POST /api/admin/calendar/candidates/generate
 * 从历史日历节点批量生成候选（historical_migration，纯逻辑不调 AI）。
 * 也可接收 sourceType=ai_supplement / pasted_text，但这两类需要 AI，当前配额受限时返回提示。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const sourceType = String(body.sourceType ?? "historical_migration");

  if (sourceType !== "historical_migration") {
    return NextResponse.json(
      {
        error: `该来源类型（${sourceType}）需要大模型辅助，当前配额受限。请稍后重试，或先用工「历史日历迁移」生成候选。`,
      },
      { status: 409 },
    );
  }

  const targetYear = Number(body.targetYear) || (await getTargetYear());
  if (!Number.isFinite(targetYear) || targetYear < 2000) {
    return NextResponse.json({ error: "目标年度无效" }, { status: 400 });
  }

  try {
    const res = await generateCandidatesFromHistory({
      targetYear,
      fileId: body.fileId || undefined,
      year: body.year ? Number(body.year) : undefined,
      nodeIds: Array.isArray(body.nodeIds) ? body.nodeIds : undefined,
      force: body.force === true,
    });
    return NextResponse.json({
      success: true,
      targetYear,
      sourceType,
      requested: res.requested,
      skipped: res.skipped,
      inserted: res.inserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
