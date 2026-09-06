// 日历规则引擎：纯函数，确定性逻辑（不含任何 AI 判断）
// 所有窗口天数、周年基准等均为入参，阈值由 app_config 注入

export interface CalendarRuleEvent {
  id: string;
  event_name: string;
  event_type: "fixed" | "dynamic";
  original_date?: string | null; // YYYY-MM-DD 固定节点基准日期
  event_date?: string | null; // YYYY-MM-DD 动态节点当期日期
  anniversary_base_year?: number | null;
  region?: string;
  importance?: string | null;
  category_id?: string | null;
  enabled?: boolean;
  review_status?: string;
  background?: string | null;
  planning_hint?: unknown;
  tags?: unknown;
  source?: string | null;
  category?: unknown;
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
  if (event.event_type === "fixed") {
    if (!event.original_date) return null;
    const { m, d } = parseDate(event.original_date);
    const date = `${targetYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const baseYear = event.anniversary_base_year ?? parseDate(event.original_date).y;
    const anniversary = targetYear - baseYear;
    return {
      event,
      date,
      anniversary: anniversary > 0 ? anniversary : null,
      daysUntil: diffDays(today, toDate(targetYear, m, d)),
    };
  }
  // dynamic
  if (!event.event_date) return null;
  const { y, m, d } = parseDate(event.event_date);
  return {
    event,
    date: event.event_date,
    anniversary: null,
    daysUntil: diffDays(today, toDate(y, m, d)),
  };
}

export type RangeView = "week" | "next14" | "month" | "all";

/**
 * 生成日历视图：仅返回 enabled + approved 的节点，落在窗口内
 * 动态节点只在其 event_date 所在年出现；固定节点每年都出现
 */
export function buildCalendar(
  events: CalendarRuleEvent[],
  today: Date,
  view: RangeView,
  horizonDays: number
): Occurrence[] {
  const horizon =
    view === "week" ? 7 : view === "next14" ? horizonDays : view === "month" ? 30 : horizonDays;
  const targetYear = today.getUTCFullYear();

  const occurrences: Occurrence[] = [];
  for (const event of events) {
    if (event.enabled === false) continue;
    if (event.review_status && event.review_status !== "approved") continue;

    if (view === "all") {
      // 全部视图：动态节点按自身日期；固定节点取目标年
      const occ = computeOccurrence(event, targetYear, today);
      if (occ) occurrences.push(occ);
      continue;
    }

    // 固定节点需要检查跨年（今天 12 月，窗口可能延伸到明年 1 月）
    const yearsToCheck = [targetYear, targetYear + 1];
    for (const yr of yearsToCheck) {
      const occ = computeOccurrence(event, yr, today);
      if (!occ) continue;
      // 动态节点只在其实际年份
      if (event.event_type === "dynamic" && parseDate(occ.date).y !== parseDate(event.event_date!).y) continue;
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
