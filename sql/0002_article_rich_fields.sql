-- 0002_article_rich_fields.sql
-- 扩展 article 表，接收外部抓取服务（media-scraper）回传的丰富元数据。
-- 用法（二选一）：
--   A. Supabase 后台 → SQL Editor 直接粘贴执行本文件；
--   B. 自建 Postgres 用 psql 执行；或后续配置 drizzle-kit 后 `drizzle-kit push`
--      （schema.ts 已同步新增这些列，push 也会自动补齐）。
-- 全部使用 ADD COLUMN IF NOT EXISTS，可重复执行，幂等安全。

ALTER TABLE public.article
  ADD COLUMN IF NOT EXISTS column_name varchar(255),
  ADD COLUMN IF NOT EXISTS edition_no varchar(32),
  ADD COLUMN IF NOT EXISTS edition_name varchar(64),
  ADD COLUMN IF NOT EXISTS is_front_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_full_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cross_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS series_name varchar(255),
  ADD COLUMN IF NOT EXISTS special_name varchar(255),
  ADD COLUMN IF NOT EXISTS special_url text,
  ADD COLUMN IF NOT EXISTS images jsonb,
  ADD COLUMN IF NOT EXISTS source_type varchar(16),
  ADD COLUMN IF NOT EXISTS scrape_method varchar(16),
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS business jsonb;

-- 可选索引：按栏目/系列/来源类型查询加速（按需开启，不影响功能）
-- CREATE INDEX IF NOT EXISTS article_column_idx ON public.article (column_name);
-- CREATE INDEX IF NOT EXISTS article_series_idx ON public.article (series_name);
-- CREATE INDEX IF NOT EXISTS article_srctype_idx ON public.article (source_type);
