import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyFollowupRevision } from "@/lib/review-engine";

/**
 * POST /api/review/[id]/revision — 把一次协作修改结果更新到当前评报
 *
 * body:
 *   target: "final_summary" | "today_focus" | "same_topic" | "peer_highlights" | "gz_daily"
 *   content: string         —— 成稿文本（target=final_summary 时为新最终评报；区块时为新区块摘要）
 *   change_note?: string    —— 对应的编辑指令（留存到版本快照）
 *
 * 更新前自动保留当前版本快照，daily_review.version +1。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const moduleTargets = ["today_focus", "same_topic", "peer_highlights", "gz_daily"] as const;
  const target = (
    typeof body.target === "string" ? body.target : "final_summary"
  ) as "final_summary" | (typeof moduleTargets)[number];
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const changeNote = typeof body.change_note === "string" ? body.change_note.slice(0, 500) : "";

  if (!content) {
    return NextResponse.json({ error: "缺少要更新的内容" }, { status: 400 });
  }
  const validTargets = ["final_summary", ...moduleTargets];
  if (!validTargets.includes(target)) {
    return NextResponse.json({ error: "无效的更新目标" }, { status: 400 });
  }

  try {
    const result = await applyFollowupRevision({
      reviewId: id,
      targetModule: target,
      finalSummary: target === "final_summary" ? content : undefined,
      moduleContent: target !== "final_summary" ? { summary: content } : undefined,
      changeNote: changeNote || "AI 协作修改",
      createdBy: "session" in auth ? auth.session.username : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新评报失败" },
      { status: 500 },
    );
  }
}
