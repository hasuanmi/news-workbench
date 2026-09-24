import { Lunar, Solar } from "lunar-typescript";

export const CALENDAR_SOURCE_LABELS: Record<string, string> = {
  history_migrate: "历史迁移", historical_migration: "历史迁移",
  ai_recommend: "AI推荐", ai_supplement: "AI推荐",
  user_add: "用户新增", manual: "用户新增",
  user_paste: "用户粘贴识别", pasted_text: "用户粘贴识别",
};

export function calendarSourceLabel(source?: string | null, sourceType?: string | null) {
  return CALENDAR_SOURCE_LABELS[source ?? ""] ?? CALENDAR_SOURCE_LABELS[sourceType ?? ""] ?? "来源待补全";
}

export function calendarToday(now = new Date()): Date {
  return new Date(`${new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)}T00:00:00Z`);
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 时间未定不等于事件未明：仅拒绝占位名，不拒绝“元旦”等明确短名称。 */
export function isVagueName(name: string): boolean {
  const n = name.trim().replace(/\s/g, "").replace(/^[0-9]{4}年/, "").replace(/（(?:时间|日期)?(?:待定|未定|待确定)）|\((?:时间|日期)?(?:待定|未定|待确定)\)/g, "");
  if (!n || /某|待补全|待补充|待确认事项|未知事件|未知事项/.test(n)) return true;
  if (/^[\d一二三四五六七八九十冬腊]+月(?:[\d一二三四五六七八九十廿三十]+[日号])?$/.test(n) || /^\d{1,4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?$/.test(n)) return true;
  const stripped = n.replace(/（(?:时间|日期)?待定）|\((?:时间|日期)?待定\)/g, "");
  return /^(?:(?:全国|中国|广东省?|广州市?|本地|国内|国际|有关|相关|重要|重大|重点|年度|行业|新|一项|一场)\s*)*(?:会议|活动|政策|政策发布|政策出台|发布会|节点|论坛|展览|赛事|事项|事宜|相关|有关|待定|暂无|未定|暂未公布)$/.test(stripped);
}

export function calendarNameIssue(name: string): string | null {
  if (!isVagueName(name)) return null;
  return /月|^\d{1,4}[-/.]/.test(name) && !/某|政策|会议|活动/.test(name)
    ? "仅有月份或日期，缺少具体事件名称；暂缓展示"
    : "名称为模糊占位，尚无具体事件依据；暂缓展示";
}

export interface RecurringInput {
  event_name: string;
  event_type: "fixed" | "dynamic";
  original_date?: string | null;
  event_date?: string | null;
  event_year?: number | null;
  anniversary_base_year?: number | null;
}

// 只推导明确的年度日历规则；不推导“假期”、会议届次、政策或活动的下一届日期。
const SOLAR_DAYS: Record<string, string> = {
  元旦: "01-01", 国际妇女节: "03-08", 植树节: "03-12", 全民国家安全教育日: "04-15",
  国际劳动节: "05-01", 劳动节: "05-01", 五四青年节: "05-04", 青年节: "05-04",
  国际儿童节: "06-01", 儿童节: "06-01", 建党节: "07-01", 建军节: "08-01",
  教师节: "09-10", 烈士纪念日: "09-30", 国庆节: "10-01", 国家宪法日: "12-04",
};
const LUNAR_DAYS: Record<string, [number, number]> = {
  春节: [1, 1], 元宵节: [1, 15], 端午节: [5, 5], 七夕节: [7, 7], 中秋节: [8, 15], 重阳节: [9, 9],
};

function anniversaryCount(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0, digit = 0;
  for (const char of value) {
    if (char in units) { total += (digit || 1) * units[char]; digit = 0; }
    else digit = digits[char];
  }
  return total + digit;
}

export function recurringOccurrence(event: RecurringInput, year: number): { date: string; baseYear: number | null } | null {
  const name = event.event_name.trim().replace(/^\d{4}年/, "");
  const reference = event.original_date || event.event_date;
  if (reference && isValidCalendarDate(reference) && year < Number(reference.slice(0, 4))) return null;
  if (/假期|调休|放假安排/.test(name)) return null;
  const anniversary = name.match(/(?:第)?(\d{1,4}|[零〇一二两三四五六七八九十百千]+)\s*周年/);
  let baseYear = event.event_year ?? event.anniversary_base_year ?? null;
  if (anniversary && reference && isValidCalendarDate(reference)) {
    baseYear ??= Number(reference.slice(0, 4)) - anniversaryCount(anniversary[1]);
  }
  let date: string | null = null;
  if (LUNAR_DAYS[name]) {
    const [month, day] = LUNAR_DAYS[name];
    date = Lunar.fromYmd(year, month, day).getSolar().toYmd();
  } else if (name === "清明节" || name === "中国农民丰收节") {
    date = Solar.fromYmd(year, 6, 1).getLunar().getJieQiTable()[name === "清明节" ? "清明" : "秋分"]?.toYmd() ?? null;
  } else if (SOLAR_DAYS[name]) {
    date = `${year}-${SOLAR_DAYS[name]}`;
  } else if ((event.event_type === "fixed" || anniversary || baseYear != null) && reference && isValidCalendarDate(reference)) {
    date = `${year}-${reference.slice(5)}`;
  }
  if (!date || !isValidCalendarDate(date) || (baseYear != null && year < baseYear)) return null;
  return { date, baseYear };
}
