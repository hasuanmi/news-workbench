import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// 系统表，禁止删除
export const healthCheck = pgTable("health_check", {
  id: integer().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// ============ 用户与权限 ============
export const appUser = pgTable(
  "app_user",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    username: varchar("username", { length: 64 }).notNull().unique(),
    display_name: varchar("display_name", { length: 128 }).notNull().default(""),
    password_hash: varchar("password_hash", { length: 255 }).notNull(),
    role: varchar("role", { length: 16 }).notNull().default("editor"), // admin | editor
    enabled: boolean("enabled").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("app_user_role_idx").on(table.role)]
);

// ============ 全局配置 ============
export const appConfig = pgTable("app_config", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value"),
  description: varchar("description", { length: 255 }),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ 新闻日历 ============
export const calendarCategory = pgTable(
  "calendar_category",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 16 }).notNull().unique(),
    category_name: varchar("category_name", { length: 64 }).notNull(),
    description: text("description"),
    sort_order: integer("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("calendar_category_sort_idx").on(table.sort_order)]
);

export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    event_name: varchar("event_name", { length: 255 }).notNull(),
    event_type: varchar("event_type", { length: 16 }).notNull().default("dynamic"), // fixed | dynamic
    original_date: date("original_date", { mode: "string" }), // 原始事件日期（固定节点的基准日期）
    event_date: date("event_date", { mode: "string" }), // 当期日期（动态节点 / 当年发生日）
    anniversary_base_year: integer("anniversary_base_year"), // 周年基准年（历史，已弃用，未周年型为空）
    event_year: integer("event_year"), // 事件原始发生年份（周年型节点），target_year - event_year = 周年
    category_id: varchar("category_id", { length: 36 }).references(() => calendarCategory.id),
    region: varchar("region", { length: 16 }).notNull().default("national"), // national | guangdong | guangzhou | other
    importance: varchar("importance", { length: 4 }).default("B"), // S | A | B
    description: text("description"),
    source_name: varchar("source_name", { length: 128 }),
    source_url: text("source_url"),
    source_authority: varchar("source_authority", { length: 16 }), // official | media | ai | manual
    review_status: varchar("review_status", { length: 16 }).notNull().default("pending"), // pending | approved | rejected
    enabled: boolean("enabled").notNull().default(false),
    needs_review: boolean("needs_review").notNull().default(false), // 导入时低置信标记
    tags: jsonb("tags"),
    // ===== 新闻日历重构：时间待定表达 + 候选溯源 =====
    // confirmed=日期确定 | month_known=只知月份 | unknown=时间待定
    date_status: varchar("date_status", { length: 16 }).notNull().default("confirmed"),
    event_month: integer("event_month"), // month_known 时的月份（1-12）
    source_candidate_id: varchar("source_candidate_id", { length: 36 }), // 溯源到哪个候选节点
    // ===== 来源标签 + 软删除（弱化审核、直接维护） =====
    // source: ai_recommend | history_migrate | user_add | user_paste
    source: varchar("source", { length: 24 }).notNull().default("user_add"),
    deleted_at: timestamp("deleted_at", { withTimezone: true }), // 软删除时间，非空=已删除（保留原节点供 AI 参考）
    delete_reason: varchar("delete_reason", { length: 32 }), // 删除原因：not_important/one_off/weak/weak_local/inaccurate/duplicate/expired/other
    deleted_by: varchar("deleted_by", { length: 36 }),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    confirmed_by: varchar("confirmed_by", { length: 36 }),
    created_by: varchar("created_by", { length: 36 }),
    // ===== 自动补全（M：新增/编辑时联网检索 + LLM 生成，详情直接展示）=====
    ai_background: text("ai_background"), // 背景信息
    ai_why: text("ai_why"), // 为什么值得关注
    ai_topics: jsonb("ai_topics"), // 可参考的选题方向 string[]
    ai_sources: jsonb("ai_sources"), // 参考来源 [{title,url,snippet,authority,publish_time}]
    enrich_status: varchar("enrich_status", { length: 16 }).notNull().default("none"), // none|pending|done|no_source|failed
    enrich_fingerprint: varchar("enrich_fingerprint", { length: 64 }), // 名称/日期/地区/分类指纹，用于信息变化检测，避免重复调用
    enrich_error: text("enrich_error"),
    enrich_fail_count: integer("enrich_fail_count").notNull().default(0),
    enriched_at: timestamp("enriched_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("calendar_event_date_idx").on(table.event_date),
    index("calendar_event_category_idx").on(table.category_id),
    index("calendar_event_review_idx").on(table.review_status),
    index("calendar_event_type_idx").on(table.event_type),
    index("calendar_event_region_idx").on(table.region),
    index("calendar_event_enabled_idx").on(table.enabled),
    index("calendar_event_date_status_idx").on(table.date_status),
    index("calendar_event_source_idx").on(table.source),
    index("calendar_event_deleted_idx").on(table.deleted_at),
  ]
);

