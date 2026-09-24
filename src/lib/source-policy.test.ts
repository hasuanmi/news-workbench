import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSourceUrl, sourceCanRun, summarizeSourceActivity } from "./source-policy";

test("only active/enabled supported sources are runnable", () => {
  const base = { source_status: "active", enabled: true, source_type: "website", crawl_method: "html" };
  assert.equal(sourceCanRun(base), true);
  for (const status of ["duplicate", "needs_fix", "manual_disabled", "", "ok"]) assert.equal(sourceCanRun({ ...base, source_status: status }), false);
  assert.equal(sourceCanRun({ ...base, enabled: false }), false);
  assert.equal(sourceCanRun({ ...base, crawl_method: "manual" }), false);
  assert.equal(sourceCanRun({ ...base, source_type: "epaper", crawl_method: "epaper" }), true);
});
test("daily participation uses Beijing day, deduplicates retries/runs, ignores old and unstarted sources", () => {
  const step = { name: "media_fetch", source_status: "active", source_id: "a", started_at: "2026-09-23T17:00:00Z" };
  const run = { source_policy_version: 1, job: "media_then_clues", steps: [step, step, { ...step, source_id: "b" }] };
  const result = summarizeSourceActivity([run, run,
    { ...run, source_policy_version: undefined, steps: [{ ...step, source_id: "old" }] },
    { ...run, steps: [{ ...step, source_id: "disabled", source_status: "needs_fix" }, { ...step, source_id: "planned", started_at: undefined }] },
  ], new Date("2026-09-24T09:00:00Z"));
  assert.deepEqual(result, [{ date: "2026-09-24", actualSources: 2 }]);
});
test("canonical URLs keep semantic differences", () => {
  assert.equal(normalizeSourceUrl(" https://EXAMPLE.com:443 "), "https://example.com/");
  for (const url of ["http://example.com/", "https://www.example.com/", "https://example.com/?a=1", "https://example.com/#/news"]) {
    assert.notEqual(normalizeSourceUrl(url), normalizeSourceUrl("https://example.com/"));
  }
});
