import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET /api/leads — 前台线索列表（confirmed + pending）
 * 支持筛选：date / mediaId / type / tag / page / pageSize
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const mediaId = searchParams.get("mediaId");
  const type = searchParams.get("type");
  const tag = searchParams.get("tag");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const db = supabase();

  let query = db
    .from("news_clue")
    .select("*", { count: "exact" })
    .in("review_status", ["confirmed", "pending"])
    .order("first_found_at", { ascending: false });

  if (date) {
    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;
    query = query.gte("first_found_at", start).lte("first_found_at", end);
  }
  if (mediaId) query = query.eq("media_id", mediaId);
  if (type) query = query.eq("clue_type", type);
  if (tag) query = query.contains("tags", JSON.stringify([tag]));

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

  // 读取展示规则
  const { data: configData } = await db
    .from("app_config")
    .select("value")
    .eq("key", "clue.display_rules")
    .single();

  let displayRules = null;
  if (configData?.value) {
    displayRules = typeof configData.value === "string" ? JSON.parse(configData.value) : configData.value;
  }

  const clues = (data ?? []).map((c) => ({
    ...c,
    clue_name: c.series_name || c.clue_name || "",
    media_name: mediaMap.get(c.media_id) ?? "未知媒体",
    tags: typeof c.tags === "string" ? safeJsonParse(c.tags, []) : c.tags,
    display_rules: displayRules,
  }));

  return NextResponse.json({
    success: true,
    total: count ?? 0,
    page,
    pageSize,
    clues,
  });
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
