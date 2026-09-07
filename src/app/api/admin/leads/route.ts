import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";

/**
 * GET /api/admin/leads — 后台线索列表（含所有状态）
 * 支持筛选：status / date / mediaId / type / page / pageSize
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const date = searchParams.get("date");
  const mediaId = searchParams.get("mediaId");
  const type = searchParams.get("type");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const db = supabase();

  let query = db
    .from("news_clue")
    .select("*", { count: "exact" })
    .order("first_found_at", { ascending: false });

  if (status) query = query.eq("review_status", status);
  if (date) {
    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;
    query = query.gte("first_found_at", start).lte("first_found_at", end);
  }
  if (mediaId) query = query.eq("media_id", mediaId);
  if (type) query = query.eq("clue_type", type);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 批量查媒体名称
  const mediaIds = [...new Set((data ?? []).map((c) => c.media_id))];
  let mediaMap = new Map<string, string>();
  if (mediaIds.length > 0) {
    const { data: mediaRows } = await db
      .from("media")
      .select("id, media_name")
      .in("id", mediaIds);
    mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));
  }

  // 统计各状态数量
  const { count: pendingCount } = await db
    .from("news_clue")
    .select("*", { count: "exact", head: true })
    .eq("review_status", "pending_review");
  const { count: autoCount } = await db
    .from("news_clue")
    .select("*", { count: "exact", head: true })
    .eq("review_status", "auto_approved");

  const clues = (data ?? []).map((c) => ({
    ...c,
    media_name: mediaMap.get(c.media_id) ?? "未知媒体",
    tags: typeof c.tags === "string" ? safeJsonParse(c.tags, []) : c.tags,
  }));

  return NextResponse.json({
    success: true,
    total: count ?? 0,
    page,
    pageSize,
    clues,
    stats: {
      pending_review: pendingCount ?? 0,
      auto_approved: autoCount ?? 0,
    },
  });
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
