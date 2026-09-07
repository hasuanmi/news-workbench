/**
 * GET /api/admin/articles
 * 后台查看已入库文章（联调/审核用）。
 * 查询参数：sourceId?、limit?(默认50，最大200)
 * 外键关联查询不可用，采用主查询 + 按 id 批量二次查询组装媒体名。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("sourceId");
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));

  let query = supabase()
    .schema("public")
    .from("article")
    .select("id, media_id, source_id, title, url, publish_time, word_count, content_hash, created_at")
    .order("publish_time", { ascending: false })
    .limit(limit);
  if (sourceId) query = query.eq("source_id", sourceId);

  const { data: articles, error } = await query;
  if (error) {
    return NextResponse.json({ error: "查询文章失败" }, { status: 500 });
  }

  // 二次查询：media_id -> 媒体名（外键嵌套关联不可用）
  const mediaIds = Array.from(new Set((articles ?? []).map((a) => a.media_id)));
  const { data: medias } = await supabase()
    .schema("public")
    .from("media")
    .select("id, media_name")
    .in("id", mediaIds.length ? mediaIds : ["__none__"]);
  const mediaNameMap = new Map((medias ?? []).map((m) => [m.id, m.media_name]));

  return NextResponse.json({
    success: true,
    total: (articles ?? []).length,
    articles: (articles ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      publishedAt: a.publish_time,
      wordCount: a.word_count,
      sourceId: a.source_id,
      mediaName: mediaNameMap.get(a.media_id) ?? "未知媒体",
    })),
  });
}
