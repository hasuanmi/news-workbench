-- 新闻日历重构：历史日历（资料库） → 候选节点池 → 正式日历
-- 幂等脚本，可重复执行。

-- ========== 1. 历史日历原始文件 ==========
CREATE TABLE IF NOT EXISTS "calendar_history_file" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "file_type" varchar(16) NOT NULL,
  "file_size" integer,
  "storage_path" text,
  "year" integer NOT NULL,
  "parse_status" varchar(16) NOT NULL DEFAULT 'uploaded',
  "node_count" integer DEFAULT 0,
  "uploaded_by" varchar(36),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "calendar_hist_file_year_idx" ON "calendar_history_file" ("year");
CREATE INDEX IF NOT EXISTS "calendar_hist_file_status_idx" ON "calendar_history_file" ("parse_status");

-- ========== 2. 解析后的历史节点 ==========
CREATE TABLE IF NOT EXISTS "calendar_history_node" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_id" varchar(36) REFERENCES "calendar_history_file"("id"),
  "year" integer NOT NULL,
  "node_name" varchar(255) NOT NULL,
  "event_date" date,
  "candidate_month" integer,
  "date_status" varchar(16) NOT NULL DEFAULT 'confirmed',
  "category_id" varchar(36) REFERENCES "calendar_category"("id"),
  "region" varchar(16) DEFAULT 'national',
  "importance" varchar(4) DEFAULT 'B',
  "description" text,
  "source_detail" varchar(255),
  "raw_text" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "calendar_hist_node_file_idx" ON "calendar_history_node" ("file_id");
CREATE INDEX IF NOT EXISTS "calendar_hist_node_year_idx" ON "calendar_history_node" ("year");
CREATE INDEX IF NOT EXISTS "calendar_hist_node_date_idx" ON "calendar_history_node" ("event_date");

-- ========== 3. 候选节点池 ==========
CREATE TABLE IF NOT EXISTS "calendar_candidate" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "node_name" varchar(255) NOT NULL,
  "target_year" integer NOT NULL,
  "candidate_date" date,
  "candidate_month" integer,
  "date_status" varchar(16) NOT NULL DEFAULT 'confirmed',
  "category_id" varchar(36) REFERENCES "calendar_category"("id"),
  "region" varchar(16) DEFAULT 'national',
  "importance" varchar(4) DEFAULT 'B',
  "source_type" varchar(32) NOT NULL DEFAULT 'manual',
  "source_detail" text,
  "raw_text" text,
  "source_url" text,
  "ai_reason" text,
  "dedup_status" varchar(16) NOT NULL DEFAULT 'new',
  "merged_into_id" varchar(36),
  "merged_sources" jsonb,
  "review_status" varchar(16) NOT NULL DEFAULT 'pending',
  "rejection_reason" varchar(64),
  "reviewed_at" timestamp with time zone,
  "reviewed_by" varchar(36),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "calendar_cand_year_idx" ON "calendar_candidate" ("target_year");
CREATE INDEX IF NOT EXISTS "calendar_cand_review_idx" ON "calendar_candidate" ("review_status");
CREATE INDEX IF NOT EXISTS "calendar_cand_source_idx" ON "calendar_candidate" ("source_type");
CREATE INDEX IF NOT EXISTS "calendar_cand_dedup_idx" ON "calendar_candidate" ("dedup_status");

-- ========== 4. calendar_event 加列（时间待定表达 + 候选溯源）==========
ALTER TABLE "calendar_event" ADD COLUMN IF NOT EXISTS "date_status" varchar(16) NOT NULL DEFAULT 'confirmed';
ALTER TABLE "calendar_event" ADD COLUMN IF NOT EXISTS "event_month" integer;
ALTER TABLE "calendar_event" ADD COLUMN IF NOT EXISTS "source_candidate_id" varchar(36);
ALTER TABLE "calendar_event" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
ALTER TABLE "calendar_event" ADD COLUMN IF NOT EXISTS "confirmed_by" varchar(36);
CREATE INDEX IF NOT EXISTS "calendar_event_date_status_idx" ON "calendar_event" ("date_status");

-- ========== 5. 动态年份配置（不写死具体年份）==========
INSERT INTO "app_config" ("key", "value")
VALUES ('calendar.target_year', '2027'::jsonb)
ON CONFLICT DO NOTHING;
INSERT INTO "app_config" ("key", "value")
VALUES ('calendar.historical_years', '[]'::jsonb)
ON CONFLICT DO NOTHING;
INSERT INTO "app_config" ("key", "value")
VALUES ('calendar.dedup_ai_threshold', '0.85'::jsonb)
ON CONFLICT DO NOTHING;
