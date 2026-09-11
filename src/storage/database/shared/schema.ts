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
    anniversary_base_year: integer("anniversary_base_year"), // 周年基准年
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
    created_by: varchar("created_by", { length: 36 }),
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
    publish_time: timestamp("publish_time", { withTimezone: true }),
    crawl_time: timestamp("crawl_time", { withTimezone: true }),
    content_hash: varchar("content_hash", { length: 64 }), // 去重唯一键
    word_count: integer("word_count"),
    section: varchar("section", { length: 64 }), // 版面（电子报，外部抓取可能拿不到）
    is_key_report: boolean("is_key_report").notNull().default(false), // 重点稿标记
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
  ]
);
