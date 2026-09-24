import { test } from "node:test";
import assert from "node:assert/strict";
import { Solar } from "lunar-typescript";
import AdmZip from "adm-zip";
import { extractRows } from "./calendar-history";
import { buildCalendar, computeOccurrence, type CalendarRuleEvent } from "./calendar-engine";
import { calendarToday, isVagueName, isValidCalendarDate, recurringOccurrence } from "./calendar-policy";
import { migrateHistoryNodeToCandidate, type HistoryNodeLike } from "./calendar-candidate";
import { recommendationWindow } from "./calendar-auto";

const today = new Date("2026-09-23T00:00:00Z");
const event = (id: string, date: string, name = id): CalendarRuleEvent => ({ id, event_name: name, event_type: "dynamic", event_date: date, enabled: true });

test("Word 月份标题不是事件行，保留其下明确事件和待定事项", () => {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(`<w:document><w:body>${["10月", "10月15日 秋季广交会", "11月", "11月广州国际车展（时间待定）", "2026年12月", "12月1日 广州日报社庆"].map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`));
  assert.deepEqual(extractRows(zip.toBuffer(), "docx").map(row => row.raw), ["10月15日 秋季广交会", "11月广州国际车展（时间待定）", "12月1日 广州日报社庆"]);
});

test("全年按日期展示已过及未来节点，动态事件不串年", () => {
  const rows = [event("年末会议", "2026-12-10"), event("年初会议", "2026-01-10"), event("旧年会议", "2025-11-01"), event("次年会议", "2027-02-01")];
  assert.deepEqual(buildCalendar(rows, today, "year", 14, 2026).map(o => o.event.id), ["年初会议", "年末会议"]);
  assert.deepEqual(buildCalendar(rows, today, "year", 14, 2025).map(o => o.event.id), ["旧年会议"]);
  assert.deepEqual(buildCalendar(rows, today, "year", 14, 2027).map(o => o.event.id), ["次年会议"]);
});

test("跨年预览只推导明确年度节点，不复制会议届次和假期", () => {
  const rows = [event("交易会", "2026-10-15", "第140届中国进出口商品交易会"), event("假期", "2026-09-25", "中秋节假期"), event("节日", "2026-01-01", "元旦"), event("周年", "2026-07-01", "香港回归29周年")];
  const next = buildCalendar(rows, today, "year", 14, 2027);
  assert.deepEqual(next.map(o => o.event.id), ["节日", "周年"]);
  assert.equal(next[1].anniversary, 30);
  assert.equal(next[1].date, "2027-07-01");
});

test("农历与节气按目标年度重算，不平移公历日期", () => {
  const midAutumn = event("中秋节", "2026-09-25");
  const next = computeOccurrence(midAutumn, 2027, today)!;
  assert.notEqual(next.date.slice(5), midAutumn.event_date!.slice(5));
  const [year, month, day] = next.date.split("-").map(Number);
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  assert.equal(lunar.getMonth(), 8); assert.equal(lunar.getDay(), 15);
  assert.ok(recurringOccurrence(event("清明节", "2026-04-05"), 2027));
});

test("中文周年数可推导下一年度，不保留过时周年数", () => {
  assert.equal(computeOccurrence(event("脱贫", "2026-02-25", "脱贫攻坚取得全面胜利五周年"), 2027, today)?.anniversary, 6);
  assert.equal(computeOccurrence(event("封关", "2026-12-18", "海南自贸港全岛封关运作一周年"), 2027, today)?.anniversary, 2);
  assert.equal(computeOccurrence({ ...event("香港回归", "2027-07-01"), event_year: 1997 }, 2028, today)?.anniversary, 31);
});

test("旧迁移的无依据跨年记录不进入全年底图和首页摘要", () => {
  const invalid: CalendarRuleEvent = { ...event("元旦假期", "2027-01-01"), information_status: "needs_completion" };
  assert.deepEqual(buildCalendar([invalid], today, "year", 14, 2027), []);
  assert.deepEqual(buildCalendar([invalid], new Date("2026-12-25T00:00:00Z"), "next30", 14), []);
});

test("闰日不溢出为3月1日，非法日期不进入日历", () => {
  const leap: CalendarRuleEvent = { id: "leap", event_name: "闰日纪念", event_type: "fixed", original_date: "2024-02-29", enabled: true };
  assert.equal(computeOccurrence(leap, 2027, today), null);
  assert.equal(computeOccurrence(leap, 2028, today)?.date, "2028-02-29");
  assert.equal(isValidCalendarDate("2026-02-30"), false);
});

test("不向过往年份倒灌后来的记录，不逐年复制假期安排", () => {
  assert.equal(computeOccurrence(event("周年", "2026-07-01", "香港回归29周年"), 2025, today), null);
  const holiday: CalendarRuleEvent = { id: "holiday", event_name: "元旦假期", event_type: "fixed", original_date: "2026-01-01", enabled: true };
  assert.equal(computeOccurrence(holiday, 2026, today)?.date, "2026-01-01");
  assert.equal(computeOccurrence(holiday, 2027, today), null);
});

test("模糊事件不入正式日历，明确短名称和时间待定名称可保留", () => {
  for (const name of ["某重要会议", "某政策发布", "相关活动", "广东重要会议", "相关政策发布", "信息待补全", "10月", "十一月", "2026年12月", "12月（时间待定）", "相关", "重要活动", "重大政策"]) {
    assert.equal(isVagueName(name), true, name);
    assert.equal(buildCalendar([event(name, "2026-10-01")], today, "year", 14).length, 0);
  }
  assert.equal(isVagueName("元旦"), false);
  assert.equal(isVagueName("广州国际车展（时间待定）"), false);
});

test("历史迁移只跨年生成可推导节点，不平移具体会议或待定事项", () => {
  const history: HistoryNodeLike = { id: "h", year: 2025, node_name: "第138届中国进出口商品交易会", event_date: "2025-10-15", candidate_month: null, date_status: "confirmed", category_id: null, region: "national", importance: "A", description: null, raw_text: null, enabled: true };
  assert.equal(migrateHistoryNodeToCandidate(history, 2027), null);
  assert.equal(migrateHistoryNodeToCandidate(history, 2025)?.candidate_date, "2025-10-15");
  assert.equal(migrateHistoryNodeToCandidate({ ...history, node_name: "元旦", event_date: "2025-01-01" }, 2027)?.candidate_date, "2027-01-01");
  assert.equal(migrateHistoryNodeToCandidate({ ...history, date_status: "unknown", event_date: null }, 2027), null);
});

test("推荐窗口不跨出当前年，并使用中国日期处理跨年午夜", () => {
  assert.deepEqual(recommendationWindow(new Date("2026-12-20T10:00:00Z")), { start: "2026-12-20", end: "2026-12-31" });
  assert.equal(calendarToday(new Date("2026-12-31T16:01:00Z")).getUTCFullYear(), 2027);
});
