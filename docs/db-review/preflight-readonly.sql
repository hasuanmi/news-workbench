-- Read-only verification in the confirmed shared Supabase SQL Editor.
-- REST audit describes API visibility; this confirms physical table/column identity.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('calendar_event', 'calendar_category', 'calendar_history_node',
                    'calendar_candidate', 'calendar_history_event_ref', 'news_clue',
                    'news_clue_article', 'review_draft', 'daily_review_revision')
ORDER BY table_name, ordinal_position;

-- Proposal A v2 expects this new table to be absent, and event.id varchar(36).
SELECT to_regclass('public.calendar_history_event_ref') AS existing_history_reference_table;
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.calendar_event'::regclass;

SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('news_clue_article', 'review_draft', 'daily_review_revision');

SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('news_clue_article', 'review_draft', 'daily_review_revision');
