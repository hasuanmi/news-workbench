import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/admin/calendar/history
 * 历史日历文件列表（含每文件节点数、已确认数）。
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const db = supabase();
  const { data: files, error } = await db
    .schema("public")
    .from("calendar_history_file")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fileIds = (files ?? []).map((f: { id: string }) => f.id);
  const { data: nodes } = await db
    .schema("public")
    .from("calendar_history_node")
    .select("file_id")
    .in("file_id", fileIds.length ? fileIds : ["__none__"]);

  const nodeCount = new Map<string, number>();
  for (const n of nodes ?? []) {
    nodeCount.set(n.file_id, (nodeCount.get(n.file_id) ?? 0) + 1);
  }

  const items = (files ?? []).map((f: Record<string, unknown>) => ({
    ...f,
    node_count: nodeCount.get(f.id as string) ?? 0,
  }));

  return NextResponse.json({ items });
}
