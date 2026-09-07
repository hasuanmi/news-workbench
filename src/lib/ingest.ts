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
import { supabase } from "@/lib/db";
import { invalidateConfigCache } from "@/lib/config";

export const DEFAULT_INGEST_TOKEN = "newsdesk-ingest-2026";
const INGEST_TOKEN_CONFIG_KEY = "ingest.api_token";

export interface IngestArticle {
  title: string;
  url: string;
  publishedAt?: string | null;
  content?: string | null;
  wordCount?: number | null;
}

export interface IngestResult {
  inserted: number;
  duplicated: number;
  invalid: number;
  failed: number;
  errors: string[];
}

/** 读取外部抓取服务鉴权 token（配置驱动，找不到时用默认值） */
export async function getIngestToken(): Promise<string> {
  const { data } = await supabase()
    .schema("public")
    .from("app_config")
    .select("key, value")
    .eq("key", INGEST_TOKEN_CONFIG_KEY)
    .maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return DEFAULT_INGEST_TOKEN;
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
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** 内容去重哈希：同一 URL 视为同一篇；无 URL 时用标题+正文 */
export function contentHashOf(art: IngestArticle): string {
  const basis = art.url || `${art.title}|${(art.content ?? "").slice(0, 200)}`;
  return sha256Hex(basis);
}

/**
 * 文章批量入库（去重）。
 * 重复内容（content_hash 冲突）跳过，不算错误。
 */
export async function ingestArticles(
  sourceId: string,
  articles: IngestArticle[],
  mediaId?: string
): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, duplicated: 0, invalid: 0, failed: 0, errors: [] };
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

    // 先按 content_hash 查重（ignoreDuplicates upsert 不返回冲突信息，无法准确计数）
    const { data: existed } = await supabase()
      .schema("public")
      .from("article")
      .select("id")
      .eq("content_hash", hash)
      .maybeSingle();
    if (existed) {
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
        publish_time: art.publishedAt || now,
        crawl_time: now,
        content_hash: hash,
        word_count: wordCount,
        content: art.content ?? null,
        parse_status: "parsed",
        is_key_report: false,
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

export interface IngestResultWithErrors extends IngestResult {
  errors: string[];
}

/** 数据源上报状态：成功时 ok + 清空错误；失败时累加 fail_count 并标记 warning/error */
export async function reportSourceStatus(
  sourceId: string,
  ok: boolean,
  errorMessage?: string | null
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
