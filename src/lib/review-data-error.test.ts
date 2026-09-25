import test from "node:test";
import assert from "node:assert/strict";
import { ReviewDataError, parseReviewConfig, reviewErrorResponse } from "./review-data-error";

test("不存在的配置可用默认值，JSON 损坏不能静默当成默认值", () => {
  const fallback = { min_word_count: 2000 };
  assert.equal(parseReviewConfig("review.selection_rules", undefined, fallback), fallback);
  assert.deepEqual(parseReviewConfig("review.selection_rules", '{"min_word_count":3000}', fallback), { min_word_count: 3000 });
  assert.throws(() => parseReviewConfig("review.selection_rules", "{broken", fallback),
    (error: unknown) => error instanceof ReviewDataError && error.databaseError.code === "INVALID_CONFIG_JSON");
});

test("连接错误保留服务端原因，客户端有查询字段但不包含堆栈", () => {
  const cause = { message: "TypeError: fetch failed", details: "Caused by: read ECONNRESET", code: "" };
  const error = new ReviewDataError("读取评报规则", "app_config.value (review.selection_rules)", cause);
  assert.equal(error.cause, cause);
  assert.match(error.stack ?? "", /ReviewDataError/);
  assert.deepEqual(reviewErrorResponse(error), {
    error: "读取评报规则失败 [app_config.value (review.selection_rules)]：TypeError: fetch failed",
    operation: "读取评报规则", fields: "app_config.value (review.selection_rules)", code: "ECONNRESET",
  });
});
