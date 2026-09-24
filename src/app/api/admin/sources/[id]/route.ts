import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { isSourceStatus, normalizeSourceUrl, sourceCanRun } from "@/lib/source-policy";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = await req.json();
  const db = supabase();
  const { data: current, error: readError } = await db.from("media_source").select("*").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "数据源不存在" }, { status: 404 });
  const status = body.source_status ?? (body.enabled === false ? "manual_disabled" : body.enabled === true ? "active" : current.source_status);
  if (!isSourceStatus(status)) return NextResponse.json({ error: "无效的数据源状态" }, { status: 400 });
  const url = "source_url" in body ? String(body.source_url ?? "").trim() : current.source_url;
  const changedUrl = normalizeSourceUrl(url ?? "") !== normalizeSourceUrl(current.source_url ?? "");
  if (status === "duplicate" && !current.duplicate_of) return NextResponse.json({ error: "重复停用需要明确的保留 source_id，请先核对重复关系" }, { status: 400 });
  if (status === "active") {
    if (current.duplicate_of || !current.verified_at || changedUrl || current.crawl_status !== "ok" ||
      !sourceCanRun({ ...current, source_status: status, enabled: true })) {
      return NextResponse.json({ error: "需先完成真实 worker 抓取验证，且不能是重复源；保存配置或模拟推送不算验证成功" }, { status: 409 });
    }
    const { data: peers, error } = await db.from("media_source").select("id,source_url").eq("media_id", current.media_id)
      .eq("source_type", current.source_type).eq("source_status", "active").neq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (peers?.some(s => normalizeSourceUrl(s.source_url ?? "") === normalizeSourceUrl(url ?? ""))) {
      return NextResponse.json({ error: "同媒体、同类型、同 URL 已有启用源" }, { status: 409 });
    }
  }
  const nextStatus = changedUrl && status !== "duplicate" && status !== "manual_disabled" ? "needs_fix" : status;
  let update = db.from("media_source").update({
    source_url: url || null, source_status: nextStatus, enabled: nextStatus === "active",
    status_reason: changedUrl ? "入口已修改，等待真实 worker 重新验证" : `人工调整为 ${nextStatus}`,
    ...(changedUrl ? { verified_at: null, crawl_status: "untested" } : {}), updated_at: new Date().toISOString(),
  }).eq("id", id);
  update = current.updated_at ? update.eq("updated_at", current.updated_at) : update.is("updated_at", null);
  const { data, error } = await update.select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "数据源已变化，请刷新后重试" }, { status: 409 });
  return NextResponse.json({ item: data });
}