// ============ 媒体与数据源 ============
export const media = pgTable(
  "media",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    media_name: varchar("media_name", { length: 128 }).notNull().unique(),
    media_level: varchar("media_level", { length: 16 }).notNull().default("city"), // central | provincial | city
    region: varchar("region", { length: 64 }).notNull().default(""),
    monitor_clue: boolean("monitor_clue").notNull().default(false),
    monitor_review: boolean("monitor_review").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("media_level_idx").on(table.media_level),
    index("media_monitor_clue_idx").on(table.monitor_clue),
    index("media_monitor_review_idx").on(table.monitor_review),
  ]
);

export const mediaSource = pgTable(
  "media_source",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    media_id: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    source_type: varchar("source_type", { length: 16 }).notNull().default("website"), // website | epaper | other
    source_url: text("source_url"),
    last_ingest_count: integer("last_ingest_count").notNull().default(0), // 最近一次成功推送新入库/更新篇数（外部抓取服务回传后由 ingest 更新）
    crawl_method: varchar("crawl_method", { length: 16 }).notNull().default("manual"), // rss | html | epaper | manual
    crawl_status: varchar("crawl_status", { length: 16 }).notNull().default("untested"), // untested | ok | warning | error（外部抓取服务回报）
    last_success_at: timestamp("last_success_at", { withTimezone: true }),
    last_ingest_at: timestamp("last_ingest_at", { withTimezone: true }), // 外部抓取服务最近一次成功推送时间
    last_error: text("last_error"),
    fail_count: integer("fail_count").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("media_source_media_idx").on(table.media_id),
    index("media_source_status_idx").on(table.crawl_status),
  ]
);

// ============ 新闻线索配置 ============
export const clueType = pgTable(
  "clue_type",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 32 }).notNull().unique(),
    type_name: varchar("type_name", { length: 64 }).notNull(),
    description: text("description"),
    sort_order: integer("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("clue_type_sort_idx").on(table.sort_order)]
);

// ============ 评报维度配置 ============
export const reviewDimension = pgTable(
  "review_dimension",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 32 }).notNull().unique(),
    dimension_name: varchar("dimension_name", { length: 64 }).notNull(),
    description: text("description"),
    prompt_instruction: text("prompt_instruction"),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("review_dimension_priority_idx").on(table.priority)]
);

