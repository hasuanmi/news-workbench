import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "event_name",
    "category_id",
    "region",
    "importance",
    "description",
    "enabled",
    "needs_review",
    "review_status",
    "original_date",
    "event_date",
    "anniversary_base_year",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k] === "" ? null : body[k];
  }
  if (body.event_type === "fixed" && body.original_date) {
    update.original_date = body.original_date;
    update.event_date = null;
  }
  if (body.event_type === "dynamic" && body.event_date) {
    update.event_date = body.event_date;
    update.original_date = null;
  }

  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { error } = await supabase().schema("public").from("calendar_event").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
