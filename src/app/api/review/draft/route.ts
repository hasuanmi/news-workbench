import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  fetchReviewArticles,
  type ReviewConditions,
} from "@/lib/review-engine";
import {
  buildDraft,
  saveDraft,
  loadDraftByDate,
  updateDraftExclusions,
  resolveComparisonMedia,
} from "@/lib/review-draft";

/**
 * POST /api/review/draft — 阶段1：为本期生成选稿（筛选 + AI 分组），落库可追溯
 * Body: { date, minWordCount, dimensions, topics, scanMissing, customRequirement, mediaIds? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const dateStr = new Date(
    typeof body.date === "string" ? body.date : new Date().toISOString(),
  )
    .toISOString()
    .split("T")[0];

  const conditions: ReviewConditions = {
    date: body.date || new Date().toISOString(),
    mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds : [],
    minWordCount: typeof body.minWordCount === "number" ? body.minWordCount : 2000,
    highlightFlags: Array.isArray(body.highlightFlags) ? body.highlightFlags : [],
    dimensions: Array.isArray(body.dimensions) ? body.dimensions : [],
    topics: Array.isArray(body.topics) ? body.topics : [],
    scanMissing: body.scanMissing !== false,
    customRequirement: body.customRequirement,
  };

  try {
    // 固定比较媒体（默认六家）
    const { mediaIds } = await resolveComparisonMedia(conditions.mediaIds);
    conditions.mediaIds = mediaIds;

    const { articles, gzMediaNames } = await fetchReviewArticles(conditions);
    if (articles.length === 0) {
      return NextResponse.json(
        { error: `${dateStr} 没有符合条件的文章，请放宽字数阈值或检查媒体数据源` },
        { status: 400 },
      );
    }

    const draft = await buildDraft(conditions, dateStr, articles, gzMediaNames);
    const row = await saveDraft({
      report_date: dateStr,
      draft,
      min_word_count: conditions.minWordCount,
      conditions,
      created_by: auth.session.sub,
    });

    return NextResponse.json({
      success: true,
      id: row.id,
      report_date: dateStr,
      articleCount: articles.length,
      draft,
      conditions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** GET /api/review/draft?date=YYYY-MM-DD — 读取已生成选稿（可追溯） */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "缺少 date 参数" }, { status: 400 });

  const row = await loadDraftByDate(date);
  if (!row) return NextResponse.json({ error: "该日期暂无选稿" }, { status: 404 });
  return NextResponse.json({ success: true, draft: row });
}

/** PATCH /api/review/draft — 更新该日期选稿的排除稿（可追溯） */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const date = String(body.date ?? "").trim();
  const excluded = Array.isArray(body.excluded_article_ids)
    ? body.excluded_article_ids.filter((x: unknown): x is string => typeof x === "string")
    : [];
  if (!date) return NextResponse.json({ error: "缺少 date 参数" }, { status: 400 });

  await updateDraftExclusions(date, excluded);
  const row = await loadDraftByDate(date);
  return NextResponse.json({ success: true, draft: row });
}