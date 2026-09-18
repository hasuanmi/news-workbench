-- Approved B scope: recent_article_at + three missing persistence tables.
-- Explicit guarded execution only; never executed by application startup.
-- Restore tables declared by the existing source schema, without rewriting workflows.
-- Run physical-table preflight first. Abort if another deployment created a table.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.news_clue_article') IS NOT NULL
     OR to_regclass('public.review_draft') IS NOT NULL
     OR to_regclass('public.daily_review_revision') IS NOT NULL THEN
    RAISE EXCEPTION 'Schema changed: re-audit existing tables before applying this proposal';
  END IF;
END $$;

ALTER TABLE public.news_clue ADD COLUMN IF NOT EXISTS recent_article_at timestamptz;

CREATE TABLE public.news_clue_article (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  clue_id varchar(36) NOT NULL REFERENCES public.news_clue(id) ON DELETE CASCADE,
  article_id varchar(36) NOT NULL,
  title varchar(500) NOT NULL,
  url text,
  publish_time timestamptz,
  media_id varchar(36) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX news_clue_article_uniq_idx ON public.news_clue_article (clue_id, article_id);
CREATE INDEX news_clue_article_clue_idx ON public.news_clue_article (clue_id);
CREATE INDEX news_clue_article_article_idx ON public.news_clue_article (article_id);

CREATE TABLE public.review_draft (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  media_ids jsonb,
  media_names jsonb,
  draft jsonb,
  excluded_article_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'draft',
  min_word_count integer NOT NULL DEFAULT 2000,
  dimensions jsonb,
  topics jsonb,
  scan_missing boolean NOT NULL DEFAULT true,
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX review_draft_date_idx ON public.review_draft (report_date);
CREATE INDEX review_draft_status_idx ON public.review_draft (status);

CREATE TABLE public.daily_review_revision (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id varchar(36) NOT NULL REFERENCES public.daily_review(id) ON DELETE CASCADE,
  version integer NOT NULL,
  sections jsonb,
  final_summary text,
  source varchar(16) NOT NULL DEFAULT 'generate',
  change_note text,
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX daily_review_revision_review_idx ON public.daily_review_revision (review_id);
CREATE INDEX daily_review_revision_version_idx ON public.daily_review_revision (review_id, version);

-- New tables are server-only; do not expose new data to anon/authenticated clients.
ALTER TABLE public.news_clue_article ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_review_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_clue_article, public.review_draft, public.daily_review_revision FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.news_clue_article, public.review_draft, public.daily_review_revision TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
