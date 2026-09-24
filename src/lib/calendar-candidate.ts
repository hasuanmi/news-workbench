import "server-only";
import { supabase } from "@/lib/db";
import type { DateStatus } from "./calendar-history";
import { deepseekWebSearch } from "./deepseek-search";
import { unifiedInvoke } from "./llm-client";
import { flagDuplicatesForNew } from "./calendar-dedup";
import { calendarToday, isVagueName, isValidCalendarDate, recurringOccurrence } from "./calendar-policy";
export { isVagueName } from "./calendar-policy";

/**
 * 候选生成：把历史日历节点（资料库）迁移到目标年度，落候选池。
 * 纯逻辑、不调 AI：保留原年度事项，跨年只推导明确固定日期与周年。
 */

export interface HistoryNodeLike {
  id: string;
  year: number;
  node_name: string;
  event_date: string | null; // YYYY-MM-DD
  candidate_month: number | null; // 1-12
  date_status: DateStatus;
  category_id: string | null;
  region: string | null;
  importance: string | null;
  description: string | null;
  raw_text: string | null;
  enabled: boolean;
}

export interface CandidateSeed {
  node_name: string;
  target_year: number;
  candidate_date: string | null;
  candidate_month: number | null;
  base_year: number | null; // 周年基准年（历史迁移取原始发生年）
  date_status: DateStatus;
  category_id: string | null;
  region: string;
  importance: string;
  source_type: "historical_migration" | "ai_supplement" | "pasted_text" | "manual";
  source_detail: string | null;
  raw_text: string | null;
  description: string | null;
  ai_reason: string | null;
  source_url: string | null;
}

/** 单个历史节点 → 候选（跨年必须有明确规则） */
export function migrateHistoryNodeToCandidate(
  node: HistoryNodeLike,
  targetYear: number,
): CandidateSeed | null {
  let candidate_date: string | null = null;
  let candidate_month: number | null = null;
  let base_year: number | null = null;

  if (node.date_status === "confirmed" && node.event_date) {
    const recurring = recurringOccurrence({ event_name: node.node_name, event_type: "dynamic", event_date: node.event_date }, targetYear);
    if (targetYear !== node.year && !recurring) return null;
    candidate_date = targetYear === node.year ? node.event_date : recurring!.date;
    base_year = recurring?.baseYear ?? null;
  } else if (node.date_status === "month_known") {
    if (targetYear !== node.year) return null;
    candidate_month = node.candidate_month ?? null;
  } else if (targetYear !== node.year) {
    return null;
  }
  // unknown：candidate_date / candidate_month 均为 null

  return {
    node_name: node.node_name,
    target_year: targetYear,
    candidate_date,
    candidate_month,
    base_year,
    date_status: node.date_status,
    category_id: node.category_id,
    region: node.region ?? "national",
    importance: node.importance ?? "B",
    source_type: "historical_migration",
    source_detail: `history_node:${node.id}`,
    raw_text: node.raw_text,
    description: node.description,
    ai_reason: null,
    source_url: null,
  };
}

export interface GenerateFromHistoryParams {
  targetYear: number;
  fileId?: string;
  year?: number;
  nodeIds?: string[];
  /** 默认只迁移尚不存在候选的历史节点（幂等）；true 则强制重新生成 */
  force?: boolean;
}

export interface GenerateResult {
  requested: number;
  skipped: number;
  inserted: number;
  insertedIds: string[];
}

/**
 * 从历史日历节点批量生成候选（historical_migration）。
 * 幂等：已存在 source_detail=`history_node:<id>` 且未 rejected 的候选会跳过。
 */
