import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { verifyIngestToken } from "@/lib/ingest";

/** Real worker outcome, separate from mock ingestion and administrator edits. */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? req.headers.get("x-ingest-token");
  if (!await verifyIngestToken(token)) return NextResponse.json({ error: "未授权" }, { status: 401 });
  const body = await req.json();
  if (typeof body.ok !== "boolean" || !body.source_id || !body.run_id) return NextResponse.json({ error: "缺少逐源结果" }, { status: 400 });
  if (body.ok && !(body.articles > 0 && body.ingest?.success === true && body.ingest?.perSource?.some(
    (s: { sourceId?: string; ok?: boolean }) => s.sourceId === body.source_id && s.ok === true))) {
    return NextResponse.json({ error: "成功结果必须包含该源的真实文章及入库回执" }, { status: 400 });
  }
  const db = supabase();
  const { data: source, error: readError } = await db.from("media_source").select("*").eq("id", body.source_id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: "source 不存在" }, { status: 404 });
  if (["media_id", "source_url", "source_type", "crawl_method"].some(key => source[key] !== body[key])) {
    return NextResponse.json({ error: "source 配置已变化，不能回写旧结果" }, { status: 409 });
  }
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    crawl_status: body.ok ? "ok" : "error", updated_at: now,
    ...(body.ok ? { verified_at: now, last_success_at: now, last_error: null } : { verified_at: null, last_error: String(body.error || body.error_code || "抓取失败").slice(0, 1000) }),
  };
  if (!body.ok && source.source_status === "active") Object.assign(update, {
    source_status: "needs_fix", enabled: false, status_reason: `真实 worker 失败 (${body.run_id})：${body.error_code || body.error || "未知错误"}`,
  });
  let query = db.from("media_source").update(update).eq("id", source.id);
  query = source.updated_at ? query.eq("updated_at", source.updated_at) : query.is("updated_at", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "状态已变化，结果未覆盖" }, { status: 409 });
  return NextResponse.json({ success: true });
}
