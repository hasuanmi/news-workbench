import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const fields = ['source_id', 'media_id', 'source_url', 'source_type', 'crawl_method'];
export function sourceSnapshot(src) {
  return {
    source_id: src.source_id ?? src.sourceId,
    media_id: src.media_id ?? src.mediaId,
    media_name: src.media_name ?? src.mediaName,
    source_url: src.source_url ?? src.sourceUrl ?? null,
    source_type: src.source_type ?? src.sourceType,
    crawl_method: src.crawl_method ?? src.crawlMethod,
  };
}

export function reportMatchesSource(report, source, runId, attemptId) {
  return report?.run_id === runId && report.attempt_id === attemptId &&
    fields.every(key => report[key] === source[key]);
}

/** Each source owns its attempts and result; media names are never identity. */
export async function runSource({source: input, runId, scraper, python, env,
  folder, timeoutMs = 600000, limit = 10, onAttempt = () => {}}) {
  const source = sourceSnapshot(input);
  if (!/^[a-zA-Z0-9-]+$/.test(source.source_id ?? '')) throw new Error('Invalid source_id');
  const attempts = [];
  let result;
  for (let attemptNo = 1; attemptNo <= 3; attemptNo++) {
    const attemptId = randomUUID();
    const stem = `${runId}-${source.source_id}-${attemptId}`;
    const reportPath = path.join(scraper, 'logs/real-poc', `${stem}.json`);
    const logPath = path.join(folder, `${stem}.log`);
    fs.mkdirSync(folder, {recursive: true});
    const log = fs.openSync(logPath, 'a');
    let exit;
    try {
      exit = await new Promise(resolve => {
        const child = spawn(python, ['poc_ingest_real.py', '--source-stdin', '--run-id', runId,
          '--attempt-id', attemptId, '--report', reportPath, '--limit', String(limit)],
        {cwd: scraper, windowsHide: true, stdio: ['pipe', log, log],
          env: {...env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8'}});
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
        child.on('error', error => { clearTimeout(timer); resolve({code: null, error: error.message}); });
        child.on('close', code => { clearTimeout(timer); resolve({code, error: timedOut ? 'Source worker timeout' : null}); });
        child.stdin.on('error', () => {}); // Failed spawn/early exit is handled above.
        child.stdin.end(JSON.stringify(source));
      });
    } finally { fs.closeSync(log); }
    let report = null;
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch {}
    const matches = reportMatchesSource(report, source, runId, attemptId);
    result = {
      ...source, ok: exit.code === 0 && matches && report.success === true,
      code: exit.code, report: path.basename(reportPath), log: path.basename(logPath),
      articles: matches ? report.successful_bodies ?? 0 : 0,
      ingest: matches ? report.ingest : undefined,
      failures: matches ? report.failures ?? [] : [],
      error_code: matches ? report.error_code : report ? 'source_identity_mismatch' : 'worker_no_report',
      error: exit.error ?? (matches ? report.error : 'Missing or mismatched source report'),
      retryable: matches ? report.retryable === true : !report,
    };
    attempts.push({attempt_id: attemptId, attempt: attemptNo, ...result});
    onAttempt(attempts.at(-1));
    if (result.ok || !result.retryable || attemptNo === 3) break;
    await new Promise(resolve => setTimeout(resolve, 4000 * attemptNo));
  }
  return {...result, attempts};
}
