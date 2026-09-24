import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { loadCalendarRecords } from "@/lib/calendar-data";
import { buildCalendar, normalizeEventName } from "@/lib/calendar-engine";
import { calendarToday, isVagueName, isValidCalendarDate } from "@/lib/calendar-policy";
import { getWorkbenchTasks } from "@/lib/workbench-status";

/**
 * GET /api/home/preview — 首页「工作内容预览」
 *
 * 仅两块：未来7天新闻节点 + 最新新闻线索（新栏目）。
 * 展示条数默认 3，可在后台配置：
 *   home.show_upcoming  —— 未来7天节点条数（默认3）
 *   home.show_leads     —— 最新线索条数（默认3）
 *   calendar.home_days  —— 首页节点天数（默认7）
 *
 * 附带轻量待办及实际执行状态。
 */
export async function GET() {
  const db = supabase();
  const taskPromise = getWorkbenchTasks();
  const pendingPromise = db.from("news_clue").select("id", { count: "exact", head: true })
    .eq("is_test", false).eq("review_status", "pending");

  // 读取可配数值
  const readNum = async (key: string, fallback: number): Promise<number> => {
    const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
    if (data?.value == null) return fallback;
    const n = Number(typeof data.value === "string" ? data.value : data.value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const showUpcoming = await readNum("home.show_upcoming", 3);
  const showLeads = await readNum("home.show_leads", 3);
  const homeDays = await readNum("calendar.home_days", 7);

  // ===== 1. 未来 N 天新闻节点 =====
  const today = calendarToday();
  let calendarWarning: string | null = null;
  let needsCompletion: number | null = null;
  let upcoming: { id: string; name: string; date: string; importance: string; anniversary: number | null; source: string | null; source_type: string | null }[] = [];
  try {
    const { records } = await loadCalendarRecords();
    needsCompletion = new Set(records.filter(event => event.enabled && !event.deleted_at && event.calendar_year === today.getUTCFullYear() && (
      event.information_status === "needs_completion" || isVagueName(event.event_name) ||
      (event.date_status === "confirmed" && !isValidCalendarDate(event.event_date || event.original_date || ""))
    )).map(event => event.event_name)).size;
    const seen = new Set<string>();
    upcoming = buildCalendar(records, today, "next14", homeDays).filter(({ event, date }) => {
      const key = `${normalizeEventName(event.event_name)}|${date}|${event.region}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, showUpcoming).map(({ event, date, anniversary }) => ({
      id: event.id, name: event.event_name, date, importance: event.importance || "B", anniversary,
      source: event.source ?? null, source_type: event.source_type ?? null,
    }));
  } catch {
    calendarWarning = "新闻节点暂时无法加载，请检查新闻日历数据连接。";
  }

  // ===== 2. 最新新闻线索（新栏目，已确认/待确认均可，取最新发现） =====
  const { data: leads, error: ldErr } = await db
    .from("news_clue")
    .select("id, clue_type, series_name, media_id, first_found_at, review_status, summary")
    .eq("is_test", false)
    .eq("clue_type", "new_column")
    .in("review_status", ["confirmed", "pending"])
    .order("first_found_at", { ascending: false })
    .limit(showLeads * 2); // 多取一点，交给媒体名补齐

  const latestLeads: {
    id: string;
    media_name: string;
    column_name: string;
    first_found_at: string;
    summary: string;
  }[] = [];
  if (!ldErr && leads && leads.length > 0) {
    const mediaIds = [...new Set(leads.map((l) => l.media_id))];
    let mediaMap = new Map<string, string>();
    if (mediaIds.length > 0) {
      const { data: mediaRows } = await db
        .from("media")
        .select("id, media_name")
        .in("id", mediaIds);
      mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));
    }
    for (const l of leads.slice(0, showLeads)) {
      latestLeads.push({
        id: l.id,
        media_name: mediaMap.get(l.media_id) ?? "未知媒体",
        column_name: l.series_name || l.summary || "未命名新栏目",
        first_found_at: l.first_found_at,
        summary: l.summary ?? "",
      });
    }
  }

  const [tasks, pending] = await Promise.all([taskPromise, pendingPromise]);
  return NextResponse.json({
    work_status: { pending_clues: pending.error ? null : pending.count, needs_completion: needsCompletion, ...tasks },
    success: true,
    show_upcoming: showUpcoming,
    show_leads: showLeads,
    home_days: homeDays,
    upcoming,
    calendar_warning: calendarWarning,
    latest_leads: latestLeads,
  });
}
