/**
 * POST /api/ingest/articles
 * 外部抓取服务回推文章（推模式入库）。
 *
 * 鉴权：Header `Authorization: Bearer <ingest_token>` 或 `X-Ingest-Token`。
 *
 * 请求体（单次可上报多个数据源）：
 * {
 *   "results": [
 *     {
 *       "sourceId": "...",
 *       "success": true,
 *       "error": null,                 // success=false 时填错误信息
 *       "articles": [
 *         { "title": "...", "url": "...", "publishedAt": "ISO", "content": "...", "wordCount": 1234 }
 *       ]
 *     }
 *   ]
 * }
 *
 * 主系统职责：校验 sourceId、文章入库去重、更新数据源状态、写任务日志。
 * 单个数据源失败不影响其他数据源，也不影响主系统任何页面。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import {
  verifyIngestToken,
  ingestArticles,
  reportSourceStatus,
  writeIngestTaskLog,
  type IngestArticle,
} from "@/lib/ingest";

export const dynamic = "force-dynamic";

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-ingest-token");
}

interface IngestResultItem {
  sourceId?: string;
  success?: boolean;
  error?: string | null;
  articles?: IngestArticle[];
}

export async function POST(request: NextRequest) {
  if (!(await verifyIngestToken(getToken(request)))) {
    return NextResponse.json({ error: "未授权：ingest token 无效" }, { status: 401 });
  }

  let body: { results?: IngestResultItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length === 0) {
    return NextResponse.json({ error: "results 为空" }, { status: 400 });
  }

  // 预校验 sourceId 全部存在（同时取 media_id 供入库）
  const sourceIds = Array.from(
    new Set(results.map((r) => r.sourceId).filter((x): x is string => !!x))
  );
  const { data: existing } = await supabase()
    .schema("public")
    .from("media_source")
    .select("id, media_id")
    .in("id", sourceIds);
  const sourceMap = new Map((existing ?? []).map((s) => [s.id, s.media_id]));
  const validIds = new Set((existing ?? []).map((s) => s.id));

  let successSources = 0;
  let failedSources = 0;
  let totalInserted = 0;
  const perSource: Array<{
    sourceId: string;
    ok: boolean;
    inserted?: number;
    duplicated?: number;
    invalid?: number;
    failed?: number;
    error?: string;
    errors?: string[];
  }> = [];

  for (const item of results) {
    const sourceId = item.sourceId;
    if (!sourceId || !validIds.has(sourceId)) {
      failedSources += 1;
      perSource.push({ sourceId: sourceId ?? "unknown", ok: false, error: "数据源不存在" });
      continue;
    }

    if (item.success === false) {
      await reportSourceStatus(sourceId, false, item.error ?? "外部抓取服务上报失败");
      failedSources += 1;
      perSource.push({ sourceId, ok: false, error: item.error ?? "抓取失败" });
      continue;
    }

    try {
      const articles = Array.isArray(item.articles) ? item.articles : [];
      const r = await ingestArticles(sourceId, articles, sourceMap.get(sourceId));
      await reportSourceStatus(sourceId, true);
      successSources += 1;
      totalInserted += r.inserted;
      perSource.push({
        sourceId,
        ok: true,
        inserted: r.inserted,
        duplicated: r.duplicated + r.invalid,
        failed: r.failed,
        errors: r.errors,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "入库异常";
      await reportSourceStatus(sourceId, false, msg);
      failedSources += 1;
      perSource.push({ sourceId, ok: false, error: msg });
    }
  }

  await writeIngestTaskLog({
    status: failedSources > 0 && successSources === 0 ? "failed" : "success",
    sourceCount: results.length,
    successCount: successSources,
    failureCount: failedSources,
    newDataCount: totalInserted,
    errorMessage: failedSources > 0 ? `${failedSources} 个数据源失败` : null,
  });

  return NextResponse.json({
    success: true,
    sources: results.length,
    successSources,
    failedSources,
    inserted: totalInserted,
    perSource,
  });
}
