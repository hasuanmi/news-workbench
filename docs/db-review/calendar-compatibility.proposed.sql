-- Proposal A v2: STRUCTURE ONLY. Shared production database: approval required.
-- Not part of the automatic migration directory. Never executed by local startup.
-- Requires preflight-readonly.sql and a fresh schema check before execution.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.calendar_event
  ADD COLUMN IF NOT EXISTS event_year integer,
  -- Nullable labels avoid falsely marking existing historical events as manual.
  ADD COLUMN IF NOT EXISTS source varchar(24),
  ADD COLUMN IF NOT EXISTS source_type varchar(32),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_reason varchar(32),
  ADD COLUMN IF NOT EXISTS deleted_by varchar(36);

-- Existing API queries and category editing already use color;
-- the current source schema and shared database both omit it.
ALTER TABLE public.calendar_category
  ADD COLUMN IF NOT EXISTS color varchar(16) DEFAULT '#6b6257';

CREATE INDEX IF NOT EXISTS calendar_event_source_idx ON public.calendar_event (source);
CREATE INDEX IF NOT EXISTS calendar_event_deleted_idx ON public.calendar_event (deleted_at);
CREATE INDEX IF NOT EXISTS calendar_event_source_type_idx ON public.calendar_event (source_type);

-- Many historical records may refer to one event. One historical ID may only
-- map to one event, including a disabled/soft-deleted event. Never resurrect it.
-- Preflight must establish that this NEW table does not already exist.
CREATE TABLE public.calendar_history_event_ref (
  history_node_id varchar(36) PRIMARY KEY,
  calendar_event_id varchar(36) NOT NULL REFERENCES public.calendar_event(id),
  import_run_id varchar(36) NOT NULL,
  match_method varchar(32) NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_history_event_ref_event_idx
  ON public.calendar_history_event_ref (calendar_event_id);
CREATE INDEX calendar_history_event_ref_run_idx
  ON public.calendar_history_event_ref (import_run_id);
ALTER TABLE public.calendar_history_event_ref ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.calendar_history_event_ref FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_history_event_ref TO service_role;

-- No UPDATE/INSERT of existing business rows. No review-status changes,
-- approval triggers, publication requirements or history imports in Proposal A.
-- Labels/reference backfill and history import are a separate reviewed step.

NOTIFY pgrst, 'reload schema';
COMMIT;
