import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET /api/review — 历史每日评报列表（登录用户可见）
 * 查询参数：page / pageSize / date
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const db = supabase();
  let query = db
    .from("daily_review")
    .select("id, report_date, review_status, version, final_summary, created_at, updated_at", {
      count: "exact",
    })
    .order("report_date", { ascending: false });

  if (date) query = query.eq("report_date", date);

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reviews = (data ?? []).map((r) => ({
    id: r.id,
    report_date: r.report_date,
    review_status: r.review_status,
    version: r.version,
    summary_preview: (r.final_summary ?? "").slice(0, 120),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return NextResponse.json({
    success: true,
    total: count ?? 0,
    page,
    pageSize,
    reviews,
  });
}