export async function generateCandidatesFromHistory(
  params: GenerateFromHistoryParams,
): Promise<GenerateResult> {
  const { targetYear, fileId, year, nodeIds, force } = params;
  const db = supabase();

  let query = db
    .schema("public")
    .from("calendar_history_node")
    .select("*")
    .eq("enabled", true);
  if (nodeIds && nodeIds.length) query = query.in("id", nodeIds);
  else if (fileId) query = query.eq("file_id", fileId);
  else if (year) query = query.eq("year", year);

  const { data: nodes, error } = await query;
  if (error) throw new Error(`读取历史节点失败: ${error.message}`);
  const rows = (nodes ?? []) as unknown as HistoryNodeLike[];
  if (rows.length === 0) {
    return { requested: 0, skipped: 0, inserted: 0, insertedIds: [] };
  }

  // 已迁移集合（用于幂等）
  const migratedIds = new Set<string>();
  if (!force) {
    const { data: existing } = await db
      .schema("public")
      .from("calendar_candidate")
      .select("source_detail")
      .eq("source_type", "historical_migration")
      .eq("target_year", targetYear)
      .in(
        "source_detail",
        rows.map((n) => `history_node:${n.id}`),
      );
    for (const e of existing ?? []) {
      if (e.source_detail) migratedIds.add(e.source_detail);
    }
  }

  const seeds: CandidateSeed[] = [];
  let skipped = 0;
  for (const n of rows) {
    if (!force && migratedIds.has(`history_node:${n.id}`)) {
      skipped++;
      continue;
    }
    const seed = migrateHistoryNodeToCandidate(n, targetYear);
    if (seed) seeds.push(seed);
    else skipped++;
  }

  if (seeds.length === 0) {
    return { requested: rows.length, skipped, inserted: 0, insertedIds: [] };
  }

  const { data: inserted, error: insErr } = await db
    .schema("public")
    .from("calendar_candidate")
    .insert(
      seeds.map((s) => ({
        node_name: s.node_name,
        target_year: s.target_year,
        candidate_date: s.candidate_date,
        candidate_month: s.candidate_month,
        base_year: s.base_year,
        date_status: s.date_status,
        category_id: s.category_id,
        region: s.region,
        importance: s.importance,
        source_type: s.source_type,
        source_detail: s.source_detail,
        raw_text: s.raw_text,
        description: s.description,
        ai_reason: s.ai_reason,
        source_url: s.source_url,
        dedup_status: "new",
        review_status: "pending",
      })),
    )
    .select("id");

  if (insErr) throw new Error(`写入候选失败: ${insErr.message}`);

  return {
    requested: rows.length,
    skipped,
    inserted: inserted?.length ?? 0,
    insertedIds: (inserted ?? []).map((r: { id: string }) => r.id),
  };
}

/** 读取目标年度配置（calendar.target_year） */
export async function getTargetYear(): Promise<number> {
  return calendarToday().getUTCFullYear();
}

/* ============================================================
 * 分类 / 护栏 / AI 推荐 / 粘贴识别 / 统一入库
 * ========================================================== */

export interface CalendarCategoryLite {
  id: string;
  code: string;
  category_name: string;
  color?: string | null;
}

export async function listCalendarCategories(): Promise<CalendarCategoryLite[]> {
  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_category")
    .select("id, code, category_name")
    .order("code");
  if (error) throw new Error(`读取分类失败: ${error.message}`);
  return (data ?? []) as CalendarCategoryLite[];
}

const REGION_CODES = ["national", "guangdong", "guangzhou", "other"] as const;
export const REGION_LABEL: Record<string, string> = {
  national: "国内/国际",
  guangdong: "广东",
  guangzhou: "广州",
  other: "其他",
};

/**
 * 模糊占位名护栏：AI 无法确认具体事件名时（含"某"、纯泛化词）不允许进入候选池。
 */

