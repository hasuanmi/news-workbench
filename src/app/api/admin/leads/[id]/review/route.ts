import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";

/**
 * POST /api/admin/leads/[id]/review — 审核线索
 * Body: { action: "approve" | "reject" | "modify", ... }
 *   approve: 通过
 *   reject: 驳回
 *   modify: 修改后通过（可传 clue_type / summary / tags 等）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (!["approve", "reject", "modify"].includes(action)) {
    return NextResponse.json({ error: "无效的 action" }, { status: 400 });
  }

  const db = supabase();

  // 查现有线索
  const { data: clue, error: findErr } = await db
    .from("news_clue")
    .select("*")
    .eq("id", id)
    .single();

  if (findErr || !clue) {
    return NextResponse.json({ error: "线索不存在" }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  switch (action) {
    case "approve":
      update.review_status = "approved";
      break;
    case "reject":
      update.review_status = "rejected";
      break;
    case "modify":
      update.review_status = "approved";
      if (body.clue_type) update.clue_type = body.clue_type;
      if (body.summary) update.summary = body.summary;
      if (body.tags) update.tags = JSON.stringify(body.tags);
      if (body.topic) update.topic = body.topic;
      if (body.series_name) update.series_name = body.series_name;
      break;
  }

  const { error: updateErr } = await db
    .from("news_clue")
    .update(update)
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id, action });
}
