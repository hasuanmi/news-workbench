/**
 * 新闻日历节点自动补全引擎（M）
 *
 * 触发时机：节点被新增 / 历史迁移 / AI 推荐 / 用户粘贴识别，或信息（名称/日期/地区/分类）变化后被自动触发；
 * 也可由管理员在后台「重新生成」强制触发。
 *
 * 流程：
 *   1. 计算节点信息指纹（名称/日期/地区/分类），若与已存指纹相同且已补全 → 跳过（避免浪费 Token）
 *   2. 联网检索：优先权威站点（中国政府网/新华社/人民日报/央视/粤/穗政府及官方活动网站）
 *   3. 将检索结果作为上下文交给大模型，生成：背景信息 / 为什么值得关注 / 可参考的选题方向
 *   4. 落库（背景/原因/选题/参考来源列表/状态/指纹/时间）
 *
 * 检索无可靠来源时：不编造内容，status=no_source，详情显示占位文案。
 * 所有业务阈值/开关来自 app_config 的 calendar.enrich.*（配置驱动，不硬编码）。
 */
import { createHash } from "node:crypto";
import { supabase } from "@/lib/db";
import { unifiedInvoke } from "@/lib/llm-client";
import type { ChatMessage } from "@/lib/llm-adapter";

export interface EnrichSource {
  title: string;
  url: string;
  snippet: string;
  authority?: string;
  publish_time?: string;
}

export type EnrichStatus = "none" | "pending" | "done" | "no_source" | "failed";

export interface EnrichConfig {
  enabled: boolean;
  /** 权威站点（优先检索），逗号分隔域名 */
  authority_sites: string;
  /** 每个节点最多采用的参考来源数 */
  max_sources: number;
}

const DEFAULT_ENRICH_CONFIG: EnrichConfig = {
  enabled: true,
  authority_sites:
    "gov.cn,www.gov.cn,news.cn,xinhuanet.com,people.com.cn,cctv.com,gd.gov.cn,gz.gov.cn,12371.cn,qstheory.cn",
  max_sources: 6,
};

interface EnrichRow {
  id: string;
  event_name: string;
  event_type: string;
  original_date: string | null;
  event_date: string | null;
  event_year: number | null;
  region: string;
  category_id: string | null;
  enrich_status: EnrichStatus;
  enrich_fingerprint: string | null;
}

interface CategoryRow {
  category_name: string;
}

/** 读取 calendar.enrich 配置（无需进 AppConfig 强类型，按需读取） */
export async function getEnrichConfig(): Promise<EnrichConfig> {
  try {
    const { data } = await supabase()
      .schema("public")
      .from("app_config")
      .select("value")
      .eq("key", "calendar.enrich")
      .maybeSingle();
    if (data && data.value) {
      const v = data.value as Partial<EnrichConfig>;
      return {
        enabled: v.enabled !== false,
        authority_sites: String(v.authority_sites ?? DEFAULT_ENRICH_CONFIG.authority_sites),
        max_sources:
          typeof v.max_sources === "number" && v.max_sources > 0
            ? v.max_sources
            : DEFAULT_ENRICH_CONFIG.max_sources,
      };
    }
  } catch {
    // 读取失败用默认值
  }
  return DEFAULT_ENRICH_CONFIG;
}

