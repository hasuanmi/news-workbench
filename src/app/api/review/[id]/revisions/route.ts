import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listReviewRevisions } from "@/lib/review-engine";

/**
 * GET /api/review/[id]/revisions — 查看某份评报的历史版本快照（倒序）
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  try {
    const revisions = await listReviewRevisions(id);
    return NextResponse.json({ success: true, revisions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取版本失败" },
      { status: 500 },
    );
  }
}
