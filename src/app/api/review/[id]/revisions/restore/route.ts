import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { restoreReviewRevision } from "@/lib/review-engine";

/**
 * POST /api/review/[id]/revisions/restore
 * body: { revisionId }
 * 恢复前自动备份当前内容（可撤销本次恢复），随后用目标快照覆盖当前评报，version+1。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const revisionId = typeof body.revisionId === "string" ? body.revisionId.trim() : "";
  if (!revisionId) {
    return NextResponse.json({ error: "缺少 revisionId" }, { status: 400 });
  }

  try {
    const result = await restoreReviewRevision({
      reviewId: id,
      revisionId,
      createdBy: "session" in auth ? auth.session.username : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "恢复失败" },
      { status: 500 },
    );
  }
}
