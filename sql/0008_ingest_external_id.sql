-- 0008_ingest_external_id.sql
-- 外部抓取服务接入增强：
--   1) article.external_id：外部文章唯一标识，(source_id, external_id) 唯一（多条 NULL 互不冲突，
--      恰好满足「仅当外部提供 external_id 时参与唯一去重」）
--   2) media_source.last_ingest_count：最近一次成功推送的新入库/更新篇数
--
-- 去重优先级（应用层实现）：external_id 优先；缺失时退回 URL/content hash。

ALTER TABLE article
  ADD COLUMN IF NOT EXISTS external_id varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS article_source_external_idx
  ON article (source_id, external_id);

ALTER TABLE media_source
  ADD COLUMN IF NOT EXISTS last_ingest_count integer NOT NULL DEFAULT 0;