function normalizeUrl(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = String(s).trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

function matchCategory(
  cats: CalendarCategoryLite[],
  val: unknown,
): CalendarCategoryLite | null {
  if (!val) return null;
  const v = String(val).trim().toLowerCase();
  for (const c of cats) {
    if (c.code.toLowerCase() === v || c.category_name.toLowerCase() === v) return c;
  }
  for (const c of cats) {
    const cn = c.category_name.toLowerCase();
    if (cn.includes(v) || v.includes(cn)) return c;
  }
  return null;
}

function extractJsonArray(text: string): Record<string, unknown>[] {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(arr) ? arr.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item)) : [];
  } catch {
    return [];
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export interface RecommendedCandidate {
  node_name: string;
  date_status: DateStatus;
  candidate_date: string | null;
  candidate_month: number | null;
  category_id: string | null;
  region: string;
  importance: string;
  ai_reason: string;
  /** 来源依据：官方/权威出处的文字说明（如"中国力学学会官网第一轮通知"） */
  source_basis: string | null;
  source_url: string | null;
}

export interface RecommendOptions {
  focusCategories?: string[];
  region?: string;
  months?: number[];
  industries?: string;
  keywords?: string;
  extraRequirements?: string;
}

/**
 * AI 推荐候选：结合历史日历的关注类型 + 当年联网公开信息，补充历史里没有的
 * 新会议 / 新活动 / 新政策 / 新纪念节点。每条必须带来源依据（source_basis）与
 * 来源链接（source_url），无法确认具体名称或没有来源的模糊事件直接丢弃（不进入候选池）。
 */
export async function recommendCandidatesFromWeb(
  targetYear: number,
  opts: RecommendOptions = {},
): Promise<{ candidates: RecommendedCandidate[]; searched: boolean }> {
  if (targetYear !== calendarToday().getUTCFullYear()) throw new Error("AI推荐仅补充当前年度动态事件；下一年度请预览固定或可推导节点");
  const cats = await listCalendarCategories();
  const catLines = cats.map((c) => `- ${c.category_name}（code: ${c.code}）`).join("\n");
  const focus =
    opts.focusCategories && opts.focusCategories.length
      ? opts.focusCategories
          .map((code) => cats.find((c) => c.code === code)?.category_name ?? code)
          .join("、")
      : "全部关注类型";
  const regionHint =
    opts.region && opts.region !== "all" ? REGION_LABEL[opts.region] ?? opts.region : "广东及全国";
  const monthsText =
    opts.months && opts.months.length
      ? opts.months
          .slice()
          .sort((a, b) => a - b)
          .map((m) => `${m}月`)
          .join("、")
      : "不限制月份";
  const industryText = opts.industries?.trim() ? opts.industries.trim() : "不限制行业";
  const keywordsText = opts.keywords?.trim() ? opts.keywords.trim() : "不限关键词";
  const extraText = opts.extraRequirements?.trim() ? opts.extraRequirements.trim() : "无";

  const instructions = `你是新闻日历编辑助手。请基于联网检索，为当前 ${targetYear} 年补充有具体名称的动态会议、政策、活动、行业事件。不要重复推荐固定节日，不要复制上年度会议届次或推测下一年度活动。
可归入的关注类型（必须取下列之一，并用其 code 填 category_code）：
${catLines}

筛选条件：
- 重点地区：${regionHint}
- 关注类型：${focus}
- 关注月份：${monthsText}
- 行业领域：${industryText}
- 关键词：${keywordsText}
- 补充要求：${extraText}

严格要求：
1. 只列你通过联网检索确认、且有官方/权威来源链接的具体事件；无法确认具体名称的事件一律不要列出（禁止"某重要会议""某重大政策发布"等模糊占位）。
2. 每个事件必须带 source_url（官方或权威来源链接）与 source_basis（一句来源依据，说明是哪类官方/权威出处，如"XX官网会议通知"）。
时间可以待定，但事件必须明确且属于 ${targetYear} 年。信息不足不得猜测名称，无法确认具体事件则不输出；日期不得落到其它年度。
3. 输出严格为 JSON 数组，不要任何额外说明文字。每条结构：
{"node_name":"具体事件名","date_status":"confirmed|month_known|unknown","candidate_date":"YYYY-MM-DD 或 null","candidate_month":1-12 或 null,"category_code":"上述 code 之一","region":"national|guangdong|guangzhou|other","importance":"S|A|B","ai_reason":"1-2 句：为何它是当年值得关注的新闻节点","source_basis":"来源依据（官方/权威出处简述）","source_url":"官方来源链接"}`;

  const input = `请联网检索 ${targetYear} 年 ${regionHint} 在「${focus}」方面的新会议/活动/政策/纪念节点（关注月份：${monthsText}；行业领域：${industryText}；关键词：${keywordsText}；补充要求：${extraText}），给出具体名称、时间、分类、地区、重要度、推荐理由、来源依据与来源链接，严格按上述 JSON 数组格式输出，最多 12 条。`;

  const { text, sources } = await deepseekWebSearch({
    instructions,
    input,
    timeoutMs: 150000,
  });

  const parsed = extractJsonArray(text);
  const candidates: RecommendedCandidate[] = [];

  for (const raw of parsed) {
    const name = String(raw.node_name ?? "").trim();
    if (!name || isVagueName(name)) continue;
    let ds: DateStatus = (["confirmed", "month_known", "unknown"] as string[]).includes(
      String(raw.date_status),
    )
      ? (raw.date_status as DateStatus)
      : "unknown";
    let candDate: string | null = null;
    let candMonth: number | null = null;
    if (ds === "confirmed") {
      candDate = isValidCalendarDate(String(raw.candidate_date ?? "")) && String(raw.candidate_date).startsWith(`${targetYear}-`)
        ? String(raw.candidate_date)
        : null;
    } else if (ds === "month_known") {
      const m = Number(raw.candidate_month);
      candMonth = m >= 1 && m <= 12 ? m : null;
    }
    const region = (REGION_CODES as readonly string[]).includes(String(raw.region))
      ? String(raw.region)
      : "national";
    const importance = ["S", "A", "B"].includes(String(raw.importance)) ? String(raw.importance) : "B";
    const cat = matchCategory(cats, raw.category_code ?? raw.category);
    if (ds === "confirmed" && !candDate) continue;
    if (ds === "month_known" && !candMonth) ds = "unknown";
    const sourceUrl = normalizeUrl(String(raw.source_url ?? "").trim());
    // 没有具体来源依据的 AI 推荐，不允许进入候选池
    if (!sourceUrl || !sources.some(source => source.url === sourceUrl)) continue;
    const basis = String(raw.source_basis ?? "").trim() || null;
    if (!basis) continue;

    candidates.push({
      node_name: name,
      date_status: ds === "confirmed" && !candDate || ds === "month_known" && !candMonth ? "unknown" : ds,
      candidate_date: candDate,
      candidate_month: candMonth,
      category_id: cat?.id ?? null,
      region,
      importance,
      ai_reason:
        String(raw.ai_reason ?? "").trim() ||
        `联网检索发现的 ${targetYear} 年${regionHint}相关节点`,
      source_basis: basis,
      source_url: sourceUrl,
    });
  }

  return { candidates, searched: true };
}

export interface ParsedPastedCandidate {
  node_name: string;
  date_status: DateStatus;
  candidate_date: string | null;
  candidate_month: number | null;
  category_id: string | null;
  region: string;
  importance: string;
  ai_reason: string | null;
  source_url: string | null;
}

/**
 * 粘贴信息识别：从用户粘贴的会议通知/政策说明/公众号内容中抽取单个新闻节点。
 * 不联网（复用既有 DeepSeek 对话通道），给出结构化预览供用户确认。
 */
export async function recognizePastedText(
  rawText: string,
  targetYear: number,
): Promise<{ candidate: ParsedPastedCandidate | null }> {
  const cats = await listCalendarCategories();
  const catLines = cats.map((c) => `- ${c.category_name}（code: ${c.code}）`).join("\n");
  const instructions = `你是新闻节点抽取助手。从用户粘贴的文本（会议通知/政策说明/公众号内容等）中抽取单个新闻节点。
可归入的关注类型（取其一）：
${catLines}
仅输出严格 JSON 对象（不要任何说明）：
{"node_name":"具体事件名","date_status":"confirmed|month_known|unknown","candidate_date":"YYYY-MM-DD 或 null","candidate_month":1-12 或 null,"category_code":"上述 code 之一或 null","region":"national|guangdong|guangzhou|other","importance":"S|A|B","ai_reason":"抽取依据简述","source_url":"若文本中含链接则填，否则 null"}
node_name 必须来自原文明确的具体事件名称（禁止"某"等占位）。时间可不确定，但事件必须明确。信息不足时返回 null，绝不猜测或编造名称；所属年度为 ${targetYear} 年；原文年份不明确时不得擅自填写具体日期。`;

  const input = `请抽取以下文本中的新闻节点：\n"""\n${rawText.slice(0, 4000)}\n"""`;

  const text = await unifiedInvoke(
    [
      { role: "system", content: instructions },
      { role: "user", content: input },
    ],
    { temperature: 0.2 },
  );

  const obj = extractJsonObject(text);
  if (!obj) return { candidate: null };
  const name = String(obj.node_name ?? "").trim();
  if (!name || isVagueName(name)) return { candidate: null };

  const ds: DateStatus = (["confirmed", "month_known", "unknown"] as string[]).includes(
    String(obj.date_status),
  )
    ? (obj.date_status as DateStatus)
    : "unknown";
  let candDate: string | null = null;
  let candMonth: number | null = null;
  if (ds === "confirmed") {
    candDate = isValidCalendarDate(String(obj.candidate_date ?? "")) && String(obj.candidate_date).startsWith(`${targetYear}-`)
      ? String(obj.candidate_date)
      : null;
  } else if (ds === "month_known") {
    const m = Number(obj.candidate_month);
    candMonth = m >= 1 && m <= 12 ? m : null;
  }
  const region = (REGION_CODES as readonly string[]).includes(String(obj.region)) ? String(obj.region) : "national";
  const importance = ["S", "A", "B"].includes(String(obj.importance)) ? String(obj.importance) : "B";
  const cat = matchCategory(cats, obj.category_code ?? obj.category);

  return {
    candidate: {
      node_name: name,
      date_status: (ds === "confirmed" && !candDate) || (ds === "month_known" && !candMonth) ? "unknown" : ds,
      candidate_date: candDate,
      candidate_month: candMonth,
      category_id: cat?.id ?? null,
      region,
      importance,
      ai_reason: obj.ai_reason ? String(obj.ai_reason) : null,
      source_url: normalizeUrl(String(obj.source_url ?? "").trim()),
    },
  };
}

export interface InsertCandidateInput {
  node_name: string;
  target_year: number;
  date_status: DateStatus;
  candidate_date: string | null;
  candidate_month: number | null;
  category_id: string | null;
  region: string;
  importance: string;
  source_type: "manual" | "pasted_text" | "ai_supplement";
  source_detail?: string | null;
  raw_text?: string | null;
  description?: string | null;
  ai_reason?: string | null;
  source_url?: string | null;
}

export interface InsertCandidateResult {
  item: Record<string, unknown>;
  duplicateOfId: string | null;
}

/**
 * 统一入库：手动 / 粘贴识别 / AI 推荐 三类候选都走这里。
 * 护栏：模糊名留待补全，不得进入正式日历；AI推荐与粘贴识别必须带来源依据或原始文本。
 * 入库后自动增量去重（flagDuplicatesForNew）。
 */
export async function insertCandidateFromSource(
  input: InsertCandidateInput,
  username: string,
): Promise<InsertCandidateResult> {
  if (isVagueName(input.node_name)) {
    // 原始线索可留在候选池补全；确认入口会阻止其进入正式日历。
    input = { ...input, ai_reason: "信息待补全：请补充具体事件名称及来源依据" };
  }
  if (input.source_type !== "manual") {
    const hasSource = !!(
      input.source_url ||
      input.source_detail ||
      input.raw_text
    );
    if (!hasSource) {
      throw new Error("AI推荐 / 粘贴识别 必须带来源依据或原始文本");
    }
  }

  const row = {
    node_name: input.node_name,
    target_year: input.target_year,
    candidate_date: input.candidate_date,
    candidate_month: input.candidate_month,
    base_year: input.target_year,
    date_status: input.date_status,
    category_id: input.category_id || null,
    region: input.region,
    importance: input.importance,
    source_type: input.source_type,
    source_detail:
      input.source_detail ?? (input.source_type === "manual" ? `manual:${username}` : null),
    raw_text: input.raw_text ?? null,
    description: input.description ?? null,
    ai_reason: input.ai_reason ?? null,
    source_url: input.source_url ?? null,
    dedup_status: "new",
    review_status: "pending",
  };

  const db = supabase();
  const { data, error } = await db
    .schema("public")
    .from("calendar_candidate")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`写入候选失败: ${error.message}`);

  const dup = await flagDuplicatesForNew([(data as { id: string }).id], input.target_year);
  return {
    item: data as Record<string, unknown>,
    duplicateOfId: dup[(data as { id: string }).id] ?? null,
  };
}
