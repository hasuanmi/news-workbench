// Read-only REST audit. No SQL, data writes, credentials, or user records are emitted.
import fs from 'node:fs';
import dotenv from 'dotenv';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as localSchema from '../src/storage/database/shared/schema.ts';

const mode = process.env.NODE_ENV || 'development';
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
}
const env = (key) => process.env[key] || process.env[`COZE_${key}`];
const base = env('SUPABASE_URL');
const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY');
if (!base || !key) throw new Error('Supabase configuration missing');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function read(path, extra = {}) {
  const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    headers: { ...headers, ...extra }, signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  return { status: res.status, range: res.headers.get('content-range'), json };
}
const report = {
  checkedAt: new Date().toISOString(), databaseHost: new URL(base).hostname,
  identity: 'remote; production/test ownership requires confirmation',
  tables: {}, calendar: {},
};
try {
  const schema = await read('');
  report.restSchemaStatus = schema.status;
  const definitions = schema.json.definitions || schema.json.components?.schemas || {};
  for (const table of Object.values(localSchema)) {
    const config = getTableConfig(table);
    const name = config.name;
    const primary = config.columns.find(column => column.primary) || config.columns[0];
    const result = await read(`${name}?select=${primary.name}&limit=1`, { Prefer: 'count=exact' });
    const columns = Object.keys(definitions[name]?.properties || {});
    report.tables[name] = {
      status: result.status, count: result.range?.split('/')[1] ?? null,
      error: result.status >= 400 ? { code: result.json.code, message: result.json.message } : null,
      columns,
      missingColumns: config.columns.filter(column => !columns.includes(column.name)).map(column => ({
        name: column.name, type: column.getSQLType(), notNull: column.notNull,
      })),
    };
  }
  const events = [];
  for (let offset = 0; ; offset += 500) {
    const result = await read(`calendar_event?select=*&order=id&limit=500&offset=${offset}`);
    if (result.status >= 400) { report.calendar.error = result.json.message; break; }
    events.push(...result.json);
    if (result.json.length < 500) break;
  }
  const tally = (field) => events.reduce((acc, row) => {
    const value = String(row[field] ?? 'null'); acc[value] = (acc[value] || 0) + 1; return acc;
  }, {});
  report.calendar = {
    ...report.calendar, rowsRead: events.length,
    visible: events.filter(e => e.deleted_at == null && e.enabled === true).length,
    eventTypes: tally('event_type'), reviewStatus: tally('review_status'),
    source: tally('source'), dateStatus: tally('date_status'),
    eventYears: tally('event_year'),
    dateYears: events.reduce((acc, e) => {
      const year = String(e.event_date || e.original_date || 'none').slice(0, 4);
      acc[year] = (acc[year] || 0) + 1; return acc;
    }, {}),
  };
  const window = await read('app_config?select=key,value&key=eq.calendar.window_days');
  report.calendar.window = window.status === 200 ? window.json : { status: window.status };
  const configKeys = await read('app_config?select=key&order=key');
  report.configKeys = configKeys.status < 400 ? configKeys.json.map(row => row.key) : [];
  for (const table of ['calendar_history_node', 'calendar_candidate']) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const result = await read(`${table}?select=*&order=id&limit=500&offset=${offset}`);
      if (result.status >= 400) break;
      rows.push(...result.json);
      if (result.json.length < 500) break;
    }
    const field = table === 'calendar_candidate' ? 'review_status' : 'year';
    report.calendar[table] = {
      count: rows.length,
      groups: rows.reduce((acc, row) => { const value = String(row[field]); acc[value] = (acc[value] || 0) + 1; return acc; }, {}),
    };
    fs.writeFileSync(`logs/takeover-baseline/${table}-readonly.json`, JSON.stringify(rows, null, 2));
  }
  fs.mkdirSync('logs/takeover-baseline', { recursive: true });
  fs.writeFileSync('logs/takeover-baseline/calendar-readonly.json', JSON.stringify(events, null, 2));
} catch (error) {
  report.connectionError = { name: error.name, code: error.cause?.code, message: error.message };
  process.exitCode = 1;
}
fs.mkdirSync('logs/takeover-baseline', { recursive: true });
fs.writeFileSync('logs/takeover-baseline/db-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
