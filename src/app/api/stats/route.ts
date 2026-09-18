import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { buildCalendar, type CalendarRuleEvent } from "@/lib/calendar-engine";
import type { NextRequest } from "next/server";

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
    db.schema("public").from("news_clue").select("id", { count: "exact", head: true }).eq("source_type", "media_monitor"),
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
