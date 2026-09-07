import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runCluePipeline } from "@/lib/clue-pipeline";

/** POST /api/admin/leads/identify — 触发线索识别流水线（接受动态条件） */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));

  // 动态条件
  const filter = {
    timeRange: body.timeRange || "24h",
    customStart: body.customStart,
    customEnd: body.customEnd,
    mediaScope: body.mediaScope || "all",
    customMediaIds: body.customMediaIds,
    clueTypes: body.clueTypes || ["new_column", "series", "special_topic", "feature_plan"],
    topics: body.topics || [],
    customRequirement: body.customRequirement,
  };

  const result = await runCluePipeline(filter);

  return NextResponse.json({ success: true, clues: result.clues || [], stats: result.stats });
}
