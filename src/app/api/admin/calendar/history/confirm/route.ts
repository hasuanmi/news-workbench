import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";
import { saveHistoryNodes, type ParsedHistoryNode } from "@/lib/calendar-history";

/**
 * POST /api/admin/calendar/history/confirm
 * 用户在预览页修改/确认后，写入 calendar_history_node
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const fileId = String(body.fileId || "");
  const nodes = (body.nodes ?? []) as ParsedHistoryNode[];
  if (!fileId) {
    return NextResponse.json({ error: "缺少 fileId" }, { status: 400 });
  }
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return NextResponse.json({ error: "没有可保存的节点" }, { status: 400 });
  }

  const db = supabase();
  const { data: file, error: fErr } = await db
    .from("calendar_history_file")
    .select("id, year")
    .eq("id", fileId)
    .single();
  if (fErr || !file) {
    return NextResponse.json({ error: "文件记录不存在" }, { status: 404 });
  }

  try {
    const res = await saveHistoryNodes({ fileId, year: file.year, nodes });

    // 维护动态年份列表
    const { data: cfg } = await db
      .from("app_config")
      .select("value")
      .eq("key", "calendar.historical_years")
      .single();
    const years: number[] = Array.isArray(cfg?.value) ? (cfg.value as number[]) : [];
    if (!years.includes(file.year)) {
      await db
        .from("app_config")
        .update({ value: [...years, file.year].sort((a, b) => a - b) })
        .eq("key", "calendar.historical_years");
    }

    return NextResponse.json({ success: true, inserted: res.inserted, year: file.year });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