/** 信息指纹：事件主体 + 日期 + 地区 + 分类的变化都会改变指纹，从而触发重新补全 */
export function enrichFingerprint(ev: {
  event_name: string;
  original_date?: string | null;
  event_date?: string | null;
  event_year?: number | null;
  region: string;
  category_id?: string | null;
}): string {
  const date =
    ev.original_date ||
    ev.event_date ||
    (ev.event_year ? String(ev.event_year) : "") ||
    "";
  const raw = [
    ev.event_name.trim(),
    date,
    ev.region,
    ev.category_id ?? "",
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/** 依据节点信息构造检索 Query（含地域与事件年份背景，提升命中权威来源概率） */
function buildQuery(ev: EnrichRow): string {
  const parts: string[] = [ev.event_name.trim()];
  if (ev.region) parts.push(ev.region === "local" ? "广东广州" : "全国");
  if (ev.event_year) parts.push(String(ev.event_year) + "年");
  return parts.join(" ");
}

/** 联网检索（coze SearchClient），优先权威站点；失败或无结果返回空数组 */
async function searchSources(
  query: string,
  cfg: EnrichConfig,
): Promise<EnrichSource[]> {
  try {
    const mod = (await import("coze-coding-dev-sdk")) as unknown as {
      SearchClient: new (c?: unknown) => {
        advancedSearch: (
          q: string,
          o?: {
            searchType?: "web" | "web_summary" | "image";
            count?: number;
            needSummary?: boolean;
            sites?: string;
          },
        ) => Promise<{ web_items: WebItemRaw[] }>;
      };
      Config: new () => unknown;
    };
    const { SearchClient, Config } = mod;
    const client = new SearchClient(new Config());

    // 第一轮：限定权威站点
    let response = await client.advancedSearch(query, {
      searchType: "web",
      count: cfg.max_sources,
      needSummary: false,
      sites: cfg.authority_sites,
    });

    // 第二轮：权威站点无结果则降级为整体检索（仅标记来源，交由大模型甄别）
    let items = (response?.web_items ?? []) as WebItemRaw[];
    if (items.length === 0) {
      const fallback = await client.advancedSearch(query, {
        searchType: "web",
        count: cfg.max_sources,
        needSummary: false,
      });
      items = (fallback?.web_items ?? []) as WebItemRaw[];
    }

    return items
      .filter((it) => it && it.title && it.url)
      .slice(0, cfg.max_sources)
      .map((it) => ({
        title: String(it.title),
        url: String(it.url as string),
        snippet: String(it.snippet ?? it.summary ?? "").slice(0, 300),
        authority: it.site_name ? String(it.site_name) : undefined,
        publish_time: it.publish_time ? String(it.publish_time) : undefined,
      }));
  } catch {
    return [];
  }
}

/** SearchClient 返回的 web_items 条目结构 */
interface WebItemRaw {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  site_name?: string;
  publish_time?: string;
}

interface GeneratedEnrichment {
  background?: string;
  why?: string;
  topics?: string[];
}

/** 把检索结果交给大模型生成三项内容（结构化 JSON） */
async function generateWithLLM(
  ev: EnrichRow,
  categoryName: string | null,
  sources: EnrichSource[],
): Promise<GeneratedEnrichment> {
  const systemPrompt =
    "你是广州日报的资深新闻策划编辑，负责围绕重要新闻节点做资料梳理与选题策划。" +
    "你必须严格依据下面给出的联网检索资料，输出结构化信息；禁止编造、杜撰、猜测资料中不存在的内容。";

  const sourceText = sources
    .map(
      (s, i) =>
        `${i + 1}. ${s.title}（${s.authority ?? s.publish_time ?? ""}）\n   链接：${s.url}\n   摘要：${s.snippet}`,
    )
    .join("\n\n");

  const userPrompt =
    `【节点】${ev.event_name}\n` +
    `【类型】${ev.event_type === "fixed" ? "固定节点（每年周期性）" : "动态节点"}\n` +
    `【地域】${ev.region === "local" ? "广东/广州本地" : "全国/国际"}\n` +
    (categoryName ? `【分类】${categoryName}\n` : "") +
    (ev.event_year ? `【事件年份】${ev.event_year}\n` : "") +
    `\n【检索到的参考资料】\n${sourceText || "（未检索到可靠资料）"}\n\n` +
    "请基于以上资料，输出严格的 JSON（不要输出任何多余文字或 Markdown 代码块标记）：\n" +
    '{"background": "背景信息（客观梳理该节点的历史背景/由来/现状，2~4 句，可含年份)", "why": "为什么值得关注（一句话点明新闻价值，结合广州日报本地视角）", "topics": ["选题方向1", "选题方向2", "选题方向3（3~5 条可落地的报道/选题角度）"]}\n' +
    "若检索资料确实太少、不足以支撑可信内容，请输出 {\"background\":\"待补充\",\"why\":\"待补充\",\"topics\":[]}，绝不编造。";

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const raw = await unifiedInvoke(messages, { temperature: 0.3 });
  return parseEnrichment(raw);
}

/** 稳健解析 LLM 结构化 JSON：剥离代码块标记，提取三项 */
function parseEnrichment(raw: string): GeneratedEnrichment {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no-object");
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const topics = Array.isArray(obj.topics)
      ? (obj.topics as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 6)
      : [];
    return {
      background: typeof obj.background === "string" && obj.background ? obj.background : undefined,
      why: typeof obj.why === "string" && obj.why ? obj.why : undefined,
      topics,
    };
  } catch {
    return {};
  }
}

/**
 * 执行节点补全。
 * @param id 节点 id
 * @param opts.force 强制重新生成（忽略指纹去重），供后台「重新生成」使用
 * @returns 是否真正触发了补全（false=信息未变化/已补全，跳过）
 */
export async function runEventEnrich(
  id: string,
  opts?: { force?: boolean },
): Promise<boolean> {
  const force = opts?.force === true;
  const cfg = await getEnrichConfig();
  if (!cfg.enabled) return false;

  const { data: ev, error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !ev) return false;

  const row = ev as unknown as EnrichRow;

  // 信息未变化 + 已有补全结果 → 跳过（避免重复调用大模型，节省 Token）
  const fp = enrichFingerprint(row);
  if (
    !force &&
    row.enrich_fingerprint === fp &&
    (row.enrich_status === "done" || row.enrich_status === "no_source")
  ) {
    return false;
  }

  // 置为补全中
  await supabase()
    .schema("public")
    .from("calendar_event")
    .update({ enrich_status: "pending", enrich_fingerprint: fp, updated_at: new Date().toISOString() })
    .eq("id", id);

  let categoryName: string | null = null;
  if (row.category_id) {
    const { data: cat } = await supabase()
      .schema("public")
      .from("calendar_category")
      .select("category_name")
      .eq("id", row.category_id)
      .maybeSingle();
    categoryName = (cat as CategoryRow | null)?.category_name ?? null;
  }

  // 1) 检索
  const sources = await searchSources(buildQuery(row), cfg);

  // 未检索到可靠来源 → 不编造，标记 no_source
  if (sources.length === 0) {
    await supabase()
      .schema("public")
      .from("calendar_event")
      .update({
        enrich_status: "no_source",
        enrich_fingerprint: fp,
        ai_background: null,
        ai_why: null,
        ai_topics: null,
        ai_sources: null,
        enrich_error: null,
        enriched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return true;
  }

  // 2) 大模型生成
  try {
    const gen = await generateWithLLM(row, categoryName, sources);

    // 生成内容为空或不充分 → 视为无可靠内容（不硬造）
    const hasContent =
      (gen.background && gen.background !== "待补充") ||
      (gen.why && gen.why !== "待补充") ||
      (gen.topics && gen.topics.length > 0);

    if (!hasContent) {
      await supabase()
        .schema("public")
        .from("calendar_event")
        .update({
          enrich_status: "no_source",
          enrich_fingerprint: fp,
          ai_background: gen.background && gen.background !== "待补充" ? gen.background : null,
          ai_why: gen.why && gen.why !== "待补充" ? gen.why : null,
          ai_topics: gen.topics && gen.topics.length ? gen.topics : null,
          ai_sources: sources,
          enriched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } else {
      await supabase()
        .schema("public")
        .from("calendar_event")
        .update({
          enrich_status: "done",
          enrich_fingerprint: fp,
          ai_background: gen.background && gen.background !== "待补充" ? gen.background : null,
          ai_why: gen.why && gen.why !== "待补充" ? gen.why : null,
          ai_topics: gen.topics && gen.topics.length ? gen.topics : null,
          ai_sources: sources,
          enrich_error: null,
          enriched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
    return true;
  } catch (err) {
    // LLM/落库失败：标记 failed，保留参考来源供人工二次生成时复用
    const msg = err instanceof Error ? err.message : "补全失败";
    await supabase()
      .schema("public")
      .from("calendar_event")
      .update({
        enrich_status: "failed",
        enrich_fingerprint: fp,
        ai_sources: sources,
        enrich_error: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return true;
  }
}

/** 记录补全任务的开始，返回可追踪的 taskId */
function readTaskLogId(d: { id?: string } | null): string | undefined {
  return d?.id;
}

/**
 * 供「重新生成」管理接口调用的入口：执行补全并返回任务信息。
 * @returns { taskId, status } —— taskId 为 task_log 记录 id（无则生成随机串），status 为补全落库状态
 */
export async function runEnrich(
  id: string,
  opts?: { force?: boolean; skipDedup?: boolean },
): Promise<{ taskId: string; status: string }> {
  const startedAt = new Date();
  const started = await supabase()
    .schema("public")
    .from("task_log")
    .insert({
      workflow_name: "calendar_enrich",
      status: "running",
      start_time: startedAt.toISOString(),
      error_message: `event:${id}`,
    })
    .select("id")
    .single()
    .then((r) => readTaskLogId(r.data));
  const taskId = started ?? `enrich-${Date.now()}`;

  try {
    const triggered = await runEventEnrich(id, {
      force: opts?.force === true || opts?.skipDedup === true,
    });
    const { data: ev } = await supabase()
      .schema("public")
      .from("calendar_event")
      .select("enrich_status")
      .eq("id", id)
      .maybeSingle();
    const status = ev?.enrich_status ?? (triggered ? "done" : "skipped");
    await supabase()
      .schema("public")
      .from("task_log")
      .update({ status: "success", end_time: new Date().toISOString() })
      .eq("id", started ?? "__none__");
    return { taskId, status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "补全失败";
    await supabase()
      .schema("public")
      .from("task_log")
      .update({
        status: "failed",
        error_message: msg.slice(0, 500),
        end_time: new Date().toISOString(),
      })
      .eq("id", started ?? "__none__");
    return { taskId, status: "failed" };
  }
}

/**
 * 后台/前台创建节点落库后触发补全（fire-and-forget，不阻塞请求返回）。
 * 仅在信息未变化时跳过，避免重复调用大模型。
 */
export function enqueueEnrich(id: string, opts?: { force?: boolean }): void {
  void runEventEnrich(id, { force: opts?.force === true });
}