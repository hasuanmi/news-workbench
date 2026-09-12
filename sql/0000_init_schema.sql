CREATE TABLE "ai_audit_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" varchar(32) NOT NULL,
	"ref_id" varchar(36),
	"input_summary" text,
	"ai_output" jsonb,
	"confidence" real,
	"human_decision" varchar(32),
	"decided_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb,
	"description" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64) NOT NULL,
	"display_name" varchar(128) DEFAULT '' NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(16) DEFAULT 'editor' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "app_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "article" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" varchar(36) NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"title" varchar(500) NOT NULL,
	"url" text NOT NULL,
	"publish_time" timestamp with time zone,
	"crawl_time" timestamp with time zone,
	"content_hash" varchar(64),
	"word_count" integer,
	"section" varchar(64),
	"is_key_report" boolean DEFAULT false NOT NULL,
	"parse_status" varchar(16) DEFAULT 'parsed' NOT NULL,
	"content" text,
	"ai_card" jsonb,
	"column_name" varchar(255),
	"edition_no" varchar(32),
	"edition_name" varchar(64),
	"is_front_page" boolean DEFAULT false NOT NULL,
	"is_full_page" boolean DEFAULT false NOT NULL,
	"is_cross_page" boolean DEFAULT false NOT NULL,
	"series_name" varchar(255),
	"special_name" varchar(255),
	"special_url" text,
	"images" jsonb,
	"source_type" varchar(16),
	"scrape_method" varchar(16),
	"first_seen_at" timestamp with time zone,
	"business" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_category" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"category_name" varchar(64) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "calendar_category_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "calendar_event" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" varchar(255) NOT NULL,
	"event_type" varchar(16) DEFAULT 'dynamic' NOT NULL,
	"original_date" date,
	"event_date" date,
	"anniversary_base_year" integer,
	"category_id" varchar(36),
	"region" varchar(16) DEFAULT 'national' NOT NULL,
	"importance" varchar(4) DEFAULT 'B',
	"description" text,
	"source_name" varchar(128),
	"source_url" text,
	"source_authority" varchar(16),
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"tags" jsonb,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clue_type" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"type_name" varchar(64) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clue_type_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "daily_review" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_date" date NOT NULL,
	"key_topics" jsonb,
	"comparison_result" jsonb,
	"unique_reports" jsonb,
	"sections" jsonb,
	"final_summary" text,
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reviewed_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "daily_review_report_date_unique" UNIQUE("report_date")
);
--> statement-breakpoint
CREATE TABLE "health_check" (
	"id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_name" varchar(128) NOT NULL,
	"media_level" varchar(16) DEFAULT 'city' NOT NULL,
	"region" varchar(64) DEFAULT '' NOT NULL,
	"monitor_clue" boolean DEFAULT false NOT NULL,
	"monitor_review" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "media_media_name_unique" UNIQUE("media_name")
);
--> statement-breakpoint
CREATE TABLE "media_source" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" varchar(36) NOT NULL,
	"source_type" varchar(16) DEFAULT 'website' NOT NULL,
	"source_url" text,
	"crawl_method" varchar(16) DEFAULT 'manual' NOT NULL,
	"crawl_status" varchar(16) DEFAULT 'untested' NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_ingest_at" timestamp with time zone,
	"last_error" text,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "news_clue" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" varchar(36),
	"media_id" varchar(36) NOT NULL,
	"clue_type" varchar(32) NOT NULL,
	"series_name" varchar(255),
	"series_key" varchar(128) NOT NULL,
	"topic" varchar(128),
	"summary" text,
	"tags" jsonb,
	"reason" text,
	"confidence" real,
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"article_count" integer DEFAULT 1 NOT NULL,
	"first_found_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "news_topic" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_name" varchar(255) NOT NULL,
	"report_date" date NOT NULL,
	"importance" varchar(4) DEFAULT 'B',
	"related_article_ids" jsonb,
	"related_media" jsonb,
	"media_count" integer DEFAULT 0 NOT NULL,
	"confidence" real,
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_dimension" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"dimension_name" varchar(64) NOT NULL,
	"description" text,
	"prompt_instruction" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "review_dimension_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "task_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_name" varchar(32) NOT NULL,
	"start_time" timestamp with time zone DEFAULT now() NOT NULL,
	"end_time" timestamp with time zone,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"new_data_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_brief" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"sections" jsonb,
	"final_summary" text,
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "weekly_brief_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_category_id_calendar_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."calendar_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_source" ADD CONSTRAINT "media_source_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_clue" ADD CONSTRAINT "news_clue_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_clue" ADD CONSTRAINT "news_clue_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_audit_module_idx" ON "ai_audit_log" USING btree ("module");--> statement-breakpoint
CREATE INDEX "ai_audit_ref_idx" ON "ai_audit_log" USING btree ("ref_id");--> statement-breakpoint
CREATE INDEX "app_user_role_idx" ON "app_user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "article_source_idx" ON "article" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "article_media_idx" ON "article" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "article_publish_idx" ON "article" USING btree ("publish_time");--> statement-breakpoint
CREATE UNIQUE INDEX "article_hash_idx" ON "article" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "calendar_category_sort_idx" ON "calendar_category" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "calendar_event_date_idx" ON "calendar_event" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "calendar_event_category_idx" ON "calendar_event" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "calendar_event_review_idx" ON "calendar_event" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "calendar_event_type_idx" ON "calendar_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "calendar_event_region_idx" ON "calendar_event" USING btree ("region");--> statement-breakpoint
CREATE INDEX "calendar_event_enabled_idx" ON "calendar_event" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "clue_type_sort_idx" ON "clue_type" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "daily_review_status_idx" ON "daily_review" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "media_level_idx" ON "media" USING btree ("media_level");--> statement-breakpoint
CREATE INDEX "media_monitor_clue_idx" ON "media" USING btree ("monitor_clue");--> statement-breakpoint
CREATE INDEX "media_monitor_review_idx" ON "media" USING btree ("monitor_review");--> statement-breakpoint
CREATE INDEX "media_source_media_idx" ON "media_source" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_source_status_idx" ON "media_source" USING btree ("crawl_status");--> statement-breakpoint
CREATE UNIQUE INDEX "news_clue_series_key_idx" ON "news_clue" USING btree ("series_key");--> statement-breakpoint
CREATE INDEX "news_clue_media_idx" ON "news_clue" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "news_clue_type_idx" ON "news_clue" USING btree ("clue_type");--> statement-breakpoint
CREATE INDEX "news_clue_review_idx" ON "news_clue" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "news_clue_found_idx" ON "news_clue" USING btree ("first_found_at");--> statement-breakpoint
CREATE INDEX "news_topic_date_idx" ON "news_topic" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "news_topic_review_idx" ON "news_topic" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "review_dimension_priority_idx" ON "review_dimension" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "task_log_workflow_idx" ON "task_log" USING btree ("workflow_name");--> statement-breakpoint
CREATE INDEX "task_log_start_idx" ON "task_log" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "weekly_brief_week_idx" ON "weekly_brief" USING btree ("week_start");