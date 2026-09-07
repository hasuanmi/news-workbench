import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runCluePipeline } from "@/lib/clue-pipeline";

/** POST /api/admin/leads/identify — 触发线索识别流水线 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const limit = typeof body.limit === "number" ? body.limit : 50;
  const mediaId = typeof body.mediaId === "string" ? body.mediaId : undefined;

  const result = await runCluePipeline({ limit, mediaId });

  return NextResponse.json({ success: true, ...result });
}
