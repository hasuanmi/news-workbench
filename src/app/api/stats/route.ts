import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const db = supabase();
  const isAdmin = session.role === "admin";

  // 未来14天已审批启用节点
  const { data: events } = await db
    .schema("public")
    .from("calendar_event")
    .select("id, event_date, original_date, event_type")
    .eq("enabled", true)
    .eq("review_status", "approved");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 14 * 86400000);
  let upcoming = 0;
  for (const ev of events ?? []) {
    if (ev.event_type === "fixed" && ev.original_date) {
      const md = ev.original_date.slice(5);
      const dThisYear = new Date(Date.UTC(today.getUTCFullYear(), Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5))));
      const dNextYear = new Date(Date.UTC(today.getUTCFullYear() + 1, Number(md.slice(0, 2)) - 1, Number(md.slice(3, 5))));
      if ((dThisYear >= today && dThisYear <= horizon) || (dNextYear >= today && dNextYear <= horizon)) upcoming++;
    } else if (ev.event_type === "dynamic" && ev.event_date) {
      const d = new Date(ev.event_date);
      if (d >= today && d <= horizon) upcoming++;
    }
  }

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
    isAdmin
      ? db.schema("public").from("calendar_event").select("id", { count: "exact", head: true }).eq("needs_review", true)
      : Promise.resolve({ count: 0 }),
    db.schema("public").from("media").select("id", { count: "exact", head: true }).eq("enabled", true),
    db.schema("public").from("news_clue").select("id", { count: "exact", head: true }).eq("source_type", "media_monitor"),
    db.schema("public").from("daily_review").select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    upcoming14d: upcoming,
    reviewQueue: reviewQueue ?? 0,
    pendingNodes: pendingNodes ?? 0,
    mediaCount: mediaCount ?? 0,
    todayLeads: todayLeads ?? 0,
    reviewCount: reviewCount ?? 0,
    isAdmin,
  });
}
