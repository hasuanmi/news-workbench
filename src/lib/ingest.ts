/**
 * 外部抓取服务接入层（ingest）
 *
 * 架构边界：
 * - 外部抓取服务（独立部署，不在沙箱内）只负责拉取原始文章，
 *   通过 POST /api/ingest/articles 把文章推回本系统。
 * - 主系统负责：任务编排（GET /api/ingest/queue）、文章入库去重、
 *   数据源状态记录、AI 线索识别/同题聚类/评报。
 * - 抓取失败只影响对应 media_source 的状态标记，绝不影响主系统其他功能。
 *
 * 鉴权：全局共享 token，配置项 `ingest.api_token`（app_config），
 * 后台「系统配置」可轮换。
 */

import "server-only";
import { createHash } from "node:crypto";
import { supabase } from "@/lib/db";
import { invalidateConfigCache } from "@/lib/config";
import type { NormalizedArticle } from "@/lib/ingest-contract";

export const DEFAULT_INGEST_TOKEN = process.env.INGEST_API_TOKEN || "";
const INGEST_TOKEN_CONFIG_KEY = "ingest.api_token";

/**
 * 主系统内部入库结构（camelCase）。业务逻辑（线索/评报）只依赖此结构，
 * 不依赖具体爬虫。由对外契约 IngestArticleDto（snake_case）归一化映射而来。
 */
export interface IngestArticle {
  isTest?: boolean;
  testRunId?: string | null;
  title: string;
  url: string;
  externalId?: string | null;
  publishedAt?: string | null; // 发布时间（已校验，非法时为 null）
  crawlTime?: string | null; // 实际抓取时间（区别于发布时间）
  content?: string | null;
  wordCount?: number | null;
  author?: string | null;
  // ===== 丰富元数据（可选，外部抓取服务可回传）=====
  columnName?: string | null; // 栏目名
  editionNo?: string | null; // 版面号
  editionName?: string | null; // 版名
  isFrontPage?: boolean | null; // 是否头版
  isFullPage?: boolean | null; // 是否整版
  isCrossPage?: boolean | null; // 是否跨版
  seriesName?: string | null; // 系列名
  specialName?: string | null; // 专题名
  specialUrl?: string | null; // 专题页链接
  images?: unknown | null; // 图片/图示元数据列表
  sourceType?: string | null; // website | epaper | other
  scrapeMethod?: string | null; // html | playwright | rss | manual
  firstSeenAt?: string | null; // 首次发现时间（ISO）
  business?: unknown | null; // 业务标记（每日评报/新闻线索）
}

export interface IngestResult {
  inserted: number;
  updated: number;
  duplicated: number;
  invalid: number;
  failed: number;
  errors: string[];
}

/** 保留数据库令牌优先；未配置时读取本地环境变量，再兼容旧默认值。 */
export async function getIngestToken(): Promise<string> {
  const { data } = await supabase()
    .schema("public")
    .from("app_config")
    .select("key, value")
    .eq("key", INGEST_TOKEN_CONFIG_KEY)
    .maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return process.env.INGEST_API_TOKEN?.trim() || DEFAULT_INGEST_TOKEN;
}

/** 恒定时间比较，避免 token 计时侧信道 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyIngestToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await getIngestToken();
  return timingSafeEqual(String(token), expected);
}

function sha256Hex(input: string): string {
  // Node 运行时（API Route），可用 node:crypto
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** 内容去重哈希：同一 URL 视为同一篇；无 URL 时用标题+正文 */
export function contentHashOf(art: { url?: string; title: string; content?: string | null }): string {
  const basis = art.url || `${art.title}|${(art.content ?? "").slice(0, 200)}`;
  return sha256Hex(basis);
}

/**
 * 判断新推送版本是否应触发「补全更新」：
 * 同一篇（external_id 或 url 命中）但正文更完整（明显更长）时更新原记录，而非简单丢弃。
 */
