import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET /api/review/[id] — 历史评报详情（含四区块结构 + 展示规则）
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabase();

  const { data, error } = await db.from("daily_review").select("*").eq("id", id).single();
  if (error || !data) {
    return NextResponse.json({ error: "评报不存在" }, { status: 404 });
  }

  // 读取展示规则
  const { data: cfg } = await db
    .from("app_config")
    .select("value")
    .eq("key", "review.display_rules")
    .single();
  let displayRules = null;
  if (cfg?.value) {
    try {
      displayRules = typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value;
    } catch {
      displayRules = null;
    }
  }

  let sections: any = {};
  try {
    sections = typeof data.sections === "string" ? JSON.parse(data.sections) : data.sections ?? {};
  } catch {
    sections = {};
  }

  // 还原 modules 数组（按固定顺序）
  const moduleOrder = ["today_focus", "same_topic", "peer_highlights", "gz_daily"];
  const modules = moduleOrder
    .map((key) => sections[key])
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  return NextResponse.json({
    success: true,
    review: {
      id: data.id,
      report_date: data.report_date,
      review_status: data.review_status,
      version: data.version,
      final_summary: data.final_summary ?? "",
      modules,
      conditions: sections.conditions ?? null,
      display_rules: displayRules,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
  });
}
