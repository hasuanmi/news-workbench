import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { buildCalendar, type CalendarRuleEvent } from "@/lib/calendar-engine";
import type { NextRequest } from "next/server";

// 北京时间（Asia/Shanghai, UTC+8，无夏令时）自然日起点，用于"今日线索"口径
function beijingDayStart(): string {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 3600 * 1000);
  beijing.setUTCHours(0, 0, 0, 0);
  return new Date(beijing.getTime() - 8 * 3600 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const db = supabase();
  const isAdmin = true; // 本版本取消角色区别：登录用户即拥有管理员权限

  // 未来14天已审批启用节点
  const { data: events, error: calendarError } = await db
    .schema("public")
    .from("calendar_event")
    .select("id, event_name, event_date, original_date, event_type, enabled, deleted_at, date_status")
    .eq("enabled", true)
    .is("deleted_at", null);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [
    { count: reviewQueue },
    { count: pendingNodes },
    { count: mediaCount },
    { count: todayLeads },
    { count: reviewCount },
  ] = await Promise.all([
    isAdmin
      ? db.schema("public").from("news_clue").select("id", { count: "exact", head: true }).eq("review_status", "pending")
      : Promise.resolve({ count: 0 }),
    Promise.resolve({ count: 0 }), // 旧响应兼容：日历不再有待审核队列
    db.schema("public").from("media").select("id", { count: "exact", head: true }).eq("enabled", true),
    // 今日线索：北京时间（Asia/Shanghai, UTC+8）自然日；修复原查询 news_clue.source_type（该列不存在）的 BUG
    db.schema("public").from("news_clue").select("id", { count: "exact", head: true }).eq("is_test", false).gte("created_at", beijingDayStart()),
    db.schema("public").from("daily_review").select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    upcoming14d: buildCalendar((events ?? []) as CalendarRuleEvent[], today, "next14", 14).length,
    calendar_warning: calendarError?.message ?? null,
    reviewQueue: reviewQueue ?? 0,
    pendingNodes: pendingNodes ?? 0,
    mediaCount: mediaCount ?? 0,
    todayLeads: todayLeads ?? 0,
    reviewCount: reviewCount ?? 0,
    isAdmin,
  });
}