function shouldEnrichExisting(
  existing: { content: string | null; word_count: number | null; title: string },
  incoming: { content: string | null; wordCount: number | null; title: string }
): boolean {
  const oldLen = existing.word_count ?? (existing.content ?? "").replace(/\s+/g, "").length;
  const newLen = incoming.wordCount ?? (incoming.content ?? "").replace(/\s+/g, "").length;
  // 新版本正文字数比原记录多至少 100 字且增长 ≥25%，视为更完整的补全
  return newLen >= oldLen + 100 && newLen >= Math.floor(oldLen * 1.25);
}

/**
 * 文章批量入库（去重 + 补全更新）。
 *
 * 去重优先级：external_id（同一数据源内）→ content hash（URL / 标题+正文）。
 * - 命中完全相同内容：计 duplicated 跳过（幂等）。
 * - 命中同一篇但新版本正文更完整：更新原记录，计 updated（同一文章后续补全/更新场景）。
 * - 单篇失败只计 failed，不影响整批。
 */
export async function ingestArticles(
  sourceId: string,
  articles: IngestArticle[],
  mediaId?: string
): Promise<IngestResult> {
  const result: IngestResult = {
    inserted: 0,
    updated: 0,
    duplicated: 0,
    invalid: 0,
    failed: 0,
    errors: [],
  };
  const now = new Date().toISOString();

  // article 表需要 media_id + source_id 双字段，若未传入则查一次
  let resolvedMediaId = mediaId;
  if (!resolvedMediaId) {
    const { data: source } = await supabase()
      .schema("public")
      .from("media_source")
      .select("media_id")
      .eq("id", sourceId)
      .maybeSingle();
    resolvedMediaId = source?.media_id;
  }

  for (const art of articles) {
    if (!art || !art.title || !art.url) {
      result.invalid += 1;
      continue;
    }
    const hash = contentHashOf(art);
    const wordCount =
      art.wordCount ?? (art.content ? art.content.replace(/\s+/g, "").length : null);
    const crawlTime = art.crawlTime || now;
    // 发布时间非法/缺失时回退为抓取时间，保证评报日期筛选可用
    const publishTime = art.publishedAt || crawlTime;

    // 1) 优先按 (source_id, external_id) 查已有记录
    let existing: {
      id: string;
      content_hash: string | null;
      content: string | null;
      word_count: number | null;
      title: string;
    } | null = null;
    if (art.externalId) {
      const { data: byExternal } = await supabase()
        .schema("public")
        .from("article")
        .select("id, content_hash, content, word_count, title")
        .eq("source_id", sourceId)
        .eq("external_id", art.externalId)
        .maybeSingle();
      existing = byExternal ?? null;
    }

    // 2) external_id 未命中，再按 content_hash（URL / 标题+正文）查重
    if (!existing) {
      const { data: byHash } = await supabase()
        .schema("public")
        .from("article")
        .select("id, content_hash, content, word_count, title")
        .eq("content_hash", hash)
        .maybeSingle();
      existing = byHash ?? null;
    }

    if (existing) {
      const isMoreComplete = shouldEnrichExisting(existing, {
        content: art.content ?? null,
        wordCount,
        title: art.title,
      });
      // 同一篇但新版本正文更完整 → 补全更新（优先判断；external_id 命中时
      // URL 往往不变、基于 URL 的 content_hash 也不变，不能因此误判为重复）
      if (isMoreComplete) {
        const { error } = await supabase()
          .schema("public")
          .from("article")
          .update({
            title: art.title.slice(0, 500),
            content: art.content ?? existing.content,
            word_count: wordCount ?? existing.word_count,
            content_hash: hash,
            crawl_time: crawlTime,
            column_name: art.columnName ?? undefined,
            edition_no: art.editionNo ?? undefined,
            edition_name: art.editionName ?? undefined,
            is_front_page: art.isFrontPage ?? undefined,
            is_full_page: art.isFullPage ?? undefined,
            is_cross_page: art.isCrossPage ?? undefined,
            series_name: art.seriesName ?? undefined,
            special_name: art.specialName ?? undefined,
            special_url: art.specialUrl ?? undefined,
            source_type: art.sourceType ?? undefined,
            scrape_method: art.scrapeMethod ?? undefined,
          })
          .eq("id", existing.id);
        if (error) {
          result.failed += 1;
          result.errors.push(`《${art.title.slice(0, 30)}》更新失败: ${error.message ?? error.code}`);
        } else {
          result.updated += 1;
        }
        continue;
      }
      // 命中同一篇但无实质增量 → 视为重复
      result.duplicated += 1;
      continue;
    }

    const { error } = await supabase()
      .schema("public")
      .from("article")
      .insert({
        media_id: resolvedMediaId,
        source_id: sourceId,
        title: art.title.slice(0, 500),
        url: art.url,
        external_id: art.externalId ?? null,
        is_test: art.isTest === true || /(^|\/\/)([^/]+\.)?example\.test([/:]|$)|(^|\/\/)mock-ingest\.local([/:]|$)/i.test(art.url) || /^mock-|^clue-/.test(art.externalId ?? ""),
        test_run_id: (art.testRunId ?? (/example\.test|mock-ingest\.local/i.test(art.url) ? art.externalId ?? "mock-url" : null))?.slice(0, 64) ?? null,
        publish_time: publishTime,
        crawl_time: crawlTime,
        content_hash: hash,
        word_count: wordCount ?? 0,
        content: art.content ?? null,
        parse_status: "parsed",
        is_key_report: false,
        // ===== 丰富元数据（外部抓取服务回传）=====
        column_name: art.columnName ?? null,
        edition_no: art.editionNo ?? null,
        edition_name: art.editionName ?? null,
        is_front_page: art.isFrontPage ?? false,
        is_full_page: art.isFullPage ?? false,
        is_cross_page: art.isCrossPage ?? false,
        series_name: art.seriesName ?? null,
        special_name: art.specialName ?? null,
        special_url: art.specialUrl ?? null,
        images: (art.images as unknown) ?? null,
        source_type: art.sourceType ?? null,
        scrape_method: art.scrapeMethod ?? null,
        first_seen_at: art.firstSeenAt ?? null,
        business: (art.business as unknown) ?? null,
      });

    if (error) {
      if (error.code === "23505") {
        result.duplicated += 1; // 并发场景下的竞态重复
      } else {
        result.failed += 1;
        result.errors.push(`《${art.title.slice(0, 30)}》: ${error.message ?? error.code ?? "unknown"}`);
      }
    } else {
      result.inserted += 1;
    }
  }

  return result;
}

