import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET /api/leads — 前台线索列表
 *
 * 新鲜度与待确认机制（clue.identify_rules）：
 * - pending（今日待确认）默认只返回「近 N 天内有新原文 / 近期更新」的线索，
 *   历史系列即使库里有旧文章也不再进入今日待确认（N=pending_freshness_days，默认 3 天）。
 * - confirmed（已确认/历史线索库）默认不过滤；可用 scope=history 显式只看历史库。
 * - scope=all 时返回全部（后台/历史回溯用）。
 *
 * 每条线索返回 articles[]（可核验依据：标题 + 完整发布时间 + 媒体名 + 原文链接）。
 *
 * 支持筛选：date / mediaId / type / tag / scope / page / pageSize
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const mediaId = searchParams.get("mediaId");
  const type = searchParams.get("type");
  const tag = searchParams.get("tag");
  // scope: active(默认，窗口内待确认+已确认) | pending(仅今日待确认) | history(历史库) | all(全部)
  const scope = searchParams.get("scope") || "active";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const db = supabase();

  // 读取识别规则（默认时间窗口 / 待确认新鲜度门槛 / 是否必须有原文依据）
  let identifyRules = {
    default_time_range: "24h",
    pending_freshness_days: 3,
    require_article_evidence: true,
  };
  const { data: ruleData } = await db
    .from("app_config")
    .select("value")
    .eq("key", "clue.identify_rules")
    .maybeSingle();
  if (ruleData?.value) {
    try {
      const parsed =
        typeof ruleData.value === "string" ? JSON.parse(ruleData.value) : ruleData.value;
      identifyRules = { ...identifyRules, ...parsed };
    } catch {
      /* 用默认 */
    }
  }

  let query = db
    .from("news_clue")
    .select("*", { count: "exact" })
    .eq("is_test", false)
    .order("first_found_at", { ascending: false });

  // 状态范围
  if (scope === "pending") {
    query = query.eq("review_status", "pending");
  } else if (scope === "history") {
    // 历史线索库：已确认 + 已忽略
    query = query.in("review_status", ["confirmed", "ignored"]);
  } else if (scope === "all") {
    query = query.in("review_status", ["confirmed", "pending", "ignored"]);
  } else {
    // active 默认：待确认 + 已确认
    query = query.in("review_status", ["confirmed", "pending"]);
  }

  if (date) {
    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;
    query = query.gte("first_found_at", start).lte("first_found_at", end);
  }
  if (mediaId) query = query.eq("media_id", mediaId);
  if (type) query = query.eq("clue_type", type);
  if (tag) query = query.contains("tags", JSON.stringify([tag]));

  // 待确认新鲜度过滤依赖关联表（DB 层无法直接表达），故 active/pending 视图
  // 先取较大候选集（最多 500 条，按 first_found_at 倒序），内存过滤后再分页；
  // history/all 视图走正常分页。
  const needMemoryFilter = scope === "active" || scope === "pending";
  if (needMemoryFilter) {
    query = query.limit(500);
  } else {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  // 批量查媒体名称（线索主媒体）
  const mediaIds = [...new Set(rows.map((c) => c.media_id))];
  let mediaMap = new Map<string, string>();
  if (mediaIds.length > 0) {
    const { data: mediaRows } = await db
      .from("media")
      .select("id, media_name")
      .in("id", mediaIds);
    mediaMap = new Map((mediaRows ?? []).map((m) => [m.id, m.media_name]));
  }

  // 读取展示规则
  const { data: configData } = await db
    .from("app_config")
    .select("value")
    .eq("key", "clue.display_rules")
    .maybeSingle();

  let displayRules = null;
  if (configData?.value) {
    displayRules =
      typeof configData.value === "string" ? JSON.parse(configData.value) : configData.value;
  }

  const clues = rows.map((c) => ({
    ...c,
    clue_name: c.series_name || c.clue_name || "",
    media_name: mediaMap.get(c.media_id) ?? "未知媒体",
    tags: typeof c.tags === "string" ? safeJsonParse(c.tags, []) : c.tags,
    display_rules: displayRules,
  }));

  // 批量查询每条线索的关联原文（外键嵌套关联不可用 → 主查询 + 二次查询 + Map 组装）
  const clueIds = [...new Set(rows.map((c) => c.id))];
  let articleMap = new Map<string, any[]>();
  // 收集关联文章里出现的全部媒体 id（关联文章可能跨媒体）
  const articleMediaIdSet = new Set<string>();
  let evidenceWarning: string | null = null;
  if (clueIds.length > 0) {
    const { data: links, error: linksError } = await db
      .from("news_clue_article")
      .select("clue_id, article_id, title, url, publish_time, media_id")
      .in("clue_id", clueIds)
      .order("publish_time", { ascending: false, nullsFirst: false });
    if (linksError) evidenceWarning = "关联原文暂时无法加载，请检查线索关联表结构与数据连接。";

    const grouped = (links ?? []).reduce<Map<string, any[]>>((acc, l) => {
      const arr = acc.get(l.clue_id) ?? [];
      arr.push({
        id: l.article_id,
        title: l.title,
        url: l.url,
        published_at: l.publish_time,
        media_id: l.media_id,
      });
      if (l.media_id) articleMediaIdSet.add(l.media_id);
      acc.set(l.clue_id, arr);
      return acc;
    }, new Map());
    articleMap = grouped;
  }

  // 关联文章的媒体名（主媒体表 + 关联明细可能引用其它媒体）
  let articleMediaMap = new Map<string, string>();
  if (articleMediaIdSet.size > 0) {
    const { data: aMediaRows } = await db
      .from("media")
      .select("id, media_name")
      .in("id", [...articleMediaIdSet]);
    articleMediaMap = new Map((aMediaRows ?? []).map((m) => [m.id, m.media_name]));
  }

  // 新鲜度：距最新一篇原文发布时间的天数
  const nowTs = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const pendingWindowMs =
    Math.max(0, Number(identifyRules.pending_freshness_days) || 3) * DAY;

  const enriched = clues.map((c) => {
    const articles = (articleMap.get(c.id) ?? []).map((a) => ({
      ...a,
      media_name: articleMediaMap.get(a.media_id) ?? c.media_name ?? "未知媒体",
    }));
    (c as any).articles = articles;
    (c as any).total_articles = articles.length;
    const recent =
      c.recent_article_at ||
      (articles[0]?.published_at as string | undefined) ||
      c.last_seen_at;
    (c as any).recent_article_at = recent || null;
    (c as any).freshness_days =
      recent && !Number.isNaN(new Date(recent).getTime())
        ? Math.max(0, Math.floor((nowTs - new Date(recent).getTime()) / DAY))
        : null;
    return c;
  });

  // 待确认新鲜度限制：仅对 pending 生效（active/pending 视图）。
  // 已确认线索（历史库）不因旧文章被过滤。
  let filtered = enriched;
  if (needMemoryFilter) {
    filtered = enriched.filter((c) => {
      if (c.review_status !== "pending") return true;
      // 必须有可核验原文依据
      if (identifyRules.require_article_evidence && (c as any).articles.length === 0) {
        return false;
      }
      // 必须在新鲜度窗口内有更新
      const recentTs = (c as any).recent_article_at
        ? new Date((c as any).recent_article_at).getTime()
        : NaN;
      if (Number.isNaN(recentTs)) return false;
      return nowTs - recentTs <= pendingWindowMs;
    });
  }

  const totalFiltered = filtered.length;
  const paged = needMemoryFilter
    ? filtered.slice((page - 1) * pageSize, page * pageSize)
    : filtered;

  return NextResponse.json({
    success: true,
    // count 为数据库计数；filtered_total 为应用新鲜度窗口后的条数（active/pending 视图以此为准）
    total: needMemoryFilter ? totalFiltered : count ?? filtered.length,
    filtered_total: totalFiltered,
    page,
    pageSize,
    identify_rules: identifyRules,
    evidence_warning: evidenceWarning,
    clues: paged,
  });
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
