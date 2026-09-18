import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET /api/home/preview — 首页「工作内容预览」
 *
 * 仅两块：未来7天新闻节点 + 最新新闻线索（新栏目）。
 * 展示条数默认 3，可在后台配置：
 *   home.show_upcoming  —— 未来7天节点条数（默认3）
 *   home.show_leads     —— 最新线索条数（默认3）
 *   calendar.home_days  —— 首页节点天数（默认7）
 *
 * 统计/待办不再放首页（移至系统管理）。
 */
export async function GET(req: NextRequest) {
  const db = supabase();

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
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString().split("T")[0];
  const horizonIso = new Date(today.getTime() + homeDays * 86400000)
    .toISOString()
    .split("T")[0];

  // 已启用、非软删除、日期已确定（confirmed）的节点，落在 [today, today+homeDays]
  const { data: events, error: evErr } = await db
    .schema("public")
    .from("calendar_event")
    .select("id, event_name, event_type, original_date, event_date, event_year, anniversary_base_year, importance, date_status, event_month, review_status")
    .eq("enabled", true)
    .is("deleted_at", null);

  const upcoming: {
    id: string;
    name: string;
    date: string;
    importance: string;
    anniversary: number | null;
  }[] = [];

  if (evErr) {
    // 表结构/权限异常时不阻断（首页降级为空节点块）
  } else {
    for (const ev of events ?? []) {
      if (ev.date_status !== "confirmed") continue;
      let occDate: string | null = null;
      let anniversary: number | null = null;

      if (ev.event_type === "fixed" && ev.original_date) {
        const md = ev.original_date.slice(5);
        const m = Number(md.slice(0, 2));
        const d = Number(md.slice(3, 5));
        const y = today.getUTCFullYear();
        // 取下一个 >= today 的当月日，跨年滚动到下一年
        let year = y;
        let dt = new Date(Date.UTC(year, m - 1, d));
        if (dt.getTime() < today.getTime()) {
          year += 1;
          dt = new Date(Date.UTC(year, m - 1, d));
        }
        if (dt.getTime() > new Date(horizonIso + "T00:00:00Z").getTime()) continue;
        const baseYear = ev.event_year ?? ev.anniversary_base_year ?? null;
        const anv = baseYear != null ? year - baseYear : null;
        occDate = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        anniversary = anv != null && anv > 0 ? anv : null;
      } else if (ev.event_type === "dynamic" && ev.event_date) {
        if (ev.event_date < todayIso || ev.event_date > horizonIso) continue;
        occDate = ev.event_date;
        const baseYear = ev.event_year ?? null;
        const anv = baseYear != null
          ? Number(ev.event_date.slice(0, 4)) - baseYear
          : null;
        anniversary = anv != null && anv > 0 ? anv : null;
      }
      if (!occDate) continue;
      upcoming.push({
        id: ev.id,
        name: ev.event_name,
        date: occDate,
        importance: ev.importance || "B",
        anniversary,
      });
    }
    // 按日期升序
    upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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

  return NextResponse.json({
    success: true,
    show_upcoming: showUpcoming,
    show_leads: showLeads,
    home_days: homeDays,
    upcoming,
    calendar_warning: evErr ? "新闻节点暂时无法加载，请检查新闻日历数据连接。" : null,
    latest_leads: latestLeads,
  });
}
