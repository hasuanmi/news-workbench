import "server-only";
import { supabase } from "@/lib/db";
import type { CalendarRuleEvent } from "./calendar-engine";
import { calendarToday, recurringOccurrence, isVagueName } from "./calendar-policy";

export interface CalendarRecord extends CalendarRuleEvent {
  source_candidate_id?: string | null;
  source_url?: string | null;
  created_at?: string;
  [key: string]: unknown;
}
interface HistoryRecord {
  id: string; year: number; node_name: string; event_date: string | null;
  candidate_month: number | null; date_status: string; category_id: string | null;
  region: string; importance: string; description: string | null; raw_text: string | null;
  enabled: boolean;
}
interface CandidateReference { id: string; target_year: number; source_type: string; source_detail: string | null }
interface Category { id: string; code: string; category_name: string; color: string }

/** 分页读取，避免全年底图被 PostgREST 的单次行数上限截断。 */
async function readAll<T>(table: string, columns = "*"): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase().from(table).select(columns).order("id").range(offset, offset + pageSize - 1);
    if (error) throw new Error(`读取${table}失败：${error.message}`);
    rows.push(...(data ?? []) as unknown as T[]);
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadCalendarRecords() {
  const [rawEvents, histories, candidates, categories] = await Promise.all([
    readAll<CalendarRecord>("calendar_event"), readAll<HistoryRecord>("calendar_history_node"),
    readAll<CandidateReference>("calendar_candidate", "id,target_year,source_type,source_detail"),
    readAll<Category>("calendar_category", "id,code,category_name,color"),
  ]);
  const historyMap = new Map(histories.map(row => [row.id, row]));
  const candidateMap = new Map(candidates.map(row => [row.id, row]));
  const categoryMap = new Map(categories.map(row => [row.id, row]));
  const suppressedHistory = new Set<string>();
  const representedHistory = new Set<string>();
  const records: CalendarRecord[] = rawEvents.map(event => {
    const candidate = candidateMap.get(event.source_candidate_id ?? "");
    const reference = event.source_name?.startsWith("history_node:") ? event.source_name : candidate?.source_detail;
    const historyId = reference?.startsWith("history_node:") ? reference.slice(13) : null;
    const history = historyMap.get(historyId ?? "");
    if (historyId && (!event.enabled || event.deleted_at)) suppressedHistory.add(historyId);
    const tagYear = Array.isArray(event.tags) ? event.tags.find((tag: unknown) => typeof tag === "string" && /^calendar-year:\d{4}$/.test(tag)) : null;
    const calendarYear = event.event_date ? Number(event.event_date.slice(0, 4))
      : (tagYear ? Number(String(tagYear).slice(14)) : candidate?.target_year ?? history?.year ?? (Number((event.original_date || event.created_at)?.slice(0, 4)) || null));
    if (historyId && history && calendarYear === history.year) representedHistory.add(historyId);
    const historicalRule = history && calendarYear ? recurringOccurrence({ event_name: history.node_name, event_type: "dynamic", event_date: history.event_date }, calendarYear) : null;
    const invalidProjection = history && calendarYear !== history.year && (!historicalRule || historicalRule.date !== (event.event_date || event.original_date));
    const legacyOneOff = event.event_type === "fixed" && candidate && !recurringOccurrence({ ...event, event_type: "dynamic", event_date: event.original_date, anniversary_base_year: null }, candidate.target_year);
    return {
      ...event,
      ...(legacyOneOff ? { event_type: "dynamic" as const, event_date: event.original_date, original_date: null, anniversary_base_year: null } : {}),
      calendar_year: calendarYear,
      information_status: invalidProjection || isVagueName(event.event_name) ? "needs_completion" : "complete",
      ...(historicalRule?.baseYear != null ? { event_year: historicalRule.baseYear } : {}),
      source_type: event.source_type || candidate?.source_type || (history ? "historical_migration" : "manual"),
      category: categoryMap.get(event.category_id ?? "") ?? null,
    };
  });
  // 历史资料以只读节点加入年度查询，不必先复制到事件表才能回看。
  for (const history of histories) {
    if (!history.enabled || suppressedHistory.has(history.id) || representedHistory.has(history.id)) continue;
    records.push({
      id: `history:${history.id}`, event_name: history.node_name, event_type: "dynamic",
      event_date: history.event_date, original_date: null, calendar_year: history.year,
      event_month: history.candidate_month, date_status: history.date_status,
      category_id: history.category_id, category: categoryMap.get(history.category_id ?? "") ?? null,
      importance: history.importance, region: history.region, description: history.description,
      raw_text: history.raw_text, enabled: true, source: "history_migrate",
      source_type: "historical_migration", source_name: `${history.year}年历史导入`, read_only: true,
      information_status: isVagueName(history.node_name) ? "needs_completion" : "complete",
    });
  }
  const currentYear = calendarToday().getUTCFullYear();
  const years = new Set([currentYear, currentYear + 1]);
  for (const history of histories) if (history.enabled) years.add(history.year);
  for (const record of records) if (record.calendar_year && record.enabled && !record.deleted_at) years.add(record.calendar_year);
  return { records, years: [...years].sort((a, b) => a - b), currentYear };
}