// ============ 新闻线索 ============
export const newsClue = pgTable(
  "news_clue",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    article_id: varchar("article_id", { length: 36 }).references(() => article.id),
    media_id: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    clue_type: varchar("clue_type", { length: 32 }).notNull(), // 对应 clue_type.code
    series_name: varchar("series_name", { length: 255 }),
    series_key: varchar("series_key", { length: 128 }).notNull(), // media_id + 归一化名称哈希
    topic: varchar("topic", { length: 128 }),
    summary: text("summary"),
    tags: jsonb("tags"),
    reason: text("reason"),
    confidence: real("confidence"),
    review_status: varchar("review_status", { length: 16 }).notNull().default("pending"), // pending | approved | rejected
    article_count: integer("article_count").notNull().default(1),
    first_found_at: timestamp("first_found_at", { withTimezone: true }).defaultNow().notNull(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    // 最新一篇关联原文的发布时间（新鲜度计算依据；null=无关联原文）
    recent_article_at: timestamp("recent_article_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("news_clue_series_key_idx").on(table.series_key),
    index("news_clue_media_idx").on(table.media_id),
    index("news_clue_type_idx").on(table.clue_type),
    index("news_clue_review_idx").on(table.review_status),
    index("news_clue_found_idx").on(table.first_found_at),
  ]
);

// ============ 线索-文章关联明细（WF04-B：关联原文 + 新鲜度） ============
// 每条线索在识别/合并时，把命中的文章快照落库，供前台展示关联原文与基于真实发布时间的新鲜度。
// 采用独立关联表（外键嵌套关联不可用），主查询 + 按 clue_id 批量二次查询 + Map 组装。
export const newsClueArticle = pgTable(
  "news_clue_article",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    clue_id: varchar("clue_id", { length: 36 })
      .notNull()
      .references(() => newsClue.id, { onDelete: "cascade" }),
    article_id: varchar("article_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    url: text("url"),
    publish_time: timestamp("publish_time", { withTimezone: true }),
    media_id: varchar("media_id", { length: 36 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("news_clue_article_uniq_idx").on(table.clue_id, table.article_id),
    index("news_clue_article_clue_idx").on(table.clue_id),
    index("news_clue_article_article_idx").on(table.article_id),
  ]
);

// ============ 同题主题 ============
export const newsTopic = pgTable(
  "news_topic",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    topic_name: varchar("topic_name", { length: 255 }).notNull(),
    report_date: date("report_date", { mode: "string" }).notNull(),
    importance: varchar("importance", { length: 4 }).default("B"),
    related_article_ids: jsonb("related_article_ids"),
    related_media: jsonb("related_media"),
    media_count: integer("media_count").notNull().default(0),
    confidence: real("confidence"),
    review_status: varchar("review_status", { length: 16 }).notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("news_topic_date_idx").on(table.report_date),
    index("news_topic_review_idx").on(table.review_status),
  ]
);

// ============ 每日评报 ============
export const dailyReview = pgTable(
  "daily_review",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    report_date: date("report_date", { mode: "string" }).notNull().unique(),
    key_topics: jsonb("key_topics"),
    comparison_result: jsonb("comparison_result"),
    unique_reports: jsonb("unique_reports"),
    sections: jsonb("sections"), // { today_focus, same_topic, peer_highlights, overall }
    final_summary: text("final_summary"),
    review_status: varchar("review_status", { length: 16 }).notNull().default("pending"), // pending | approved | published
    version: integer("version").notNull().default(1),
    reviewed_by: varchar("reviewed_by", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("daily_review_status_idx").on(table.review_status)]
);

/**
 * 每日评报版本快照
 * 首次生成时落一份原始版本（source=generate）；每次「更新到当前评报」前把当前内容存快照，
 * 支持查看历史版本与一键恢复（恢复时同样先把当前内容存一份快照）。
 */
export const dailyReviewRevision = pgTable(
  "daily_review_revision",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    review_id: varchar("review_id", { length: 36 })
      .notNull()
      .references(() => dailyReview.id, { onDelete: "cascade" }),
    version: integer("version").notNull(), // 该快照对应的评报版本号
    sections: jsonb("sections"),
    final_summary: text("final_summary"),
    source: varchar("source", { length: 16 }).notNull().default("generate"), // generate | followup | restore
    change_note: text("change_note"), // 本次改动说明（追问/协作修改指令）
    created_by: varchar("created_by", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("daily_review_revision_review_idx").on(table.review_id),
    index("daily_review_revision_version_idx").on(table.review_id, table.version),
  ]
);

// ============ 每日评报：本期选稿（选稿中间态，可追溯） ============
// 「先选稿，再评报」：用户点生成后先落一份本期选稿，确认（可排除不要的稿件）后再生成最终评报。
// 选稿结果可追溯：保留各家媒体、同题分组、同行独有报道、新华社通稿识别，供后续核验与恢复。
export const reviewDraft = pgTable(
  "review_draft",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    report_date: date("report_date", { mode: "string" }).notNull().unique(),
    media_ids: jsonb("media_ids"), // 参与媒体 id 列表
    media_names: jsonb("media_names"), // 参与媒体名称（固定比较媒体）
    // 本期选稿：{ same_topic: [{theme, articles:[{media,title,publish_time,url,id}]}],
    //            peer_exclusive: [{media,title,publish_time,url,why}],
    //            xinhua: [{theme, articles:[...], note}] }
    draft: jsonb("draft"),
    // 排除的稿件（用户认为不应参与评报的文章 id）
    excluded_article_ids: jsonb("excluded_article_ids").notNull().default([]),
    status: varchar("status", { length: 16 }).notNull().default("draft"), // draft | generated
    min_word_count: integer("min_word_count").notNull().default(2000),
    dimensions: jsonb("dimensions"),
    topics: jsonb("topics"),
    scan_missing: boolean("scan_missing").notNull().default(true),
    created_by: varchar("created_by", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("review_draft_date_idx").on(table.report_date),
    index("review_draft_status_idx").on(table.status),
  ]
);

// ============ 每周媒体简报 ============
export const weeklyBrief = pgTable(
  "weekly_brief",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    week_start: date("week_start", { mode: "string" }).notNull().unique(),
    sections: jsonb("sections"), // { new_columns, key_series, focus_topics, features }
    final_summary: text("final_summary"),
    review_status: varchar("review_status", { length: 16 }).notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("weekly_brief_week_idx").on(table.week_start)]
);

// ============ 任务日志 ============
export const taskLog = pgTable(
  "task_log",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    workflow_name: varchar("workflow_name", { length: 32 }).notNull(),
    start_time: timestamp("start_time", { withTimezone: true }).defaultNow().notNull(),
    end_time: timestamp("end_time", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("running"), // running | success | failed
    source_count: integer("source_count").notNull().default(0),
    success_count: integer("success_count").notNull().default(0),
    failure_count: integer("failure_count").notNull().default(0),
    new_data_count: integer("new_data_count").notNull().default(0),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("task_log_workflow_idx").on(table.workflow_name),
    index("task_log_start_idx").on(table.start_time),
  ]
);

// ============ AI 审核日志 ============
export const aiAuditLog = pgTable(
  "ai_audit_log",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    module: varchar("module", { length: 32 }).notNull(), // calendar | clue | review
    ref_id: varchar("ref_id", { length: 36 }),
    input_summary: text("input_summary"),
    ai_output: jsonb("ai_output"),
    confidence: real("confidence"),
    human_decision: varchar("human_decision", { length: 32 }), // approved | modified | rejected
    decided_by: varchar("decided_by", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_audit_module_idx").on(table.module),
    index("ai_audit_ref_idx").on(table.ref_id),
  ]
);

// ============ 文章（外部抓取服务回推入库） ============
// 注意：本表列名以数据库实际为准（media_id/source_id/publish_time/ai_card 等）
export const article = pgTable(
  "article",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    media_id: varchar("media_id", { length: 36 }).notNull(),
    source_id: varchar("source_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    url: text("url").notNull(),
    external_id: varchar("external_id", { length: 128 }), // 外部抓取服务提供的文章唯一标识（同一数据源内唯一）
    publish_time: timestamp("publish_time", { withTimezone: true }),
    crawl_time: timestamp("crawl_time", { withTimezone: true }), // 实际抓取时间（区别于发布时间）
    content_hash: varchar("content_hash", { length: 64 }), // 去重唯一键
    word_count: integer("word_count"),
    section: varchar("section", { length: 64 }), // 版面（电子报，外部抓取可能拿不到）
    is_key_report: boolean("is_key_report").notNull().default(false), // 重点稿标记
    // 线索流水线标记：clue-pipeline.ts 用 clue_processed=false 筛选未处理文章
    clue_processed: boolean("clue_processed").notNull().default(false),
    parse_status: varchar("parse_status", { length: 16 }).notNull().default("parsed"), // parsed | failed
    content: text("content"), // 原文
    ai_card: jsonb("ai_card"), // AI 压缩后的结构化卡片（M4 用）
    // ===== 外部抓取服务回传的丰富元数据（ingest 扩展）=====
    column_name: varchar("column_name", { length: 255 }), // 栏目名
    edition_no: varchar("edition_no", { length: 32 }), // 版面号
    edition_name: varchar("edition_name", { length: 64 }), // 版名
    is_front_page: boolean("is_front_page").notNull().default(false), // 是否头版
    is_full_page: boolean("is_full_page").notNull().default(false), // 是否整版
    is_cross_page: boolean("is_cross_page").notNull().default(false), // 是否跨版
    series_name: varchar("series_name", { length: 255 }), // 系列名
    special_name: varchar("special_name", { length: 255 }), // 专题名
    special_url: text("special_url"), // 专题页链接
    images: jsonb("images"), // 图片/图示元数据列表
    source_type: varchar("source_type", { length: 16 }), // website | epaper | other
    scrape_method: varchar("scrape_method", { length: 16 }), // html | playwright | rss | manual
    first_seen_at: timestamp("first_seen_at", { withTimezone: true }), // 首次发现时间
    business: jsonb("business"), // 业务标记（每日评报/新闻线索）
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("article_source_idx").on(table.source_id),
    index("article_media_idx").on(table.media_id),
    index("article_publish_idx").on(table.publish_time),
    uniqueIndex("article_hash_idx").on(table.content_hash),
    uniqueIndex("article_source_external_idx").on(table.source_id, table.external_id),
  ]
);

// ============================================================================
// 新闻日历重构：历史日历（资料库） → 候选节点（待审） → 正式日历（可用）
// 设计要点：
//   1. AI 生成的任何节点一律先进候选池，绝不直写 calendar_event
//   2. 时间未定用 date_status 表达（confirmed / month_known / unknown），
//      绝不把待定节点虚构成某月 1 日
//   3. 历史年份、目标年份全部动态配置，不写死
// ============================================================================

/** 历史日历原始文件（保留原件，换解析规则可重跑） */
export const calendarHistoryFile = pgTable(
  "calendar_history_file",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    file_name: varchar("file_name", { length: 255 }).notNull(),
    file_type: varchar("file_type", { length: 16 }).notNull(), // docx | xlsx | csv
    file_size: integer("file_size"),
    storage_path: text("storage_path"),
    year: integer("year").notNull(), // 所属历史年份（动态，不写死）
    parse_status: varchar("parse_status", { length: 16 }).notNull().default("uploaded"), // uploaded | parsed | confirmed | failed
    node_count: integer("node_count").default(0),
    uploaded_by: varchar("uploaded_by", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("calendar_hist_file_year_idx").on(table.year),
    index("calendar_hist_file_status_idx").on(table.parse_status),
  ]
);

/** 解析后的历史节点（候选生成的素材来源） */
export const calendarHistoryNode = pgTable(
  "calendar_history_node",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    file_id: varchar("file_id", { length: 36 }).references(() => calendarHistoryFile.id),
    year: integer("year").notNull(),
    node_name: varchar("node_name", { length: 255 }).notNull(),
    event_date: date("event_date", { mode: "string" }), // date_status=confirmed 时有值
    candidate_month: integer("candidate_month"), // month_known 时有值（1-12）
    date_status: varchar("date_status", { length: 16 }).notNull().default("confirmed"),
    category_id: varchar("category_id", { length: 36 }).references(() => calendarCategory.id),
    region: varchar("region", { length: 16 }).default("national"),
    importance: varchar("importance", { length: 4 }).default("B"), // S | A | B
    description: text("description"),
    source_detail: varchar("source_detail", { length: 255 }),
    raw_text: text("raw_text"), // 原始行文本，可回溯
    enabled: boolean("enabled").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("calendar_hist_node_file_idx").on(table.file_id),
    index("calendar_hist_node_year_idx").on(table.year),
    index("calendar_hist_node_date_idx").on(table.event_date),
  ]
);

