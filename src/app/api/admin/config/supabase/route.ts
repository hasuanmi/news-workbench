import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { readManagedConfig, saveManagedConfig } from "@/lib/local-config";
import { probeSupabase, readInitSql, sqlEditorUrl } from "@/lib/supabase-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/config/supabase
 *   返回当前 Supabase 配置状态。密钥只回传掩码，绝不回传原文，也不写入任何日志。
 *   ?include=sql 时额外返回初始化脚本与 SQL Editor 地址（供「复制初始化 SQL」使用）。
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const view = readManagedConfig();
  const includeSql = new URL(request.url).searchParams.get("include") === "sql";

  if (!includeSql) return NextResponse.json(view);

  let initSql = "";
  try {
    initSql = readInitSql();
  } catch {
    initSql = "";
  }
  return NextResponse.json({
    ...view,
    initSql,
    sqlEditorUrl: sqlEditorUrl(view.url),
  });
}

/**
 * POST /api/admin/config/supabase
 *   { action: "test", url, serviceRoleKey } —— 测试连接并检测数据库结构，不写入任何配置
 *   { action: "save", url, serviceRoleKey } —— 校验后保存（经本地配置层落盘并同步进程环境变量）
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { action?: string; url?: string; serviceRoleKey?: string }
    | null;

  const action = body?.action;
  const url = String(body?.url ?? "").trim();
  const serviceRoleKey = String(body?.serviceRoleKey ?? "").trim();

  if (action !== "test" && action !== "save") {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ error: "请先填写 Project URL" }, { status: 400 });
  }
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "请先填写 Service Role Key" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Project URL 需要以 https:// 开头" }, { status: 400 });
  }

  const probe = await probeSupabase(url, serviceRoleKey);

  if (action === "test") {
    return NextResponse.json({ action: "test", ...probe });
  }

  // 保存前先校验：地址或密钥明显错误时拒绝落盘，避免把连不上的配置写进去
  if (probe.reason === "bad_key" || probe.reason === "bad_url") {
    return NextResponse.json({ error: `未保存：${probe.message}` }, { status: 400 });
  }

  try {
    const saved = saveManagedConfig({
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    });
    return NextResponse.json({
      action: "save",
      success: true,
      requiresRestart: saved.requiresRestart,
      probe,
      ...readManagedConfig(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存失败" },
      { status: 500 }
    );
  }
}
