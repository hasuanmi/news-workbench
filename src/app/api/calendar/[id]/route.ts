import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Supabase 外键嵌套关联查询不可用，改为「主查询 + 按 category_id 二次查询 + 代码组装」
  const { data: ev, error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ev) return NextResponse.json({ error: "节点不存在" }, { status: 404 });

  let category: { code: string; category_name: string; color: string } | null = null;
  if (ev.category_id) {
    const { data: cat } = await supabase()
      .schema("public")
      .from("calendar_category")
      .select("code, category_name, color")
      .eq("id", ev.category_id)
      .maybeSingle();
    category = cat ?? null;
  }

  const item = {
    id: ev.id,
    event_name: ev.event_name,
    event_type: ev.event_type,
    original_date: ev.original_date,
    event_date: ev.event_date,
    anniversary_base_year: ev.anniversary_base_year,
    anniversary: ev.anniversary,
    region: ev.region,
    importance: ev.importance,
    review_status: ev.review_status,
    enabled: ev.enabled,
    needs_review: ev.needs_review,
    description: ev.description,
    tags: Array.isArray(ev.tags) ? ev.tags : [],
    source_name: ev.source_name,
    category,
    // 自动补全结果（由日历引擎自动生成，普通用户无需手动触发）
    enrich: {
      status: ev.enrich_status ?? "none",
      fingerprint: ev.enrich_fingerprint,
      background: ev.ai_background ?? null,
      why: ev.ai_why ?? null,
      topics: Array.isArray(ev.ai_topics) ? ev.ai_topics : [],
      sources: Array.isArray(ev.ai_sources) ? ev.ai_sources : [],
      error: ev.enrich_error ?? null,
      enriched_at: ev.enriched_at ?? null,
    },
  };

  return NextResponse.json({ item });
}
