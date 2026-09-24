/**
 * GET /api/ingest/queue
 * 外部抓取服务拉取待抓取数据源队列（拉模式编排）。
 *
 * 鉴权：Header `Authorization: Bearer <ingest_token>` 或 `X-Ingest-Token`。
 * 返回：启用中的数据源列表（含 media_id、source_type、source_url、crawl_method），
 * 外部服务按此列表自行调度抓取，抓完调用 POST /api/ingest/articles 回推。
 */

import { sourceCanRun } from "@/lib/source-policy";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { verifyIngestToken } from "@/lib/ingest";
import { INGEST_API_VERSION, INGEST_SCHEMA_VERSION } from "@/lib/ingest-contract";

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
      .select("id, media_id, source_type, source_url, crawl_method, last_ingest_at, source_status, enabled")
      .eq("enabled", true)
      .eq("source_status", "active")
      .order("last_ingest_at", { ascending: true, nullsFirst: true });

    if (error) {
      return NextResponse.json({ error: "读取数据源队列失败" }, { status: 500 });
    }

    const eligible = (sources ?? []).filter(sourceCanRun);

    // Supabase 外键嵌套关联查询不可用 → 主查询 + 按 id 批量二次查询 + Map 组装
    const mediaIds = Array.from(new Set(eligible.map((s) => s.media_id)));
    const { data: medias } = await supabase()
      .schema("public")
      .from("media")
      .select("id, media_name")
      .in("id", mediaIds.length ? mediaIds : ["00000000-0000-0000-0000-000000000000"]);
    const mediaNameMap = new Map((medias ?? []).map((m) => [m.id, m.media_name]));

    return NextResponse.json({
      success: true,
      version: INGEST_API_VERSION,
      schema_version: INGEST_SCHEMA_VERSION,
      count: eligible.length,
      // 外部服务只拿基础抓取信息，不返回媒体监控开关等内部字段。
      // 同时给出 snake_case（契约）与 camelCase（向后兼容）。
      sources: eligible.map((s) => {
        const mediaName = mediaNameMap.get(s.media_id) ?? "";
        return {
          source_status: s.source_status,
          enabled: s.enabled,
          source_id: s.id,
          sourceId: s.id,
          media_id: s.media_id,
          mediaId: s.media_id,
          media_name: mediaName,
          mediaName,
          source_type: s.source_type,
          sourceType: s.source_type,
          source_url: s.source_url,
          sourceUrl: s.source_url,
          crawl_method: s.crawl_method,
          crawlMethod: s.crawl_method,
          last_ingest_at: s.last_ingest_at,
          lastIngestAt: s.last_ingest_at,
        };
      }),
    });
  } catch {
    return NextResponse.json({ error: "队列服务异常" }, { status: 500 });
  }
}
