import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET /api/medias — 媒体列表（登录用户可见）
 * 查询参数：
 *   scope=review  仅返回 monitor_review 启用媒体
 *   scope=clue    仅返回 monitor_clue 启用媒体
 *   不传          返回全部启用媒体
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");

  let query = supabase()
    .from("media")
    .select("id, media_name, media_level, region, monitor_clue, monitor_review")
    .eq("enabled", true)
    .order("media_level", { ascending: true })
    .order("media_name", { ascending: true });

  if (scope === "review") query = query.eq("monitor_review", true);
  if (scope === "clue") query = query.eq("monitor_clue", true);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, medias: data ?? [] });
}
