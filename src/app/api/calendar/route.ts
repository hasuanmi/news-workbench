import { NextRequest, NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import { buildCalendar, normalizeEventName, type RangeView } from "@/lib/calendar-engine";
import { loadCalendarRecords } from "@/lib/calendar-data";
import { calendarToday, isVagueName, isValidCalendarDate, calendarNameIssue } from "@/lib/calendar-policy";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const today = calendarToday();
  const year = Number(sp.get("year") ?? today.getUTCFullYear());
  const view = sp.get("view") ?? "year";
  if (!Number.isInteger(year) || year < 1900 || year > 2100 || !["year", "all", "next30", "month", "week", "next14"].includes(view)) {
    return NextResponse.json({ error: "请选择有效年份（1900–2100）与时间范围" }, { status: 400 });
  }
  try {
    const { records, years, currentYear } = await loadCalendarRecords();
    const category = sp.get("category"), region = sp.get("region"), importance = sp.get("importance");
    const keyword = sp.get("keyword")?.trim();
    const filtered = records.filter(event => {
      if (event.deleted_at || (!event.enabled && sp.get("all") !== "1")) return false;
      if (category && event.category_id !== category) return false;
      if (importance && event.importance !== importance) return false;
      if (region === "local" && !["local", "guangdong", "guangzhou"].includes(event.region ?? "")) return false;
      if (region === "national" && event.region !== "national") return false;
      return !keyword || event.event_name.includes(keyword);
    });
    if (sp.get("all") === "1") return NextResponse.json({ items: filtered.filter(e => !e.read_only), total: filtered.filter(e => !e.read_only).length });
    const cfg = await getAppConfig();
    const annual = view === "year" || view === "all";
    const rangeDays = view === "week" ? 7 : view === "next14" ? cfg.calendarWindowDays : 30;
    const occurrences = buildCalendar(filtered, today, view as RangeView, cfg.calendarWindowDays, year);
    const seen = new Set<string>();
    const items = occurrences.filter(({ event, date }) => {
      const key = `${normalizeEventName(event.event_name)}|${date}|${event.region ?? "national"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(({ event, date, daysUntil, anniversary }) => ({
      ...event, date, daysUntil, anniversary,
      information_status: "complete", background: event.description ?? null,
    }));
    const selectedYear = annual ? year : currentYear;
    const floatingSeen = new Set<string>();
    const floating = filtered.filter(event => {
      if (event.information_status === "needs_completion" || event.calendar_year !== selectedYear || !["month_known", "unknown"].includes(event.date_status ?? "") || isVagueName(event.event_name)) return false;
      // 无具体日期不能断言落在未来30天；仅在全年视图展示。
      if (!annual) return false;
      const key = `${event.event_name}|${event.event_month ?? ""}|${event.region}`;
      if (floatingSeen.has(key)) return false;
      floatingSeen.add(key);
      return true;
    }).map(event => ({ ...event, candidate_month: event.event_month ?? null, information_status: "complete" }));
    const incompleteSeen = new Set<string>();
    const needsCompletion = filtered.filter(event => event.calendar_year === selectedYear && (
      event.information_status === "needs_completion" || isVagueName(event.event_name) || (event.date_status === "confirmed" && !isValidCalendarDate(event.event_date || event.original_date || ""))
    )).filter(event => { if (incompleteSeen.has(event.event_name)) return false; incompleteSeen.add(event.event_name); return true; })
      .map(event => ({ id: event.id, event_name: event.event_name, source: event.source, source_type: event.source_type, information_status: "needs_completion", reason: calendarNameIssue(event.event_name) ?? "日期或跨年依据不足，待核实后展示" }));
    return NextResponse.json({ items, floating, needsCompletion, total: items.length, year: selectedYear, years, currentYear, windowDays: annual ? null : rangeDays });
  } catch {
    return NextResponse.json({ error: "新闻日历数据暂时无法加载，请检查数据库连接后重试" }, { status: 503 });
  }
}
