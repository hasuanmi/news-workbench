# Shared database review — no migration executed

Confirmed by the owner: `reusdpelytqggjyhfsyh.supabase.co` is the shared Coze production database. Local startup does not create an isolated database. All checks so far use GET/SELECT; login issues a cookie and does not update users.

The REST schema audit cannot distinguish a physically absent table from a stale/unexposed PostgREST schema. Run [the read-only preflight](preflight-readonly.sql) before any approved migration. Do not run seed/import/upgrade/push commands against this project.

## Proposal A: calendar compatibility

[Exact SQL](calendar-compatibility.proposed.sql) adds `calendar_event.event_year`, `source`, `deleted_at`, `delete_reason`, `deleted_by`, and `calendar_category.color`. Existing calendar/category queries already reference these fields, including category color, which is missing from the local Drizzle schema too. If approved, add that field to the source schema at the same time.

Impact: no row deletion, no change to original names/dates/review status/enabled flags, and no confirmation of candidates. New nullable fields are null; source defaults to `user_add` and category color defaults to `#6b6257` for existing rows. The three current migrated nodes must have their historical source metadata reviewed separately; this proposal deliberately performs no data backfill. ALTER briefly requires table locks; timeouts abort the transaction rather than waiting indefinitely.

Rollback: before COMMIT, transaction failure rolls everything back. After COMMIT, dropping only these new columns/indexes restores the old shape **only if they have not accumulated data and the application has been rolled back first**. Once populated, export the new metadata before any rollback; dropping populated columns loses it. No automatic rollback/deletion script is provided.

This fixes schema access only. It will not populate the future 30-day window: the formal event table has only three January 1 events; historical nodes and pending 2027 candidates are separate datasets.

## Proposal B: existing business table omissions

[Exact SQL](business-schema.proposed.sql) adds `news_clue.recent_article_at` and creates `news_clue_article`, `review_draft`, `daily_review_revision` using the existing source schema. It adds indexes and foreign keys only on new empty tables; new tables have RLS enabled with access reserved for the service role.

Impact: existing articles, clues and reviews remain unchanged; no mock data, evidence backfill, AI generation or revision snapshots are inserted. Before execution, verify physical absence and grants. The proposal aborts if any new table already exists, to avoid changing another deployment's permissions.

Rollback: transaction failure is atomic. After commit and before use, rollback the application and remove only the new empty tables/nullable column. After use, export new associations/drafts/revisions first; dropping them would lose data. Existing parent records are not deleted by dropping these tables. Owner approval is required for rollback too.

Both proposals are stored outside `sql/` to avoid accidental automatic application. Approval for one proposal does not authorize the other or any history/candidate conversion.
