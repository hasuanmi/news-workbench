import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getEnrichConfig, maybeAutoRetryEnrich } from "@/lib/calendar-enrich";
import { loadCalendarRecords } from "@/lib/calendar-data";
import { computeOccurrence } from "@/lib/calendar-engine";
import { calendarToday } from "@/lib/calendar-policy";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const today = calendarToday();
  const year = Number(_req.nextUrl.searchParams.get("year") ?? today.getUTCFullYear());
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return NextResponse.json({ error: "年份无效" }, { status: 400 });

  // Supabase 外键嵌套关联查询不可用，改为「主查询 + 按 category_id 二次查询 + 代码组装」
  const { records } = await loadCalendarRecords();
  const ev = records.find(event => event.id === id && event.enabled && !event.deleted_at);
  if (!ev) return NextResponse.json({ error: "节点不存在" }, { status: 404 });
  if (ev.information_status === "needs_completion") return NextResponse.json({ information_status: "needs_completion", error: "信息待补全，该记录暂不作为正式日历节点展示" }, { status: 422 });
  const occurrence = computeOccurrence(ev, year, today);

  // 补全失败时：未达自动重试上限则立即触发自动重试（不阻塞本次响应展示）
  const maxRetries = (await getEnrichConfig()).max_retries;
  const failCount = Number(ev.enrich_fail_count ?? 0);
  if (ev.enrich_status === "failed" && failCount < maxRetries) {
    void maybeAutoRetryEnrich(id);
  }
  // 已达重试上限 → 仅此时才允许用户「重新生成」（后台管理的异常恢复，不作为正常流程）
  const canManualRegen = ev.enrich_status === "failed" && failCount >= maxRetries;

  let category: { id: string; code: string; category_name: string; color: string } | null = null;
  if (ev.category_id) {
    const { data: cat } = await supabase()
      .schema("public")
      .from("calendar_category")
      .select("id, code, category_name, color")
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
    anniversary: occurrence?.anniversary ?? null,
    occurrence_date: occurrence?.date ?? null,
    display_year: year,
    read_only: ev.read_only || (ev.event_type === "dynamic" && ev.calendar_year !== year),
    region: ev.region,
    importance: ev.importance,
    review_status: ev.review_status,
    enabled: ev.enabled,
    needs_review: ev.needs_review,
    description: ev.description,
    tags: Array.isArray(ev.tags) ? ev.tags : [],
    source_name: ev.source_name,
    source_type: ev.source_type ?? null,
    source: ev.source ?? null,
    event_year: ev.event_year ?? null,
    date_status: ev.date_status,
    event_month: ev.event_month,
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
      failCount,
      canManualRegen,
      maxRetries,
      enriched_at: ev.enriched_at ?? null,
    },
  };

  return NextResponse.json({ item });
}
