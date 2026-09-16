/**
 * POST /api/admin/ingest/mock
 * 【联调用】模拟外部抓取服务推送：生成仿真文章，走与真实推送完全相同的
 * ingest 入库链路（去重 / 状态更新 / 任务日志）。不发起任何真实网络请求。
 *
 * 请求体（均可选）：
 *   { "sourceId": "xxx", "perSource": 3 }
 * 不传 sourceId 时，对所有启用中的数据源模拟一次推送。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { ingestArticles, reportSourceStatus, writeIngestTaskLog } from "@/lib/ingest";
import { generateMockArticles } from "@/lib/mock-ingest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let sourceId: string | null = null;
  let perSource = 3;
  try {
    const body = await request.json();
    if (body?.sourceId) sourceId = String(body.sourceId);
    if (Number.isFinite(body?.perSource)) perSource = Math.min(20, Math.max(1, Number(body.perSource)));
  } catch {
    // 无 body 时用默认值
  }

  // 取目标数据源（含媒体名用于生成可读 mock 内容）
  let sourceQuery = supabase()
    .schema("public")
    .from("media_source")
    .select("id, media_id, enabled")
    .eq("enabled", true);
  if (sourceId) sourceQuery = sourceQuery.eq("id", sourceId);

  const { data: sources, error: sourceErr } = await sourceQuery;
  if (sourceErr || !sources || sources.length === 0) {
    return NextResponse.json({ error: "没有可模拟推送的启用数据源" }, { status: 404 });
  }

  const mediaIds = Array.from(new Set(sources.map((s) => s.media_id)));
  const { data: medias } = await supabase()
    .schema("public")
    .from("media")
    .select("id, media_name")
    .in("id", mediaIds);
  const mediaNameMap = new Map((medias ?? []).map((m) => [m.id, m.media_name]));

  let successSources = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  const details: Array<{ sourceId: string; inserted: number; updated: number; duplicated: number }> = [];

  for (const src of sources) {
    try {
      const mockArticles = generateMockArticles(
        src.id,
        mediaNameMap.get(src.media_id) ?? "",
        perSource
      );
      const r = await ingestArticles(src.id, mockArticles, src.media_id);
      await reportSourceStatus(src.id, true, null, r.inserted + r.updated);
      successSources += 1;
      totalInserted += r.inserted;
      totalUpdated += r.updated;
      details.push({
        sourceId: src.id,
        inserted: r.inserted,
        updated: r.updated,
        duplicated: r.duplicated + r.invalid,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "mock 入库异常";
      await reportSourceStatus(src.id, false, msg);
      details.push({ sourceId: src.id, inserted: 0, updated: 0, duplicated: 0 });
    }
  }

  await writeIngestTaskLog({
    status: "success",
    sourceCount: sources.length,
    successCount: successSources,
    failureCount: sources.length - successSources,
    newDataCount: totalInserted + totalUpdated,
    errorMessage: "mock 模拟推送",
  });

  return NextResponse.json({
    success: true,
    mock: true,
    sources: sources.length,
    inserted: totalInserted,
    updated: totalUpdated,
    details,
  });
}
