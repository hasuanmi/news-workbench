import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOccurrence,
  buildCalendar,
  routeByConfidence,
  isKeyReportCandidate,
  type CalendarRuleEvent,
} from "./calendar-engine";

const today = new Date(Date.UTC(2026, 8, 6)); // 2026-09-06

test("固定节点：始终按选定年份计算，不把已过日期滚到下一年", () => {
  const ev: CalendarRuleEvent = {
    id: "1",
    event_name: "香港回归",
    event_type: "fixed",
    original_date: "1997-07-01",
    anniversary_base_year: 1997,
  };
  const occ = computeOccurrence(ev, 2026, today);
  assert.ok(occ);
  assert.equal(occ.date, "2026-07-01");
  assert.equal(occ.anniversary, 29);
  assert.ok(occ.daysUntil < 0);
});

test("固定节点：event_year 动态计算周年数", () => {
  const ev: CalendarRuleEvent = {
    id: "yy1",
    event_name: "毛泽东诞辰",
    event_type: "fixed",
    original_date: "1893-12-26",
    event_year: 1893,
  };
  const occ = computeOccurrence(ev, 2026, new Date(Date.UTC(2026, 4, 1)));
  assert.ok(occ);
  assert.equal(occ.anniversary, 133); // 2026-1893
  assert.equal(occ.date, "2026-12-26");
});

test("固定节点：跨年窗口能命中明年1月的节点", () => {
  const ev: CalendarRuleEvent = {
    id: "2",
    event_name: "元旦",
    event_type: "fixed",
    original_date: "1949-01-01",
    anniversary_base_year: 1949,
    enabled: true,
    review_status: "approved",
    importance: "S",
  };
  // 9 月窗口不命中元旦
  const result = buildCalendar([ev], today, "next14", 14);
  assert.equal(result.length, 0);
  // 12-25 的 14 天窗口跨年命中 2027-01-01
  const dec = new Date(Date.UTC(2026, 11, 25)); // 2026-12-25
  const resultDec = buildCalendar([ev], dec, "next14", 14);
  assert.equal(resultDec.length, 1);
  assert.equal(resultDec[0].date, "2027-01-01");
  assert.equal(resultDec[0].anniversary, 78);
});

test("buildCalendar：未来14天窗口 + 已过节点不出现", () => {
  const events: CalendarRuleEvent[] = [
    { id: "a", event_name: "未来节点", event_type: "fixed", original_date: "2000-09-10", anniversary_base_year: 2000, enabled: true, review_status: "approved" },
    { id: "b", event_name: "已过节点", event_type: "fixed", original_date: "2000-09-01", anniversary_base_year: 2000, enabled: true, review_status: "approved" },
    { id: "c", event_name: "未启用", event_type: "fixed", original_date: "2000-09-10", anniversary_base_year: 2000, enabled: false, review_status: "approved" },
    { id: "d", event_name: "待审核", event_type: "fixed", original_date: "2000-09-10", anniversary_base_year: 2000, enabled: true, review_status: "pending" },
  ];
  const result = buildCalendar(events, today, "next14", 14);
  const names = result.map((o) => o.event.event_name);
  assert.ok(names.includes("未来节点"));
  assert.ok(!names.includes("已过节点"));
  assert.ok(!names.includes("未启用"));
  assert.ok(names.includes("待审核"));
});

test("旧审核状态不影响展示；停用、软删除和未启用节点不展示", () => {
  const events: CalendarRuleEvent[] = ["pending", "approved", "rejected", "confirmed"].map(status => ({
    id: status, event_name: status, event_type: "dynamic", event_date: "2026-09-10",
    enabled: true, review_status: status,
  }));
  events.push({ ...events[0], id: "deleted", deleted_at: "2026-09-01T00:00:00Z" });
  events.push({ ...events[0], id: "disabled", enabled: false });
  events.push({ ...events[0], id: "unset", enabled: undefined });
  events.push({ ...events[0], id: "undated", date_status: "unknown" });
  assert.deepEqual(buildCalendar(events, today, "month", 30).map(item => item.event.id),
    ["pending", "approved", "rejected", "confirmed"]);
});

test("30天视图：不受默认14天窗口影响，包含第30天且排除第31天", () => {
  const start = new Date(Date.UTC(2026, 8, 17));
  const events: CalendarRuleEvent[] = [
    { id: "day15", event_name: "第15天", event_type: "dynamic", event_date: "2026-10-02", enabled: true, review_status: "approved" },
    { id: "day30", event_name: "第30天", event_type: "dynamic", event_date: "2026-10-17", enabled: true, review_status: "approved" },
    { id: "day31", event_name: "第31天", event_type: "dynamic", event_date: "2026-10-18", enabled: true, review_status: "approved" },
  ];
  assert.deepEqual(buildCalendar(events, start, "month", 14).map(item => item.event.id), ["day15", "day30"]);
  assert.equal(buildCalendar(events, start, "next14", 14).length, 0);
});

test("动态节点：只在其实际日期年份出现", () => {
  const ev: CalendarRuleEvent = {
    id: "e",
    event_name: "广交会",
    event_type: "dynamic",
    event_date: "2026-10-15",
    enabled: true,
    review_status: "approved",
  };
  // 30 天窗口：09-06 → 10-05，10-15 不在窗口
  assert.equal(buildCalendar([ev], today, "month", 30).length, 0);
  // 全部视图：动态节点按自身日期出现
  const inAll = buildCalendar([ev], today, "all", 14);
  assert.equal(inAll.length, 1);
  assert.equal(inAll[0].date, "2026-10-15");
  assert.equal(inAll[0].anniversary, null);
});

test("排序：同日期按重要度 S>A>B", () => {
  const events: CalendarRuleEvent[] = [
    { id: "b", event_name: "B级", event_type: "fixed", original_date: "2000-09-10", anniversary_base_year: 2000, enabled: true, review_status: "approved", importance: "B" },
    { id: "s", event_name: "S级", event_type: "fixed", original_date: "2000-09-10", anniversary_base_year: 2000, enabled: true, review_status: "approved", importance: "S" },
    { id: "a", event_name: "A级", event_type: "fixed", original_date: "2000-09-10", anniversary_base_year: 2000, enabled: true, review_status: "approved", importance: "A" },
  ];
  const result = buildCalendar(events, today, "next14", 14);
  assert.deepEqual(result.map((o) => o.event.importance), ["S", "A", "B"]);
});

test("置信度路由：阈值边界正确", () => {
  const t = { auto: 0.85, review: 0.6 };
  assert.equal(routeByConfidence(0.9, t), "auto");
  assert.equal(routeByConfidence(0.85, t), "auto");
  assert.equal(routeByConfidence(0.7, t), "review");
  assert.equal(routeByConfidence(0.6, t), "review");
  assert.equal(routeByConfidence(0.5, t), "discard");
});

test("重点稿候选：字数与版面信号", () => {
  const r1 = isKeyReportCandidate({ word_count: 2500, wordThreshold: 2000 });
  assert.equal(r1.hit, true);
  assert.ok(r1.reasons[0].includes("2000"));
  const r2 = isKeyReportCandidate({ word_count: 800, is_cross_page: true, wordThreshold: 2000 });
  assert.equal(r2.hit, true);
  assert.ok(r2.reasons.includes("跨版报道"));
  const r3 = isKeyReportCandidate({ word_count: 500, wordThreshold: 2000 });
  assert.equal(r3.hit, false);
});
