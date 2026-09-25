import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { fetchReviewArticles } from "@/lib/review-engine";
import { reviewDate, emptyReviewMessage } from "@/lib/review-date";
import { reviewErrorResponse } from "@/lib/review-data-error";
import {
  buildDraft,
  saveDraft,
  loadDraftByDate,
  updateDraftExclusions,
  buildConditionsFromRules,
} from "@/lib/review-draft";

/**
 * POST /api/review/draft — 阶段1：为本期生成选稿（筛选 + AI 分组），落库可追溯
 * Body: { date, topics?, customRequirement? }  长期规则（比较媒体/最低字数/重点稿/维度/同行遗漏扫描）由后台统一维护
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  let dateStr: string;
  try { dateStr = reviewDate(body.date === undefined ? new Date() : typeof body.date === "string" ? body.date : "invalid"); }
  catch { return NextResponse.json({ error: "请选择有效的评报日期" }, { status: 400 }); }

  let stage = "读取评报规则";
  let aiEntered = false;
  try {
    const conditions = await buildConditionsFromRules({
      date: dateStr,
      topics: Array.isArray(body.topics) ? body.topics : [],
      customRequirement: body.customRequirement,
    });

    stage = "读取与筛选候选文章";
    const { articles, gzMediaNames, diagnostics } = await fetchReviewArticles(conditions);
    if (articles.length === 0) {
      return NextResponse.json(
        { error: emptyReviewMessage(dateStr, diagnostics.total, diagnostics.selected, conditions.minWordCount), diagnostics, report_date: dateStr, stage, aiEntered },
        { status: 400 },
      );
    }

    stage = "核对广州日报覆盖范围";
    const draft = await buildDraft(conditions, dateStr, articles, gzMediaNames, () => {
      stage = "AI 选稿聚类、转载判断与同行分析";
      aiEntered = true;
    });
    stage = "保存选稿";
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
    console.error("[review/draft]", { date: dateStr, stage, aiEntered }, err);
    const failure = reviewErrorResponse(err);
    return NextResponse.json(
      { ...failure, error: `${stage}失败：${failure.error}`, stage, aiEntered },
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

  try {
    const row = await loadDraftByDate(date);
    if (!row) return NextResponse.json({ error: "该日期暂无选稿" }, { status: 404 });
    return NextResponse.json({ success: true, draft: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取选稿失败" }, { status: 500 });
  }
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

  try {
    await updateDraftExclusions(date, excluded);
    const row = await loadDraftByDate(date);
    return NextResponse.json({ success: true, draft: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新选稿失败" }, { status: 500 });
  }
}
