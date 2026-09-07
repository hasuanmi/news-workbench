/**
 * GET /api/ingest/queue
 * 外部抓取服务拉取待抓取数据源队列（拉模式编排）。
 *
 * 鉴权：Header `Authorization: Bearer <ingest_token>` 或 `X-Ingest-Token`。
 * 返回：启用中的数据源列表（含 media_id、source_type、source_url、crawl_method），
 * 外部服务按此列表自行调度抓取，抓完调用 POST /api/ingest/articles 回推。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { verifyIngestToken } from "@/lib/ingest";

export const dynamic = "force-dynamic";

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-ingest-token");
}

export async function GET(request: NextRequest) {
  if (!(await verifyIngestToken(getToken(request)))) {
    return NextResponse.json({ error: "未授权：ingest token 无效" }, { status: 401 });
  }

  try {
    const { data: sources, error } = await supabase()
      .schema("public")
      .from("media_source")
      .select("id, media_id, source_type, source_url, crawl_method, last_ingest_at")
      .eq("enabled", true)
      .order("last_ingest_at", { ascending: true, nullsFirst: true });

    if (error) {
      return NextResponse.json({ error: "读取数据源队列失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: (sources ?? []).length,
      // 外部服务只拿基础抓取信息，不返回媒体监控开关等内部字段
      sources: (sources ?? []).map((s) => ({
        sourceId: s.id,
        mediaId: s.media_id,
        sourceType: s.source_type,
        sourceUrl: s.source_url,
        crawlMethod: s.crawl_method,
        lastIngestAt: s.last_ingest_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "队列服务异常" }, { status: 500 });
  }
}
