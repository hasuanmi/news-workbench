import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runCluePipeline } from "@/lib/clue-pipeline";
import { supabase } from "@/lib/db";

/** POST /api/admin/leads/identify — 触发线索识别流水线（接受动态条件） */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));

  // 默认时间窗口从配置 clue.identify_rules 读取（不硬编码 24h）
  const { data: ruleRow } = await supabase()
    .from("app_config")
    .select("value")
    .eq("key", "clue.identify_rules")
    .maybeSingle();
  let defaultTimeRange: "24h" | "3d" | "7d" = "24h";
  if (ruleRow?.value) {
    try {
      const parsed = typeof ruleRow.value === "string" ? JSON.parse(ruleRow.value) : ruleRow.value;
      if (parsed?.default_time_range === "24h" || parsed.default_time_range === "3d" || parsed.default_time_range === "7d") {
        defaultTimeRange = parsed.default_time_range;
      }
    } catch {
      /* 用默认 */
    }
  }

  // 动态条件
  const filter = {
    timeRange: body.timeRange || defaultTimeRange,
    customStart: body.customStart,
    customEnd: body.customEnd,
    mediaScope: body.mediaScope || "all",
    customMediaIds: body.customMediaIds,
    clueTypes: body.clueTypes || ["new_column", "series", "special_topic", "feature_plan"],
    topics: body.topics || [],
    customRequirement: body.customRequirement,
  };

  const result = await runCluePipeline(filter);

  // 读取展示规则
  const { data: configData } = await supabase()
    .from("app_config")
    .select("value")
    .eq("key", "clue.display_rules")
    .single();

  let displayRules = null;
  if (configData?.value) {
    displayRules = typeof configData.value === "string" ? JSON.parse(configData.value) : configData.value;
  }

  // 将 series_name 映射为 clue_name，并附加 display_rules
  const clues = (result.clues || []).map((c: any) => ({
    ...c,
    clue_name: c.series_name || c.clue_name || "",
    display_rules: displayRules,
  }));

  const success = result.errors.length === 0;
  return NextResponse.json({ ...result, success, clues, stats: {...result.stats,processed:result.processed,cluesFound:result.cluesFound}, errors: result.errors }, { status: success ? 200 : 500 });
}
