import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(candidateDate)) {
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

    // 映射为 calendar_event
    const targetYear = cand.target_year;
    let eventRow: Record<string, unknown>;
    if (dateStatus === "confirmed" && candidateDate) {
      const mmdd = candidateDate.slice(5, 10); // MM-DD
      eventRow = {
        event_name: nodeName,
        event_type: "fixed",
        original_date: `${targetYear}-${mmdd}`,
        event_date: null,
        anniversary_base_year: cand.base_year ?? targetYear,
        event_month: Number(mmdd.slice(0, 2)),
        date_status: "confirmed",
      };
    } else if (dateStatus === "month_known") {
      eventRow = {
        event_name: nodeName,
        event_type: "dynamic",
        original_date: null,
        event_date: null,
        anniversary_base_year: null,
        event_month: candidateMonth,
        date_status: "month_known",
      };
    } else {
      eventRow = {
        event_name: nodeName,
        event_type: "dynamic",
        original_date: null,
        event_date: null,
        anniversary_base_year: null,
        event_month: null,
        date_status: "unknown",
      };
    }

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
