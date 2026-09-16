/**
 * GET /api/ingest/health
 * 抓取接入健康检查（无需鉴权，供外部抓取服务探活/负载均衡探测）。
 *
 * 返回：
 * {
 *   "status": "ok" | "degraded",
 *   "version": "1.0",
 *   "schema_version": "article-v1",
 *   "checks": { "database": "ok" | "error", "ingest_enabled": boolean }
 * }
 */

import { NextResponse } from "next/server";
import { getIngestHealth } from "@/lib/ingest";
import { INGEST_API_VERSION, INGEST_SCHEMA_VERSION } from "@/lib/ingest-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await getIngestHealth();
    // database 不可用时返回 503，其余 200（ingest_enabled=false 仅提示，不视为故障）
    const httpStatus = health.status === "ok" ? 200 : 503;
    return NextResponse.json(health, {
      status: httpStatus,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        version: INGEST_API_VERSION,
        schema_version: INGEST_SCHEMA_VERSION,
        checks: { database: "error", ingest_enabled: false },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
