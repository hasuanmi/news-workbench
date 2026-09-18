/**
 * 抓取服务接入契约（统一文章数据结构 / schema_version = article-v1）
 *
 * 架构边界（核心）：
 * - 主系统的新闻线索 / 每日评报 / 文章入库等业务逻辑，**只依赖本文件定义的统一结构**，
 *   不依赖任何具体媒体网站的 HTML 结构、也不依赖具体爬虫实现。
 * - 未来独立部署的「外部抓取服务」只负责抓原始文章，按本契约通过
 *   POST /api/ingest/articles 回推即可直接使用，无需改动主系统。
 *
 * 命名约定：对外契约使用 snake_case（与未来独立服务对齐）；
 * 主系统内部入库结构 IngestArticle 使用 camelCase（见 ingest.ts），由 normalizeIngestPayload 映射。
 */

export const INGEST_SCHEMA_VERSION = "article-v1";
export const INGEST_API_VERSION = "1.0";

/** 单批 /api/ingest/articles 最大数据源结果数 */
export const INGEST_MAX_SOURCES_PER_BATCH = 50;
/** 单个数据源单批最大文章数 */
export const INGEST_MAX_ARTICLES_PER_SOURCE = 200;
/** 整批文章总数上限（防止超大 payload） */
export const INGEST_MAX_ARTICLES_TOTAL = 1000;

/**
 * 对外文章结构（snake_case）。仅 source_id 为必填的数据源身份；
 * media_name 仅用于展示与日志，不参与业务关联（业务一律以 source_id 关联 media_source）。
 */
export interface IngestArticleDto {
  is_test?: boolean;
  test_run_id?: string | null;
  /** 必填：数据源 ID（来自 GET /api/ingest/queue） */
  source_id: string;
  /** 选填：媒体名称，仅展示/日志用，不参与业务关联 */
  media_name?: string | null;
  /** 必填：文章标题 */
  title: string;
  /** 必填：原文链接（http/https）。external_id 缺失时作为去重依据 */
  url: string;
  /** 选填：外部抓取服务侧文章唯一标识；优先用于去重/更新，缺失时退回 URL/content hash */
  external_id?: string | null;
  /** 选填：发布时间，ISO8601（含时区，如 2026-09-16T08:30:00+08:00） */
  publish_time?: string | null;
  /** 选填：实际抓取时间，ISO8601；缺省由服务端记当前时间 */
  crawl_time?: string | null;
  /** 选填：正文 */
  content?: string | null;
  /** 选填：作者 */
  author?: string | null;
  /** 选填：版面/栏目 */
  section?: string | null;
  /** 选填：字数，缺省由正文计算 */
  word_count?: number | null;
  /** 选填：website | epaper | other */
  source_type?: string | null;
  /** 选填：栏目名（新闻线索识别参考） */
  column_name?: string | null;
  /** 选填：版面号 */
  edition_no?: string | null;
  /** 选填：版名 */
  edition_name?: string | null;
  /** 选填：系列名 */
  series_name?: string | null;
  /** 选填：专题名 */
  special_name?: string | null;
  /** 选填：专题页链接 */
  special_url?: string | null;
  /** 选填：头版 */
  is_front_page?: boolean | null;
  /** 选填：整版 */
  is_full_page?: boolean | null;
  /** 选填：跨版 */
  is_cross_page?: boolean | null;
  /** 选填：抓取方式 html | playwright | rss | manual */
  scrape_method?: string | null;
  /** 选填：首次发现时间 ISO8601 */
  first_seen_at?: string | null;
}

/** 单个数据源的回推结果（新契约，扁平结构，与文档一致） */
export interface IngestSourceResultDto {
  source_id: string;
  /** 本次抓取是否成功（失败时填 error，articles 可省略） */
  success?: boolean;
  error?: string | null;
  articles?: IngestArticleDto[];
}

/** POST /api/ingest/articles 请求体（新契约） */
export interface IngestRequestDto {
  schema_version?: string;
  results: IngestSourceResultDto[];
}

// ============================================================================
// 校验与归一化
// ============================================================================

export type IngestRejectCode =
  | "missing_source_id"
  | "missing_title"
  | "missing_url"
  | "invalid_url"
  | "invalid_word_count";

export interface NormalizeWarning {
  code: "invalid_publish_time" | "invalid_crawl_time";
  message: string;
}

export interface NormalizedArticle {
  dto: IngestArticleDto;
  sourceId: string;
  title: string;
  url: string;
  externalId: string | null;
  publishTime: string | null; // 已校验，非法时为 null（容错，不失败）
  crawlTime: string | null;
  wordCount: number | null;
  warnings: NormalizeWarning[];
}

