import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { getTargetYear, insertCandidateFromSource } from "@/lib/calendar-candidate";
import { isVagueName, isValidCalendarDate } from "@/lib/calendar-policy";

/**
 * GET /api/admin/calendar/candidates
 * 候选池列表，支持按 target_year / review_status / source_type / dedup_status / keyword 过滤。
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const sp = request.nextUrl.searchParams;
  const targetYear = sp.get("targetYear") ? Number(sp.get("targetYear")) : await getTargetYear();
  const reviewStatus = sp.get("reviewStatus");
  const sourceType = sp.get("sourceType");
  const dedupStatus = sp.get("dedupStatus");
  const keyword = sp.get("keyword")?.trim();
  const withClusters = sp.get("withClusters") === "1";

  const db = supabase();
  let query = db
    .schema("public")
    .from("calendar_candidate")
    .select("*")
    .eq("target_year", targetYear)
    .order("created_at", { ascending: true });

  if (reviewStatus) query = query.eq("review_status", reviewStatus);
  if (sourceType) query = query.eq("source_type", sourceType);
  if (dedupStatus) query = query.eq("dedup_status", dedupStatus);
  if (keyword) query = query.ilike("node_name", `%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const categoryIds = Array.from(
    new Set((data ?? []).map((c: { category_id: string | null }) => c.category_id).filter(Boolean) as string[]),
  );
  const { data: categoryRows } = await db
    .schema("public")
    .from("calendar_category")
    .select("id, code, category_name, color")
    .in("id", categoryIds.length ? categoryIds : ["__none__"]);
  const categoryMap = new Map((categoryRows ?? []).map((c: { id: string }) => [c.id, c]));

  const items = (data ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    information_status: (isVagueName(String(c.node_name ?? "")) || String(c.ai_reason ?? "").startsWith("信息待补全")) ? "needs_completion" : "complete",
    category: c.category_id ? categoryMap.get(c.category_id as string) ?? null : null,
  }));

  let clusters: { primaryId: string; memberIds: string[] }[] | undefined;
  if (withClusters) {
    const { clusterCandidates } = await import("@/lib/calendar-dedup");
    const clustersRaw = clusterCandidates(
      items as unknown as Parameters<typeof clusterCandidates>[0],
    );
    clusters = clustersRaw.map((cl) => ({
      primaryId: cl.primaryId,
      memberIds: cl.members.map((m) => m.id),
    }));
  }

  return NextResponse.json({ items, targetYear, clusters });
}

/** 新增候选（手动 / 粘贴识别 / AI 推荐 统一入口） */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const nodeName = String(body.node_name ?? "").trim();
  if (!nodeName) return NextResponse.json({ error: "节点名称必填" }, { status: 400 });

  const allowedSource = ["manual", "pasted_text", "ai_supplement"] as const;
  const sourceType = allowedSource.includes(body.source_type)
    ? body.source_type
    : "manual";

  const targetYear = Number(body.target_year) || (await getTargetYear());
  const dateStatus = ["confirmed", "month_known", "unknown"].includes(body.date_status)
    ? body.date_status
    : "unknown";

  let candidateDate: string | null = null;
  let candidateMonth: number | null = null;
  if (dateStatus === "confirmed") {
    candidateDate = String(body.candidate_date ?? "");
    if (!isValidCalendarDate(candidateDate) || !candidateDate.startsWith(`${targetYear}-`)) {
      return NextResponse.json({ error: "confirmed 节点需提供 YYYY-MM-DD 日期" }, { status: 400 });
    }
  } else if (dateStatus === "month_known") {
    const m = Number(body.candidate_month);
    if (!m || m < 1 || m > 12) {
      return NextResponse.json({ error: "month_known 节点需提供 1-12 月份" }, { status: 400 });
    }
    candidateMonth = m;
  }

  try {
    const { item, duplicateOfId } = await insertCandidateFromSource(
      {
        node_name: nodeName,
        target_year: targetYear,
        date_status: dateStatus,
        candidate_date: candidateDate,
        candidate_month: candidateMonth,
        category_id: body.category_id || null,
        region: ["national", "guangdong", "guangzhou", "other"].includes(body.region)
          ? body.region
          : "national",
        importance: ["S", "A", "B"].includes(body.importance) ? body.importance : "B",
        source_type: sourceType,
        source_detail: body.source_detail || null,
        raw_text: body.raw_text || null,
        description: body.description || null,
        ai_reason: body.ai_reason || null,
        source_url: body.source_url || null,
      },
      auth.session.username,
    );
    return NextResponse.json({ item, duplicateOfId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