/** 将契约归一化文章映射为内部入库结构 */
export function toIngestArticle(a: NormalizedArticle): IngestArticle {
  const d = a.dto;
  return {
    isTest: d.is_test,
    testRunId: d.test_run_id,
    title: a.title,
    url: a.url,
    externalId: a.externalId,
    publishedAt: a.publishTime,
    crawlTime: a.crawlTime,
    content: d.content ?? null,
    wordCount: a.wordCount,
    author: d.author ?? null,
    columnName: d.column_name ?? null,
    editionNo: d.edition_no ?? null,
    editionName: d.edition_name ?? null,
    isFrontPage: d.is_front_page ?? false,
    isFullPage: d.is_full_page ?? false,
    isCrossPage: d.is_cross_page ?? false,
    seriesName: d.series_name ?? null,
    specialName: d.special_name ?? null,
    specialUrl: d.special_url ?? null,
    sourceType: d.source_type ?? null,
    scrapeMethod: d.scrape_method ?? null,
    firstSeenAt: d.first_seen_at ?? null,
  };
}

/** 数据源上报状态：成功时 ok + 清空错误；失败时累加 fail_count 并标记 warning/error */
export async function reportSourceStatus(
  sourceId: string,
  ok: boolean,
  errorMessage?: string | null,
  ingestedCount?: number
): Promise<void> {
  const { data: source } = await supabase()
    .schema("public")
    .from("media_source")
    .select("id, fail_count")
    .eq("id", sourceId)
    .maybeSingle();
  if (!source) return;

  const now = new Date().toISOString();
  if (ok) {
    await supabase()
      .schema("public")
      .from("media_source")
      .update({
        crawl_status: "ok",
        fail_count: 0,
        last_success_at: now,
        last_ingest_at: now,
        last_error: null,
        ...(typeof ingestedCount === "number" ? { last_ingest_count: ingestedCount } : {}),
      })
      .eq("id", sourceId);
  } else {
    const failCount = (source.fail_count ?? 0) + 1;
    await supabase()
      .schema("public")
      .from("media_source")
      .update({
        crawl_status: failCount >= 3 ? "error" : "warning",
        fail_count: failCount,
        last_error: (errorMessage ?? "抓取失败").slice(0, 1000),
      })
      .eq("id", sourceId);
  }
}

