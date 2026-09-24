// 日历规则引擎：纯函数，确定性逻辑（不含任何 AI 判断）
// 所有窗口天数、周年基准等均为入参，阈值由 app_config 注入
import { isValidCalendarDate, isVagueName, recurringOccurrence } from "./calendar-policy";

export interface CalendarRuleEvent {
  id: string;
  event_name: string;
  event_type: "fixed" | "dynamic";
  original_date?: string | null; // YYYY-MM-DD 固定节点基准日期
  event_date?: string | null; // YYYY-MM-DD 动态节点当期日期
  /** 事件原始发生年份（周年基准）。统一用 event_year；anniversary_base_year 为历史兼容字段 */
  event_year?: number | null;
  /** @deprecated 历史字段，等价 event_year，为兼容保留 */
  anniversary_base_year?: number | null;
  region?: string;
  importance?: string | null;
  category_id?: string | null;
  enabled?: boolean;
  review_status?: string;
  deleted_at?: string | null;
  date_status?: string | null;
  background?: string | null;
  planning_hint?: unknown;
  tags?: unknown;
  source?: string | null;
  category?: unknown;
  calendar_year?: number | null;
  event_month?: number | null;
  source_type?: string | null;
  source_name?: string | null;
  description?: string | null;
  read_only?: boolean;
  information_status?: "complete" | "needs_completion";
}

export interface Occurrence {
  event: CalendarRuleEvent;
  date: string; // 当年发生日 YYYY-MM-DD
  anniversary: number | null; // 周年数（固定节点）
  daysUntil: number; // 距 today 的天数（0=今天，负数=已过）
}

function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function toDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function diffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / 86400000);
}

/**
 * 计算某事件在给定年份的发生日与周年数
 * - fixed：用 original_date 的月日 + 目标年；周年 = 目标年 - 基准年
 * - dynamic：直接用 event_date
 */
export function computeOccurrence(event: CalendarRuleEvent, targetYear: number, today: Date): Occurrence | null {
  const recurring = recurringOccurrence(event, targetYear);
  // 原年度的实际记录优先；跨年预览只使用明确可推导的规则。
  const actualDate = event.event_type === "dynamic" ? event.event_date : event.original_date;
  const recorded = actualDate?.startsWith(`${targetYear}-`) && isValidCalendarDate(actualDate) ? actualDate : null;
  if (recurring && !recorded) {
    const anniversary = recurring.baseYear == null ? null : targetYear - recurring.baseYear;
    return {
      event,
      date: recurring.date,
      anniversary: anniversary != null && anniversary > 0 ? anniversary : null,
      daysUntil: diffDays(today, new Date(`${recurring.date}T00:00:00Z`)),
    };
  }
  // dynamic
  if (!recorded) return null;
  const { y, m, d } = parseDate(recorded);
  return {
    event,
    date: recorded,
    anniversary: recurring?.baseYear != null ? targetYear - recurring.baseYear || null : null,
    daysUntil: diffDays(today, toDate(y, m, d)),
  };
}

export type RangeView = "year" | "next30" | "week" | "next14" | "month" | "all";

/**
 * 生成日历视图：仅返回启用且未软删除的节点，落在窗口内；审核字段仅兼容。
 * 动态节点只在其 event_date 所在年出现；固定节点每年都出现
 */
/**
 * 从事件名称中剥离"X周年"后缀，只保留事件主体名称。
 * 例如"毛泽东诞辰131周年" → "毛泽东诞辰"、"改革开放40周年" → "改革开放"。
 * 仅剥离别在末尾/任意位置紧贴数字+周年的片段，不匹配非周年文本。
 */
export function normalizeEventName(name: string): string {
  const cleaned = name.replace(/第?(?:\d{1,4}|[零〇一二两三四五六七八九十百千]+)\s*周年/g, "").trim();
  return cleaned || name;
}

/**
 * 计算事件在某目标年份的周年数：targetYear - eventYear。
 * 非周年型（无 event_year 且无历史 anniversary_base_year）返回 null。
 * 周年数为 0 或负数（尚未发生或同一年）返回 null。
 */
export function getAnniversaryYears(
  event: Pick<CalendarRuleEvent, "event_year" | "anniversary_base_year">,
  targetYear: number
): number | null {
  const baseYear = event.event_year ?? event.anniversary_base_year ?? null;
  if (baseYear == null) return null;
  const years = targetYear - baseYear;
  return years > 0 ? years : null;
}

export function buildCalendar(
  events: CalendarRuleEvent[],
  today: Date,
  view: RangeView,
  horizonDays: number,
  selectedYear = today.getUTCFullYear(),
): Occurrence[] {
  const horizon =
    view === "week" ? 7 : view === "month" || view === "next30" ? 30 : horizonDays;
  const targetYear = today.getUTCFullYear();

  const occurrences: Occurrence[] = [];
  for (const event of events) {
    if (event.enabled !== true || event.deleted_at != null) continue;
    if (event.information_status === "needs_completion") continue;
    if (isVagueName(event.event_name)) continue;
    if (event.date_status === "month_known" || event.date_status === "unknown") continue;

    if (view === "all" || view === "year") {
      // 全部视图：动态节点按自身日期；固定节点取目标年
      const occ = computeOccurrence(event, selectedYear, today);
      if (occ) occurrences.push(occ);
      continue;
    }

    // 固定节点需要检查跨年（今天 12 月，窗口可能延伸到明年 1 月）
    const yearsToCheck = [targetYear, targetYear + 1];
    for (const yr of yearsToCheck) {
      const occ = computeOccurrence(event, yr, today);
      if (!occ) continue;
      if (occ.daysUntil >= 0 && occ.daysUntil <= horizon) {
        occurrences.push(occ);
        break;
      }
    }
  }

  // 按日期升序，同日期按重要度 S>A>B
  const importanceRank: Record<string, number> = { S: 0, A: 1, B: 2 };
  occurrences.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return (importanceRank[a.event.importance ?? "B"] ?? 2) - (importanceRank[b.event.importance ?? "B"] ?? 2);
  });
  return occurrences;
}

/**
 * AI 置信度路由（阈值来自 app_config，不硬编码）
 */
export type ConfidenceRoute = "auto" | "review" | "discard";
export function routeByConfidence(
  confidence: number,
  thresholds: { auto: number; review: number }
): ConfidenceRoute {
  if (confidence >= thresholds.auto) return "auto";
  if (confidence >= thresholds.review) return "review";
  return "discard";
}

/**
 * 重点报道候选规则（确定性部分）；AI 判断作为补充信号
 */
export interface KeyReportInput {
  word_count: number;
  is_full_page?: boolean;
  is_cross_page?: boolean;
  is_front_page?: boolean;
  is_series?: boolean;
  is_special?: boolean;
  ai_key_signal?: boolean;
  wordThreshold: number;
}
export function isKeyReportCandidate(input: KeyReportInput): { hit: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.word_count >= input.wordThreshold) reasons.push(`正文≥${input.wordThreshold}字`);
  if (input.is_full_page) reasons.push("整版报道");
  if (input.is_cross_page) reasons.push("跨版报道");
  if (input.is_front_page) reasons.push("头版重点");
  if (input.is_series) reasons.push("系列报道");
  if (input.is_special) reasons.push("专题报道");
  if (input.ai_key_signal) reasons.push("AI重点策划特征");
  return { hit: reasons.length > 0, reasons };
}
