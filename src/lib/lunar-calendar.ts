// 农历/节气/节日辅助计算（仅做日历展示辅助信息，不进入新闻节点数据库）
// 基于 lunar-typescript（无第三方依赖，纯本地计算）

import { Solar } from "lunar-typescript";

export interface DayExtras {
  lunar: string; // 农历日期，如 "初二"
  solarTerm?: string; // 节气名，如 "秋分"
  festivals: string[]; // 节日（公历节日 + 农历节日去重后），如 ["国庆节","中秋节"]
}

export interface MonthDayInfo {
  date: string; // YYYY-MM-DD
  extra: DayExtras;
}

/**
 * 计算某个公历年月（1..12）每一天的农历/节气/节日信息。
 * 返回该月全部天数的数组（从 1 到当月天数）。
 */
export function getMonthExtras(year: number, month: number): MonthDayInfo[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: MonthDayInfo[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    result.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      extra: getDayExtras(year, month, day),
    });
  }
  return result;
}

/** 计算单个公历日的农历/节气/节日辅助信息 */
export function getDayExtras(year: number, month: number, day: number): DayExtras {
  const solar = getSolarOrNull(year, month, day);
  if (!solar) {
    return { lunar: "", festivals: [] };
  }
  const lunar = solar.getLunar();
  const solarTerm = lunar.getJieQi() || undefined;
  const festivals = solar.getFestivals().concat(lunar.getFestivals());
  // 去重保序
  const seen = new Set<string>();
  const uniq = festivals.filter((f) => {
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
  return {
    lunar: lunar.getDayInChinese(),
    solarTerm,
    festivals: uniq,
  };
}

function getSolarOrNull(year: number, month: number, day: number) {
  try {
    return Solar.fromYmd(year, month, day);
  } catch {
    return null;
  }
}