/** GET /api/ingest/health：基础状态 + 数据库可用性 + ingest 开关检查 */
export async function getIngestHealth(): Promise<{
  status: "ok" | "degraded";
  version: string;
  schema_version: string;
  checks: { database: "ok" | "error"; ingest_enabled: boolean };
}> {
  const { INGEST_SCHEMA_VERSION, INGEST_API_VERSION } = await import("@/lib/ingest-contract");
  let databaseOk = false;
  try {
    const { error } = await supabase().schema("public").from("media_source").select("id").limit(1);
    databaseOk = !error;
  } catch {
    databaseOk = false;
  }
  // ingest 开关：存在可用 token 且至少有一个启用中的数据源
  let ingestEnabled = false;
  if (databaseOk) {
    try {
      const { data } = await supabase()
        .schema("public")
        .from("media_source")
        .select("id")
        .eq("enabled", true)
        .limit(1);
      ingestEnabled = Array.isArray(data) && data.length > 0;
    } catch {
      ingestEnabled = false;
    }
  }
  return {
    status: databaseOk ? "ok" : "degraded",
    version: INGEST_API_VERSION,
    schema_version: INGEST_SCHEMA_VERSION,
    checks: { database: databaseOk ? "ok" : "error", ingest_enabled: ingestEnabled },
  };
}

/** 写任务日志（workflow: ingest）；抓取类任务失败也只记日志，不抛错影响主系统 */
export async function writeIngestTaskLog(params: {
  status: "success" | "failed";
  sourceCount?: number;
  successCount?: number;
  failureCount?: number;
  newDataCount?: number;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supabase()
      .schema("public")
      .from("task_log")
      .insert({
        workflow_name: "ingest",
        start_time: now,
        end_time: now,
        status: params.status,
        source_count: params.sourceCount ?? 0,
        success_count: params.successCount ?? 0,
        failure_count: params.failureCount ?? 0,
        new_data_count: params.newDataCount ?? 0,
        error_message: params.errorMessage ?? null,
      });
  } catch {
    // 日志写入失败不应影响业务
  }
}

/** 初始化 ingest token 配置项（幂等） */
export async function ensureIngestConfig(): Promise<void> {
  const { data } = await supabase()
    .schema("public")
    .from("app_config")
    .select("key")
    .eq("key", INGEST_TOKEN_CONFIG_KEY)
    .maybeSingle();
  if (!data) {
    await supabase()
      .schema("public")
      .from("app_config")
      .insert({
        key: INGEST_TOKEN_CONFIG_KEY,
        value: DEFAULT_INGEST_TOKEN,
        description: "外部抓取服务接入令牌（ingest API 鉴权，可轮换）",
      });
    invalidateConfigCache();
  }
}
