import "server-only";
import { supabase } from "@/lib/db";
import { reviewDayBounds, reviewDate } from "@/lib/review-date";

/** Count the whole business day; no PostgREST row-limit truncation. */
export async function reviewDayInventory(date: string) {
  const { start, end } = reviewDayBounds(date);
  const media = new Set<string>();
  let total = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase().from("article").select("id,media_id")
      .eq("is_test", false).gte("publish_time", start).lt("publish_time", end)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error("文章入库统计暂时无法读取，请重试");
    for (const row of data ?? []) { total++; if (row.media_id) media.add(row.media_id); }
    if (!data || data.length < 500) return { total, mediaCount: media.size };
  }
}

export async function latestReviewDataDate() {
  const { data, error } = await supabase().from("article").select("publish_time")
    .eq("is_test", false).lte("publish_time", new Date().toISOString())
    .order("publish_time", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("最近有数据日期暂时无法读取，请重试");
  return data?.publish_time ? reviewDate(data.publish_time) : null;
}
