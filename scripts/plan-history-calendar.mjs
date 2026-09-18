// Offline, read-only dry run. Reads existing audit snapshots; never connects to a database.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const normalize = name => String(name ?? '').normalize('NFKC').toLowerCase()
  .replace(/[第]?\d{1,4}\s*周年/g, '').replace(/[\s\p{P}]/gu, '');
const key = row => JSON.stringify([normalize(row.node_name), row.date_status,
  row.date_status === 'confirmed' ? row.event_date : row.date_status === 'month_known' ? [row.year, row.candidate_month] : row.year,
  row.region ?? 'national', row.category_id ?? null]);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function planHistoryImport(histories, events, candidates, references = [], today = '2026-09-17') {
const byCandidate = new Map(candidates.map(row => [row.id, row]));
const byReference = new Map(references.map(row => [row.history_node_id, row.calendar_event_id]));
const groups = new Map();
const undatedCounts = new Map();
for (const row of histories.filter(row => row.enabled === true && row.date_status === 'unknown')) {
  undatedCounts.set(key(row), (undatedCounts.get(key(row)) ?? 0) + 1);
}
const plan = [];
for (const row of [...histories].sort((a, b) => a.id.localeCompare(b.id))) {
  if (row.enabled !== true) { plan.push({ historyId: row.id, action: 'skip_disabled' }); continue; }
  if (!String(row.node_name ?? '').trim() ||
      !['confirmed', 'month_known', 'unknown'].includes(row.date_status) ||
      (row.date_status === 'confirmed' && !validDate(row.event_date)) ||
      (row.date_status === 'month_known' && !(row.candidate_month >= 1 && row.candidate_month <= 12))) {
    plan.push({ historyId: row.id, action: 'hold_invalid' }); continue;
  }
  const linked = events.filter(event => byReference.get(row.id) === event.id || event.source_name === `history_node:${row.id}` ||
    byCandidate.get(event.source_candidate_id)?.source_detail === `history_node:${row.id}`);
  if (byReference.has(row.id) && !events.some(event => event.id === byReference.get(row.id))) {
    plan.push({ historyId: row.id, action: 'hold_dangling_reference' }); continue;
  }
  // A strong reference takes precedence, even if the existing date was changed by the user.
  if (linked.length) {
    plan.push({ historyId: row.id, name: row.node_name, date: row.event_date,
      action: linked.length === 1 ? 'link_existing_reference' : 'hold_ambiguous_reference', eventIds: linked.map(e => e.id) });
    continue;
  }
  const exact = events.filter(event => {
    if (normalize(event.event_name) !== normalize(row.node_name) || event.region !== (row.region ?? 'national') ||
        (event.category_id ?? null) !== (row.category_id ?? null) || event.date_status !== row.date_status) return false;
    if (row.date_status !== 'confirmed') return false; // Existing undated rows need an explicit year reference.
    return event.event_type === 'fixed' ? event.original_date?.slice(5) === row.event_date.slice(5) : event.event_date === row.event_date;
  });
  if (exact.length) {
    plan.push({ historyId: row.id, name: row.node_name, date: row.event_date,
      action: exact.length === 1 ? 'link_existing_exact' : 'hold_ambiguous_exact', eventIds: exact.map(e => e.id) });
    continue;
  }
  const signature = key(row);
  if (row.date_status === 'unknown' && undatedCounts.get(signature) > 1) {
    plan.push({ historyId: row.id, name: row.node_name, date: row.event_date, action: 'hold_ambiguous_undated' });
    continue;
  }
  if (groups.has(signature)) {
    plan.push({ historyId: row.id, name: row.node_name, date: row.event_date, action: 'link_batch_duplicate', representativeHistoryId: groups.get(signature) });
  } else {
    groups.set(signature, row.id);
    plan.push({ historyId: row.id, name: row.node_name, date: row.event_date, action: 'insert', dateStatus: row.date_status });
  }
}
const counts = {};
for (const row of plan) counts[row.action] = (counts[row.action] ?? 0) + 1;
const until = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
const window = plan.filter(row => row.action === 'insert' && row.date >= today && row.date <= until);
const summary = { snapshotDate: today, historyRows: histories.length, existingEvents: events.length, counts,
  proposedNewEventsInCurrent30Days: window.length,
  newDateStatuses: plan.filter(row => row.action === 'insert').reduce((out, row) => { out[row.dateStatus] = (out[row.dateStatus] ?? 0) + 1; return out; }, {}),
  linkedOrHeld: plan.filter(row => row.action !== 'insert') };
return { summary, plan };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = 'logs/takeover-baseline';
  const read = name => JSON.parse(fs.readFileSync(`${dir}/${name}-readonly.json`, 'utf8'));
  const result = planHistoryImport(read('calendar_history_node'), read('calendar'), read('calendar_candidate'));
  fs.writeFileSync(`${dir}/history-calendar-plan.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.summary, null, 2));
}
