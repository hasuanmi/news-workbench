import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { reviewDate } from "@/lib/review-date";
import { buildConditionsFromRules } from "@/lib/review-draft";
import { fetchReviewArticles } from "@/lib/review-engine";
import { latestReviewDataDate, reviewDayInventory } from "@/lib/review-availability";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  let date: string;
  try { date = reviewDate(req.nextUrl.searchParams.get("date") ?? new Date()); }
  catch { return NextResponse.json({ error: "请选择有效日期" }, { status: 400 }); }
  try {
    const conditions = await buildConditionsFromRules({ date });
    const [{ diagnostics }, latestDate] = await Promise.all([
      fetchReviewArticles(conditions), latestReviewDataDate(),
    ]);
    const latest = latestDate ? { date: latestDate, ...(latestDate === date ? diagnostics : await reviewDayInventory(latestDate)) } : null;
    return NextResponse.json({ date, ...diagnostics, minWordCount: conditions.minWordCount, latest, aiEntered: false });
  } catch {
    return NextResponse.json({ error: "评报数据诊断暂时无法读取，请重试；未将查询失败当作零篇文章。" }, { status: 503 });
  }
}
