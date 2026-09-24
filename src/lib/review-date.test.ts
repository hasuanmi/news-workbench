import test from "node:test";
import assert from "node:assert/strict";
import { reviewDate, reviewDayBounds, emptyReviewMessage } from "./review-date";

test("北京时间午夜和日期字符串不会错查前一天", () => {
  assert.equal(reviewDate("2026-09-22T16:00:00.000Z"), "2026-09-23");
  assert.equal(reviewDate("2026-09-23"), "2026-09-23");
  assert.equal(reviewDate("2026-09-23T00:00:00+08:00"), "2026-09-23");
});
test("日期边界为次日零点开区间，覆盖最后一秒的小数部分和跨年", () => {
  assert.deepEqual(reviewDayBounds("2026-12-31"), {
    date: "2026-12-31", start: "2026-12-31T00:00:00+08:00", end: "2027-01-01T00:00:00+08:00",
  });
});
test("拒绝无效日期", () => {
  for (const date of ["2026-02-30", "invalid", ""]) assert.throws(() => reviewDate(date));
});
test("区分当日无入库、媒体范围为空和字数不足", () => {
  assert.match(emptyReviewMessage("2026-09-23", 0, 0, 2000), /尚无已入库/);
  assert.match(emptyReviewMessage("2026-09-23", 151, 0, 2000), /媒体范围内为 0/);
  assert.match(emptyReviewMessage("2026-09-23", 151, 62, 2000), /62 篇.*2000 字/);
});
