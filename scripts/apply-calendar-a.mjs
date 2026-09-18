// Approved Proposal A v2 + atomic history import. No seed/startup integration.
// Default: read-only preflight/dry-run. Explicit execution: --apply.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { planHistoryImport } from './plan-history-calendar.mjs';
pg.types.setTypeParser(1082, value => value); // Preserve PostgreSQL DATE as YYYY-MM-DD.

for (const file of ['.env.local', '.env']) if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
const runId = randomUUID();
const folder = path.join('logs', 'calendar-import', runId);
fs.mkdirSync(folder, { recursive: true });
const report = { run_id: runId, started_at: new Date().toISOString(), mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
  schemaApplied: false, dataCommitted: false, inserted: [], referencesAdded: [], sourceChanges: [], held: [] };
const save = () => fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(report, null, 2));
const snapshot = (name, value) => fs.writeFileSync(path.join(folder, `${name}.json`), JSON.stringify(value, null, 2));
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PGDATABASE_URL;
if (!connectionString) {
  report.status = 'BLOCKED';
  report.error = 'Missing DATABASE_URL / SUPABASE_DB_URL. REST service-role key cannot execute DDL or transactional SQL.';
  save(); console.log(JSON.stringify({ run_id: runId, status: report.status, error: report.error, manifest: path.join(folder, 'manifest.json') }));
  process.exit(2);
}
const expected = new URL(process.env.SUPABASE_URL || process.env.COZE_SUPABASE_URL).hostname.split('.')[0];
const uri = new URL(connectionString);
if (uri.hostname !== `db.${expected}.supabase.co` && !(uri.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(uri.username).endsWith(`.${expected}`))) {
  report.status = 'BLOCKED'; report.error = 'SQL connection identity does not match configured Supabase project'; save(); process.exit(2);
}
const sslRootCert = process.env.PGSSLROOTCERT;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: true,
  ...(sslRootCert ? { ca: fs.readFileSync(sslRootCert, 'utf8') } : {}) }, connectionTimeoutMillis: 15000,
  application_name: 'news-workbench-calendar-a-v2' });
