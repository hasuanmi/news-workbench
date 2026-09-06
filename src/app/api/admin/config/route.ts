import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateConfigCache } from "@/lib/config";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { data, error } = await supabase()
    .schema("public")
    .from("app_config")
    .select("*")
    .order("key", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const updates: { key: string; value: string }[] = body.updates ?? [];
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "无更新项" }, { status: 400 });
  }

  const db = supabase();
  for (const u of updates) {
    const { error } = await db
      .schema("public")
      .from("app_config")
      .update({ value: String(u.value), updated_at: new Date().toISOString() })
      .eq("key", u.key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  invalidateConfigCache();
  return NextResponse.json({ success: true });
}
