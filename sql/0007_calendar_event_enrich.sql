-- 新闻日历节点自动补全：新增/编辑时联网检索 + LLM 生成，详情直接展示
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS ai_background text;
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS ai_why text;
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS ai_topics jsonb;
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS ai_sources jsonb;
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS enrich_status varchar(16) NOT NULL DEFAULT 'none';
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS enrich_fingerprint varchar(64);
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS enrich_error text;
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS enrich_fail_count integer NOT NULL DEFAULT 0;
ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

CREATE INDEX IF NOT EXISTS calendar_event_enrich_status_idx ON calendar_event (enrich_status);