let transaction = false;
try {
  await client.connect();
  report.databaseIdentity = (await client.query('SELECT current_database() AS database, current_user AS role')).rows[0];
  const columns = (await client.query(`SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN
    ('calendar_event','calendar_category','calendar_history_node','calendar_candidate','calendar_history_event_ref')
    ORDER BY table_name,ordinal_position`)).rows;
  snapshot('schema-before', columns);
  const identity = columns.find(row => row.table_name === 'calendar_event' && row.column_name === 'id');
  if (identity?.data_type !== 'character varying' || identity.character_maximum_length !== 36) throw new Error('Preflight: calendar_event.id is not varchar(36)');
  const refExists = columns.some(row => row.table_name === 'calendar_history_event_ref');
  const before = (await client.query('SELECT * FROM public.calendar_event ORDER BY id')).rows;
  snapshot('events-before', before);
  const beforeHistory = (await client.query('SELECT * FROM public.calendar_history_node ORDER BY id')).rows;
  snapshot('history-before', beforeHistory);
  const required = ['event_year','source','source_type','deleted_at','delete_reason','deleted_by'];
  const fieldsMissing = required.filter(name => !columns.some(row => row.table_name === 'calendar_event' && row.column_name === name));
  const colorMissing = !columns.some(row => row.table_name === 'calendar_category' && row.column_name === 'color');
  report.preflight = { fieldsMissing, colorMissing, referenceTableMissing: !refExists };
  if (refExists && (fieldsMissing.length || colorMissing)) throw new Error('Partially applied schema: stop rather than modify existing reference table');
  if (!refExists && report.mode === 'apply') {
    const sql = fs.readFileSync('docs/db-review/calendar-compatibility.proposed.sql', 'utf8');
    report.schemaSqlHash = fingerprint(sql); save();
    await client.query(sql); report.schemaApplied = true; save();
  }
  // SERIALIZABLE + advisory lock + short table write locks: matching/inserts atomic.
  await client.query(report.mode === 'apply' ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY'); transaction = true;
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  if (report.mode === 'apply') {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('calendar-history-import-v2'))");
    await client.query('LOCK TABLE public.calendar_event, public.calendar_history_event_ref IN SHARE ROW EXCLUSIVE MODE');
    await client.query('LOCK TABLE public.calendar_history_node, public.calendar_candidate IN SHARE MODE');
  }
  const histories = (await client.query('SELECT * FROM public.calendar_history_node ORDER BY id')).rows;
  const events = (await client.query('SELECT * FROM public.calendar_event ORDER BY id')).rows;
  const candidates = (await client.query('SELECT * FROM public.calendar_candidate ORDER BY id')).rows;
  const references = refExists || report.schemaApplied ? (await client.query('SELECT * FROM public.calendar_history_event_ref')).rows : [];
  // pg Date values are timestamps; DATE columns remain strings.
  const result = planHistoryImport(histories, events, candidates, references, new Date().toISOString().slice(0, 10));
  snapshot('plan', result); report.summary = result.summary;
  report.held = result.plan.filter(row => row.action.startsWith('hold_'));
  if (report.mode === 'dry-run') { await client.query('ROLLBACK'); transaction = false; report.status = 'DRY_RUN'; save(); }
  else {
    const historyById = new Map(histories.map(row => [row.id, row]));
    const resolved = new Map();
    // Two passes: create representatives first, then link their duplicates.
    for (const item of result.plan.filter(row => row.action === 'insert')) {
      const node = historyById.get(item.historyId);
      const id = randomUUID();
      const inserted = await client.query(`INSERT INTO public.calendar_event
        (id,event_name,event_type,event_date,date_status,event_month,category_id,region,importance,description,
         source_name,source,source_type,enabled,needs_review,review_status)
        VALUES($1,$2,'dynamic',$3,$4,$5,$6,$7,$8,$9,$10,'history_migrate','historical_migration',true,false,'pending') RETURNING *`,
        [id,node.node_name,node.date_status === 'confirmed' ? node.event_date : null,node.date_status,
          node.candidate_month ?? (node.event_date ? Number(node.event_date.slice(5,7)) : null),node.category_id,
          node.region ?? 'national',node.importance ?? 'B',node.description ?? null,`history_node:${node.id}`]);
      const row = inserted.rows[0];
      report.inserted.push({ id, history_node_id: node.id, row, fingerprint: fingerprint(row) }); resolved.set(node.id, id);
    }
    for (const item of result.plan.filter(row => row.action.startsWith('link_existing'))) resolved.set(item.historyId, item.eventIds[0]);
    for (const item of result.plan.filter(row => row.action === 'link_batch_duplicate')) resolved.set(item.historyId, resolved.get(item.representativeHistoryId));
    for (const [historyId, eventId] of resolved) {
      if (!eventId) throw new Error('Unresolved batch representative');
      const item = result.plan.find(row => row.historyId === historyId);
      const linked = await client.query(`INSERT INTO public.calendar_history_event_ref
        (history_node_id,calendar_event_id,import_run_id,match_method) VALUES($1,$2,$3,$4)
        ON CONFLICT(history_node_id) DO NOTHING RETURNING *`, [historyId,eventId,runId,item.action]);
      report.referencesAdded.push(...linked.rows);
    }
    // Backfill only unambiguous, known legacy provenance, never invent manual labels.
    const sourceMap = { historical_migration: 'history_migrate', ai_supplement: 'ai_recommend', manual: 'user_add', pasted_text: 'user_paste' };
    for (const event of events) {
      const candidate = candidates.find(row => row.id === event.source_candidate_id);
      const type = candidate?.source_type || (event.source_name?.startsWith('candidate:') ? event.source_name.slice(10) : null);
      if (!sourceMap[type] || event.source_type != null) continue;
      const changed = await client.query('UPDATE public.calendar_event SET source_type=$2,source=COALESCE(source,$3) WHERE id=$1 AND source_type IS NULL RETURNING source,source_type', [event.id,type,sourceMap[type]]);
      if (changed.rowCount) report.sourceChanges.push({ id:event.id, before:{source:event.source ?? null,source_type:event.source_type ?? null}, after:changed.rows[0] });
    }
    snapshot('events-after', (await client.query('SELECT * FROM public.calendar_event ORDER BY id')).rows);
    report.dataCommitAttempted = true; save(); // Journal exists before COMMIT, including assigned IDs.
    await client.query('COMMIT'); transaction = false; report.dataCommitted = true; report.status = 'PASS'; save();
  }
} catch (error) {
  if (transaction) await client.query('ROLLBACK').catch(() => {});
  // Do not log connection strings or pg errors that may contain credentials.
  report.status = report.dataCommitAttempted ? 'COMMIT_STATUS_UNCERTAIN' : 'FAIL';
  report.error = connectionString && String(error.message).includes(connectionString) ? 'SQL connection failed' : error.message;
  save(); process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
console.log(JSON.stringify({ run_id:runId,status:report.status,schemaApplied:report.schemaApplied,dataCommitted:report.dataCommitted,
  inserted:report.inserted.length,referencesAdded:report.referencesAdded.length,held:report.held.length,
  error:report.error,manifest:path.join(folder,'manifest.json') }));