/** 候选节点池（三个入口汇聚，人工审核后才进正式日历） */
export const calendarCandidate = pgTable(
  "calendar_candidate",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    node_name: varchar("node_name", { length: 255 }).notNull(),
    target_year: integer("target_year").notNull(), // 目标年度（动态）
    candidate_date: date("candidate_date", { mode: "string" }),
    candidate_month: integer("candidate_month"),
    base_year: integer("base_year"), // 周年基准年（历史迁移取原始发生年；其余填 target_year）
    date_status: varchar("date_status", { length: 16 }).notNull().default("confirmed"),
    category_id: varchar("category_id", { length: 36 }).references(() => calendarCategory.id),
    region: varchar("region", { length: 16 }).default("national"),
    importance: varchar("importance", { length: 4 }).default("B"),
    // historical_migration | ai_supplement | pasted_text | manual
    source_type: varchar("source_type", { length: 32 }).notNull().default("manual"),
    source_detail: text("source_detail"),
    raw_text: text("raw_text"), // 粘贴识别时保存全文
    description: text("description"),
    source_url: text("source_url"),
    ai_reason: text("ai_reason"), // AI 推荐理由
    dedup_status: varchar("dedup_status", { length: 16 }).notNull().default("new"), // new | merged | duplicate | kept（用户保留，不再判重复）
    merged_into_id: varchar("merged_into_id", { length: 36 }),
    merged_sources: jsonb("merged_sources"), // 合并前的所有来源，如 ["historical_migration","ai_supplement"]
    review_status: varchar("review_status", { length: 16 }).notNull().default("pending"), // pending | confirmed | rejected | merged
    rejection_reason: varchar("rejection_reason", { length: 64 }), // 见不采纳原因枚举
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    reviewed_by: varchar("reviewed_by", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("calendar_cand_year_idx").on(table.target_year),
    index("calendar_cand_review_idx").on(table.review_status),
    index("calendar_cand_source_idx").on(table.source_type),
    index("calendar_cand_dedup_idx").on(table.dedup_status),
  ]
);
