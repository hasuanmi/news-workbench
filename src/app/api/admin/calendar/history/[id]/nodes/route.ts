import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/admin/calendar/history/[id]/nodes
 * 某历史文件解析出的节点列表。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const db = supabase();
  const { data, error } = await db
    .schema("public")
    .from("calendar_history_node")
    .select("*")
    .eq("file_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const categoryIds = Array.from(
    new Set((data ?? []).map((n: { category_id: string | null }) => n.category_id).filter(Boolean) as string[]),
  );
  const { data: categoryRows } = await db
    .schema("public")
    .from("calendar_category")
    .select("id, code, category_name, color")
    .in("id", categoryIds.length ? categoryIds : ["__none__"]);
  const categoryMap = new Map((categoryRows ?? []).map((c: { id: string }) => [c.id, c]));

  const items = (data ?? []).map((n: Record<string, unknown>) => ({
    ...n,
    category: n.category_id ? categoryMap.get(n.category_id as string) ?? null : null,
  }));

  return NextResponse.json({ items });
}
