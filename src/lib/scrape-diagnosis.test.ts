import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseScrapeRun, hasQueueConnectionFailure } from "./scrape-diagnosis";

const run = { status: "failed", phase: "task_switch", started_at: "2026-09-24T01:19:07Z", ended_at: "2026-09-24T01:48:09Z", steps: [{ name: "media_fetch", status: "failed" }] };
test("只采信本次运行时间内的 ingest 连接日志", () => {
  assert.equal(hasQueueConnectionFailure("2026-09-24 09:47:57 | ERROR | [ingest] All connection attempts failed", run), true);
  assert.equal(hasQueueConnectionFailure("\u001b[32m2026-09-24 09:47:57\u001b[0m | ERROR | [ingest] All connection attempts failed", run), true);
  assert.equal(hasQueueConnectionFailure("2026-09-23 09:47:57 | ERROR | [ingest] All connection attempts failed", run), false);
  assert.equal(hasQueueConnectionFailure("2026-09-24 09:47:57 | ERROR | [website] All connection attempts failed", run), false);
});
test("抓取前连接失败不会冒充网站无新闻或 AI 已执行", () => {
  const result = diagnoseScrapeRun(run, true);
  assert.match(result.stage, /队列读取失败.*未进入 AI/);
  assert.equal(result.aiEntered, false);
});
test("抓取后的 AI 失败与采集失败分开", () => {
  const result = diagnoseScrapeRun({ ...run, steps: [{ name: "media_fetch", status: "success" }, { name: "clue_identify", status: "failed" }] });
  assert.equal(result.aiEntered, true);
  assert.match(result.stage, /AI 识别失败/);
});
test("尚在健康检查中的任务不显示失败", () => {
  assert.doesNotMatch(diagnoseScrapeRun({ status: "running", phase: "main_health" }).stage, /失败/);
});
