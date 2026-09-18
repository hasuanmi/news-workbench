// Read-only application smoke test. POST is used only for existing-account login.
// Never emits cookies, credentials, full config values, or article bodies.
import fs from 'node:fs';
const base = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);
const password = process.env.AUDIT_PASSWORD;
if (!password) throw new Error('Set AUDIT_PASSWORD for an existing account');
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: process.env.AUDIT_USERNAME || 'admin', password }),
  signal: AbortSignal.timeout(30000),
});
if (!login.ok) throw new Error(`Existing-account login failed (${login.status})`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Login did not return a session cookie');
const paths = [
  '/', '/calendar', '/leads', '/review', '/admin', '/admin/calendar',
  '/admin/categories', '/admin/media', '/admin/leads', '/admin/review',
  '/admin/config', '/admin/scheduler', '/api/auth/me', '/api/home/preview',
  '/api/calendar?view=month', '/api/calendar?view=all', '/api/calendar/categories',
  '/api/leads', '/api/leads?scope=all', '/api/leads/weekly', '/api/review',
  `/api/review/draft?date=${today}`, '/api/medias', '/api/stats',
  '/api/admin/calendar', '/api/admin/calendar/candidates', '/api/admin/calendar/history',
  '/api/admin/media', '/api/admin/leads',
  '/api/admin/config', '/api/admin/scheduler',
];
const results = [];
for (let offset = 0; offset < paths.length; offset += 4) {
  const batch = await Promise.all(paths.slice(offset, offset + 4).map(async path => {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { Cookie: cookie }, redirect: 'manual', signal: AbortSignal.timeout(45000),
      });
      const body = await res.text();
      const row = { path, status: res.status };
      if (res.headers.get('content-type')?.includes('application/json')) {
        const data = JSON.parse(body);
        row.keys = Object.keys(data);
        if (data.error) row.error = String(data.error).slice(0, 240);
        if (typeof data.total === 'number') row.total = data.total;
        for (const field of ['items', 'reviews', 'sources', 'upcoming', 'latest_leads']) {
          if (Array.isArray(data[field])) row[`${field}Count`] = data[field].length;
        }
        if (data.calendar_warning) row.calendarWarning = String(data.calendar_warning);
      } else {
        row.htmlBytes = body.length;
        row.hasNextError = body.includes('__next_error__');
      }
      return row;
    } catch (error) { return { path, error: error.message }; }
  }));
  results.push(...batch);
}
const report = { checkedAt: new Date().toISOString(), base, loginStatus: login.status, results };
fs.mkdirSync('logs/takeover-baseline', { recursive: true });
fs.writeFileSync(`logs/takeover-baseline/http-smoke-${new URL(base).port || 'default'}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (results.some(row => (row.status !== 200 &&
    !(row.path.startsWith('/api/review/draft?') && row.status === 404)) || row.hasNextError)) process.exitCode = 1;
