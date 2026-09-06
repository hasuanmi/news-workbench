import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getAppConfig } from "@/lib/config";
import { buildCalendar, type RangeView } from "@/lib/calendar-engine";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const view = (sp.get("view") ?? "next14") as RangeView;
  const category = sp.get("category"); // 分类 code
  const region = sp.get("region"); // all / national / local / both
  const importance = sp.get("importance"); // S / A / B / null
  const keyword = sp.get("keyword")?.trim();
  const includePast = sp.get("include_past") === "1";
  const all = sp.get("all") === "1"; // 后台用：返回未审核/停用的原始数据

  const db = supabase();
  let query = db
    .schema("public")
    .from("calendar_event")
    .select("*")
    .order("event_date", { ascending: true });

  if (all) {
    // 后台列表不过滤状态
  } else {
    query = query.eq("enabled", true).eq("review_status", "approved");
  }
  if (category) query = query.eq("category_id", category);
  if (importance) query = query.eq("importance", importance);
  if (region === "local") query = query.eq("region", "local");
  if (region === "national") query = query.eq("region", "national");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 二次查询分类，避免依赖外键嵌套关联
  const categoryIds = Array.from(
    new Set((data ?? []).map((e) => e.category_id).filter((v): v is string => Boolean(v)))
  );
  const { data: categoryRows } = await supabase()
    .schema("public")
    .from("calendar_category")
    .select("id, code, category_name, color")
    .in("id", categoryIds.length ? categoryIds : ["__none__"]);
  const categoryMap = new Map((categoryRows ?? []).map((c) => [c.id, c]));

  const events = (data ?? []).map((e) => ({
    ...e,
    category: e.category_id ? categoryMap.get(e.category_id) ?? null : null,
  }));

  const filtered = keyword
    ? events.filter((e) => e.event_name.includes(keyword))
    : events;

  const cfg = await getAppConfig();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (all) {
    return NextResponse.json({ items: filtered, total: filtered.length });
  }

  const occurrences = buildCalendar(
    filtered as unknown as Parameters<typeof buildCalendar>[0],
    today,
    view,
    cfg.calendarWindowDays
  ).filter((o) => includePast || o.daysUntil >= 0);

  const eventMap = new Map(events.map((e) => [e.id, e]));

  return NextResponse.json({
    items: occurrences.map((o) => {
      const raw = eventMap.get(o.event.id);
      return {
        id: o.event.id,
        event_name: o.event.event_name,
        date: o.date,
        daysUntil: o.daysUntil,
        anniversary: o.anniversary,
        importance: o.event.importance,
        region: o.event.region,
        category: (raw as { category?: { code: string; category_name: string; color: string } | null } | undefined)?.category ?? null,
        background: (raw as { background?: string | null } | undefined)?.background ?? null,
        planning_hint: (raw as { planning_hint?: unknown } | undefined)?.planning_hint ?? null,
        source: (raw as { source?: string | null } | undefined)?.source ?? null,
        tags: (raw as { tags?: unknown } | undefined)?.tags ?? null,
      };
    }),
    total: occurrences.length,
    windowDays: cfg.calendarWindowDays,
  });
}