/** 是否合法 http(s) URL */
export function isValidHttpUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (s.length === 0 || s.length > 2000) return false;
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** ISO8601 时间校验；非法返回 null（容错，不直接判失败） */
export function parseIsoTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length === 0) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function asTrimmedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s.slice(0, max) : null;
}

/**
 * 校验并归一化一篇文章。
 * - 硬错误（缺 source_id/title、url 缺失或非法）通过 code 返回，由调用方计 invalid；
 * - 软错误（时间字段异常）仅产生 warning，正文容错处理，不影响整批。
 */
export function normalizeArticle(input: unknown): {
  ok: boolean;
  code?: IngestRejectCode;
  article?: NormalizedArticle;
} {
  if (typeof input !== "object" || input === null) {
    return { ok: false, code: "missing_title" };
  }
  const o = input as Record<string, unknown>;

  const sourceId = asTrimmedString(o.source_id ?? o.sourceId, 36);
  if (!sourceId) return { ok: false, code: "missing_source_id" };

  const title = asTrimmedString(o.title, 500);
  if (!title) return { ok: false, code: "missing_title" };

  const rawUrl = o.url;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { ok: false, code: "missing_url" };
  }
  if (!isValidHttpUrl(rawUrl)) return { ok: false, code: "invalid_url" };
  const url = rawUrl.trim();

  const externalId = asTrimmedString(o.external_id ?? o.externalId, 128);

  const warnings: NormalizeWarning[] = [];
  const publishTime = parseIsoTime(o.publish_time ?? o.publishedAt);
  if ((o.publish_time ?? o.publishedAt) != null && publishTime === null) {
    warnings.push({
      code: "invalid_publish_time",
      message: "publish_time 非合法时间，已回退为按抓取时间处理",
    });
  }
  const crawlTime = parseIsoTime(o.crawl_time ?? o.firstSeenAt ?? o.first_seen_at);
  if ((o.crawl_time ?? o.firstSeenAt ?? o.first_seen_at) != null && crawlTime === null) {
    warnings.push({
      code: "invalid_crawl_time",
      message: "crawl_time 非合法时间，已回退为服务端当前时间",
    });
  }

  let wordCount: number | null = null;
  if (typeof o.word_count === "number" && Number.isFinite(o.word_count) && o.word_count >= 0) {
    wordCount = Math.floor(o.word_count);
  } else if (typeof o.wordCount === "number" && Number.isFinite(o.wordCount) && o.wordCount >= 0) {
    wordCount = Math.floor(o.wordCount);
  }

  // 组装回 DTO（兼容 camelCase 旧字段名映射）
  const dto: IngestArticleDto = {
    is_test: o.is_test === true,
    test_run_id: asTrimmedString(o.test_run_id, 64),
    source_id: sourceId,
    media_name: asTrimmedString(o.media_name ?? o.mediaName, 128),
    title,
    url,
    external_id: externalId,
    publish_time: publishTime,
    crawl_time: crawlTime,
    content: typeof o.content === "string" ? o.content : null,
    author: asTrimmedString(o.author, 128),
    section: asTrimmedString(o.section, 64),
    word_count: wordCount,
    source_type: asTrimmedString(o.source_type ?? o.sourceType, 16),
    column_name: asTrimmedString(o.column_name ?? o.columnName, 255),
    edition_no: asTrimmedString(o.edition_no ?? o.editionNo, 32),
    edition_name: asTrimmedString(o.edition_name ?? o.editionName, 64),
    series_name: asTrimmedString(o.series_name ?? o.seriesName, 255),
    special_name: asTrimmedString(o.special_name ?? o.specialName, 255),
    special_url: isValidHttpUrl(o.special_url ?? o.specialUrl)
      ? String(o.special_url ?? o.specialUrl).trim()
      : null,
    is_front_page: Boolean(o.is_front_page ?? o.isFrontPage),
    is_full_page: Boolean(o.is_full_page ?? o.isFullPage),
    is_cross_page: Boolean(o.is_cross_page ?? o.isCrossPage),
    scrape_method: asTrimmedString(o.scrape_method ?? o.scrapeMethod, 16),
    first_seen_at: parseIsoTime(o.first_seen_at ?? o.firstSeenAt),
  };

  return {
    ok: true,
    article: {
      dto,
      sourceId,
      title,
      url,
      externalId,
      publishTime,
      crawlTime,
      wordCount,
      warnings,
    },
  };
}
