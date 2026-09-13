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

  // 批量查询每条线索的关联原文（外键嵌套关联不可用 → 二次查询 + Map 组装）
  const clueIds = [...new Set((data ?? []).map((c) => c.id))];
  const articleMap = new Map<string, any[]>();
  if (clueIds.length > 0) {
    const { data: links } = await db
      .from("news_clue_article")
      .select("clue_id, article_id, title, url, publish_time")
      .in("clue_id", clueIds)
      .order("created_at", { ascending: false });
    (links ?? []).forEach((l) => {
      const arr = articleMap.get(l.clue_id) ?? [];
      arr.push({
        id: l.article_id,
        title: l.title,
        url: l.url,
        published_at: l.publish_time,
      });
      articleMap.set(l.clue_id, arr);
    });
  }
  const nowTs = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const enriched = clues.map((c) => {
    (c as any).articles = articleMap.get(c.id) ?? [];
    const recent = c.recent_article_at || ((c as any).articles[0]?.published_at as string | undefined) || c.last_seen_at;
    (c as any).recent_article_at = recent || null;
    (c as any).freshness_days =
      recent && !Number.isNaN(new Date(recent).getTime())
        ? Math.max(0, Math.floor((nowTs - new Date(recent).getTime()) / DAY))
        : null;
    return c;
  });

  return NextResponse.json({
    success: true,
    total: count ?? 0,
    page,
    pageSize,
    clues: enriched,
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
