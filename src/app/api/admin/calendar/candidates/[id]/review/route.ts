import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { calendarToday, isVagueName, isValidCalendarDate, recurringOccurrence } from "@/lib/calendar-policy";

/**
 * POST /api/admin/calendar/candidates/[id]/review
 * 审核操作：
 *  - confirm：确认加入正式日历（写入 calendar_event，按 date_status 落字段）
 *  - reject ：不采纳（必填 rejection_reason）
 *  - merge  ：合并到另一候选（merged_into_id）
 */

const REJECT_REASONS = [
  "重复已存在",
  "非新闻节点",
  "信息不实",
  "时间已过期",
  "其他",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const session = auth.session;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const db = supabase();

  const { data: cand, error: cErr } = await db
    .schema("public")
    .from("calendar_candidate")
    .select("*")
    .eq("id", id)
    .single();
  if (cErr || !cand) {
    return NextResponse.json({ error: "候选不存在" }, { status: 404 });
  }

  try {
  const now = new Date().toISOString();

  if (action === "confirm") {
    // 允许前端"修改后加入"：覆盖字段
    const nodeName = String(body.node_name ?? cand.node_name).trim() || cand.node_name;
    if (isVagueName(nodeName)) return NextResponse.json({ information_status: "needs_completion", error: "信息待补全：请先补齐具体事件名称，不能将模糊事项加入正式日历" }, { status: 422 });
    const dateStatus =
      ["confirmed", "month_known", "unknown"].includes(body.date_status ?? "")
        ? body.date_status
        : cand.date_status;
    const categoryId = body.category_id !== undefined ? body.category_id || null : cand.category_id;
    const region = ["national", "guangdong", "guangzhou", "other"].includes(body.region)
      ? body.region
      : cand.region;
    const importance = ["S", "A", "B"].includes(body.importance) ? body.importance : cand.importance;

    let candidateDate: string | null = cand.candidate_date;
    let candidateMonth: number | null = cand.candidate_month;
    if (dateStatus === "confirmed") {
      candidateDate = String(body.candidate_date ?? cand.candidate_date ?? "");
      candidateMonth = null;
      if (!isValidCalendarDate(candidateDate) || !candidateDate.startsWith(`${cand.target_year}-`)) {
        return NextResponse.json({ error: "confirmed 节点需有效 YYYY-MM-DD 日期" }, { status: 400 });
      }
    } else if (dateStatus === "month_known") {
      const m = Number(body.candidate_month ?? cand.candidate_month);
      if (!m || m < 1 || m > 12) {
        return NextResponse.json({ error: "month_known 节点需有效月份" }, { status: 400 });
      }
      candidateMonth = m;
      candidateDate = null;
    } else {
      candidateDate = null;
      candidateMonth = null;
    }

    const targetYear = cand.target_year;
    let anniversaryBaseYear: number | null = null;
    if (cand.source_type === "ai_supplement" && targetYear !== calendarToday().getUTCFullYear()) {
      return NextResponse.json({ error: "AI推荐只补充当前年度动态事件" }, { status: 422 });
    }
    if (cand.source_type === "historical_migration" && cand.source_detail?.startsWith("history_node:")) {
      const { data: history, error } = await db.from("calendar_history_node").select("node_name,event_date,year").eq("id", cand.source_detail.slice(13)).maybeSingle();
      if (error || !history) return NextResponse.json({ error: "无法核验历史来源" }, { status: 422 });
      const recurring = recurringOccurrence({ event_name: history.node_name, event_type: "dynamic", event_date: history.event_date }, targetYear);
      anniversaryBaseYear = recurring?.baseYear ?? null;
      if (history.year !== targetYear) {
        if (!recurring || recurring.date !== candidateDate) return NextResponse.json({ information_status: "needs_completion", error: "不能将历史动态事件直接复制到其他年度；请提供该年度的具体事件依据" }, { status: 422 });
      }
    }
    // 候选均为指定年度的实际事项；跨年只由明确的固定/可推导规则生成。
    let eventRow: Record<string, unknown> = {
      event_name: nodeName, event_type: "dynamic", original_date: null,
      event_date: dateStatus === "confirmed" ? candidateDate : null,
      anniversary_base_year: anniversaryBaseYear, event_year: anniversaryBaseYear,
      event_month: dateStatus === "month_known" ? candidateMonth : null,
      date_status: dateStatus,
      tags: [`calendar-year:${targetYear}`],
      source_type: cand.source_type,
      source: ({ historical_migration: "history_migrate", ai_supplement: "ai_recommend", manual: "user_add", pasted_text: "user_paste" } as Record<string, string>)[cand.source_type] ?? "user_add",
    };

    eventRow = {
      ...eventRow,
      category_id: categoryId,
      region,
      importance,
      description: body.description ?? cand.description ?? null,
      source_name: `candidate:${cand.source_type}`,
      source_url: cand.source_url,
      source_authority: "manual",
      review_status: "approved",
      enabled: true,
      needs_review: false,
      source_candidate_id: cand.id,
      confirmed_at: now,
      confirmed_by: session.sub,
      created_by: session.sub,
    };

    const { data: ev, error: evErr } = await db
      .schema("public")
      .from("calendar_event")
      .insert(eventRow)
      .select("id")
      .single();
    if (evErr) return NextResponse.json({ error: `写入正式日历失败: ${evErr.message}` }, { status: 500 });

    await db
      .schema("public")
      .from("calendar_candidate")
      .update({
        review_status: "confirmed",
        reviewed_at: now,
        reviewed_by: session.sub,
        candidate_date: candidateDate,
        candidate_month: candidateMonth,
        date_status: dateStatus,
        node_name: nodeName,
        category_id: categoryId,
        region,
        importance,
      })
      .eq("id", id);

    return NextResponse.json({ success: true, eventId: (ev as { id: string }).id });
  }

  if (action === "reject") {
    const reason = String(body.rejectionReason ?? "");
    if (!REJECT_REASONS.includes(reason) && !String(body.rejectionReason ?? "").trim()) {
      return NextResponse.json(
        { error: "请选择不采纳原因", reasons: REJECT_REASONS },
        { status: 400 },
      );
    }
    await db
      .schema("public")
      .from("calendar_candidate")
      .update({
        review_status: "rejected",
        rejection_reason: reason || "其他",
        reviewed_at: now,
        reviewed_by: session.sub,
      })
      .eq("id", id);
    return NextResponse.json({ success: true });
  }

  if (action === "keep") {
    await db
      .schema("public")
      .from("calendar_candidate")
      .update({
        dedup_status: "kept",
        merged_into_id: null,
        reviewed_at: now,
        reviewed_by: session.sub,
      })
      .eq("id", id);
    return NextResponse.json({ success: true });
  }

  if (action === "merge") {
    const intoId = String(body.mergedIntoId ?? "");
    if (!intoId || intoId === id) {
      return NextResponse.json({ error: "请选择合并目标候选" }, { status: 400 });
    }
    const { data: target, error: tErr } = await db
      .schema("public")
      .from("calendar_candidate")
      .select("id, merged_sources, source_type")
      .eq("id", intoId)
      .single();
    if (tErr || !target) {
      return NextResponse.json({ error: "合并目标不存在" }, { status: 404 });
    }
    const targetSources: string[] = Array.isArray(target.merged_sources)
      ? (target.merged_sources as string[])
      : [];
    const label = cand.source_type;
    if (!targetSources.includes(label)) targetSources.push(label);

    await db.schema("public").from("calendar_candidate").update({ merged_sources: targetSources }).eq("id", intoId);
    await db
      .schema("public")
      .from("calendar_candidate")
      .update({
        review_status: "merged",
        dedup_status: "merged",
        merged_into_id: intoId,
        merged_sources: [label],
        reviewed_at: now,
        reviewed_by: session.sub,
      })
      .eq("id", id);
    return NextResponse.json({ success: true, mergedInto: intoId });
  }

  return NextResponse.json({ error: "未知操作: " + action }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[candidate-review] 异常:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
