/**
 * POST /api/ingest/articles
 * 外部抓取服务回推文章（正式接入接口，推模式入库）。
 *
 * 鉴权：Header `Authorization: Bearer <ingest_token>` 或 `X-Ingest-Token`。
 *
 * 请求体（schema_version = article-v1，单次可上报多个数据源）：
 * {
 *   "schema_version": "article-v1",
 *   "results": [
 *     {
 *       "source_id": "...",                 // 必填，数据源唯一身份
 *       "success": true,
 *       "error": null,                      // success=false 时填错误信息
 *       "articles": [ { ...IngestArticleDto } ]
 *     }
 *   ]
 * }
 *
 * 主系统职责：契约校验、source_id 解析、external_id 优先去重/补全更新、
 * URL/content hash 兜底去重、更新数据源抓取状态、写任务日志。
 * 单篇/单数据源失败互不影响；重复请求幂等。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import {
  verifyIngestToken,
  ingestArticles,
  reportSourceStatus,
  writeIngestTaskLog,
  toIngestArticle,
} from "@/lib/ingest";
import {
  normalizeArticle,
  INGEST_MAX_SOURCES_PER_BATCH,
  INGEST_MAX_ARTICLES_TOTAL,
} from "@/lib/ingest-contract";

export const dynamic = "force-dynamic";

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-ingest-token");
}

interface RawResult {
  source_id?: unknown;
  sourceId?: unknown; // 兼容旧 camelCase
  success?: unknown;
  error?: unknown;
  articles?: unknown;
}

interface PerSourceStat {
  sourceId: string;
  ok: boolean;
  inserted?: number;
  updated?: number;
  duplicated?: number;
  invalid?: number;
  failed?: number;
  warnings?: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  if (!(await verifyIngestToken(getToken(request)))) {
    return NextResponse.json(
      { error: "unauthorized: ingest token 无效", code: "unauthorized" },
      { status: 401 }
    );
  }

  let body: { results?: RawResult[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON", code: "invalid_json" },
      { status: 400 }
    );
  }

  const rawResults = Array.isArray(body.results) ? body.results : [];
  if (rawResults.length === 0) {
    return NextResponse.json(
      { error: "results 为空", code: "empty_results" },
      { status: 400 }
    );
  }
  if (rawResults.length > INGEST_MAX_SOURCES_PER_BATCH) {
    return NextResponse.json(
      {
        error: `单批数据源数量超过上限 ${INGEST_MAX_SOURCES_PER_BATCH}`,
        code: "batch_too_large",
      },
      { status: 400 }
    );
  }

  // 归一化每篇文章并按 source_id 分组（文章自带 source_id，与 result 顶层一致）
  const grouped = new Map<
    string,
    { success: boolean; error: string | null; articles: unknown[]; warnings: Set<string> }
  >();
  let totalArticles = 0;
  let hardInvalid = 0;

  for (const item of rawResults) {
    const sourceId =
      (typeof item.source_id === "string" && item.source_id.trim()) ||
      (typeof item.sourceId === "string" && item.sourceId.trim()) ||
      "";
    const success = item.success !== false;
    const errorMsg = typeof item.error === "string" ? item.error : null;

    if (!grouped.has(sourceId)) {
      grouped.set(sourceId, { success, error: errorMsg, articles: [], warnings: new Set() });
    }
    const g = grouped.get(sourceId)!;
    if (!success) {
      g.success = false;
      if (errorMsg) g.error = errorMsg;
    }

    const rawArticles = Array.isArray(item.articles) ? item.articles : [];
    for (const raw of rawArticles) {
      totalArticles += 1;
      if (totalArticles > INGEST_MAX_ARTICLES_TOTAL) {
        return NextResponse.json(
          {
            error: `整批文章总数超过上限 ${INGEST_MAX_ARTICLES_TOTAL}`,
            code: "batch_too_large",
          },
          { status: 400 }
        );
      }
      const n = normalizeArticle(raw);
      // 文章自带 source_id 优先（契约要求），否则归入 result 顶层 source_id
      const targetSourceId = (n.article?.sourceId || sourceId).trim();
      if (!grouped.has(targetSourceId)) {
        grouped.set(targetSourceId, {
          success: true,
          error: null,
          articles: [],
          warnings: new Set(),
        });
      }
      const tg = grouped.get(targetSourceId)!;
      if (!n.ok || !n.article) {
        hardInvalid += 1;
        tg.warnings.add(`存在被跳过的非法文章（${n.code ?? "invalid"}）`);
        continue;
      }
      n.article.warnings.forEach((w) => tg.warnings.add(w.message));
      tg.articles.push(n.article);
    }
  }

  const sourceIds = Array.from(grouped.keys()).filter(Boolean);
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
  let totalUpdated = 0;
  let totalDuplicated = 0;
  let totalInvalid = hardInvalid;
  let totalFailed = 0;
  const perSource: PerSourceStat[] = [];

  for (const [sourceId, g] of grouped) {
    if (!sourceId || !validIds.has(sourceId)) {
      failedSources += 1;
      perSource.push({ sourceId: sourceId || "unknown", ok: false, error: "数据源不存在" });
      continue;
    }

    if (!g.success) {
      await reportSourceStatus(sourceId, false, g.error ?? "外部抓取服务上报失败");
      failedSources += 1;
      perSource.push({ sourceId, ok: false, error: g.error ?? "抓取失败" });
      continue;
    }

    try {
      const internalArticles = g.articles.map((a) =>
        toIngestArticle(a as Parameters<typeof toIngestArticle>[0])
      );
      const r = await ingestArticles(sourceId, internalArticles, sourceMap.get(sourceId));
      const ingestedCount = r.inserted + r.updated;
      await reportSourceStatus(sourceId, true, null, ingestedCount);
      successSources += 1;
      totalInserted += r.inserted;
      totalUpdated += r.updated;
      totalDuplicated += r.duplicated;
      totalInvalid += r.invalid;
      totalFailed += r.failed;
      perSource.push({
        sourceId,
        ok: r.failed === 0,
        inserted: r.inserted,
        updated: r.updated,
        duplicated: r.duplicated,
        invalid: r.invalid,
        failed: r.failed,
        warnings: Array.from(g.warnings),
        ...(r.errors.length ? { error: r.errors[0] } : {}),
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
    sourceCount: rawResults.length,
    successCount: successSources,
    failureCount: failedSources,
    newDataCount: totalInserted + totalUpdated,
    errorMessage: failedSources > 0 ? `${failedSources} 个数据源失败` : null,
  });

  return NextResponse.json({
    success: true,
    schema_version: "article-v1",
    sources: rawResults.length,
    successSources,
    failedSources,
    inserted: totalInserted,
    updated: totalUpdated,
    duplicated: totalDuplicated,
    invalid: totalInvalid,
    failed: totalFailed,
    perSource,
  });
}
