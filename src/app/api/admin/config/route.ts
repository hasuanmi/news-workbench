import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { GENERAL_CONFIG_KEYS, getAppConfig, invalidateConfigCache } from "@/lib/config";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    const { data, error } = await supabase()
      .from("app_config")
      .select("key, value, description")
      .in("key", [...GENERAL_CONFIG_KEYS])
      .order("key");
    if (error) return NextResponse.json({ error: "读取系统配置失败" }, { status: 500 });
    const cfg = await getAppConfig();
    const defaults: Record<(typeof GENERAL_CONFIG_KEYS)[number], string | number> = {
      "calendar.window_days": cfg.calendarWindowDays,
      "clue.auto_approve_threshold": cfg.clueAutoThreshold,
      "clue.review_threshold": cfg.clueReviewThreshold,
      "review.word_count_threshold": cfg.reviewWordThreshold,
      "review.auto_approve_threshold": cfg.reviewAutoThreshold,
      "review.review_threshold": cfg.reviewReviewThreshold,
      "cron.news_lead": cfg.leadCron,
      "cron.weekly_briefing": cfg.weeklyCron,
      "cron.dynamic_node_discover": cfg.dynamicDiscoverCron,
      "cron.daily_review": cfg.dailyReviewCron,
    };
    const stored = new Map((data ?? []).map(row => [row.key, row]));
    return NextResponse.json({ items: GENERAL_CONFIG_KEYS.map(configKey => stored.get(configKey) ?? {
      key: configKey,
      value: String(defaults[configKey]),
      description: "当前使用运行默认值；保存后写入该配置项。",
    }) });
  }

  const { data, error } = await supabase()
    .from("app_config")
    .select("key, value, description")
    .eq("key", key)
    .single();

  if (error) {
    return NextResponse.json({ error: "配置不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true, key: data.key, value: data.value, description: data.description });
}

/** PATCH — existing general-settings form sends { updates: [{ key, value }] }. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body: unknown = await request.json().catch(() => null);
  const updates = body && typeof body === "object" && "updates" in body ? body.updates : null;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "缺少配置更新项" }, { status: 400 });
  }
  const rows: { key: string; value: string }[] = [];
  for (const item of updates) {
    if (!item || typeof item !== "object" || typeof item.key !== "string" ||
        !GENERAL_CONFIG_KEYS.some(key => key === item.key) || typeof item.value !== "string") {
      return NextResponse.json({ error: "配置更新项无效" }, { status: 400 });
    }
    rows.push({ key: item.key, value: item.value });
  }
  if (new Set(rows.map(row => row.key)).size !== rows.length) {
    return NextResponse.json({ error: "配置项重复" }, { status: 400 });
  }
  const { error } = await supabase().from("app_config").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "保存系统配置失败" }, { status: 500 });
  invalidateConfigCache();
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { key, value, description } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: "缺少 key 或 value" }, { status: 400 });
  }

  const { error } = await supabase()
    .from("app_config")
    .upsert(
      { key, value: typeof value === "string" ? value : JSON.stringify(value), description: description || "" },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }

  invalidateConfigCache();
  return NextResponse.json({ success: true });
}
