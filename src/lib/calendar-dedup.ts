import "server-only";
import { supabase } from "@/lib/db";
import type { DateStatus } from "./calendar-history";

/**
 * 候选去重：规则层（确定性）+ AI 语义层（可选）。
 * 设计原则：重复是"合并"而非"删除"——非主候选标记 merged 并指向主候选，
 * 主候选累积 merged_sources 记录所有来源。
 */

export interface CandidateLike {
  id: string;
  node_name: string;
  target_year: number;
  candidate_date: string | null;
  candidate_month: number | null;
  date_status: DateStatus;
  category_id: string | null;
  region: string | null;
  importance: string | null;
  source_type: string;
  source_detail: string | null;
  dedup_status: string;
  merged_sources: unknown;
  review_status: string;
  created_at: string;
}

/** 归一化名称：去标点/空白、转小写、CJK 保留 */
export function normalizeName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[，,。.、·、;；:：!！?？"'”’()（）\[\]【】《》<>_—\-/\\|]/g, "")
    .trim();
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

/** 时间是否对齐（同精度 + 合理接近） */
function timeAligns(a: CandidateLike, b: CandidateLike): boolean {
  if (a.date_status === "confirmed" && b.date_status === "confirmed") {
    if (a.candidate_date && b.candidate_date) {
      return Math.abs(diffDays(a.candidate_date, b.candidate_date)) <= 7;
    }
    return false;
  }
  if (a.date_status === "month_known" && b.date_status === "month_known") {
    return (a.candidate_month ?? -1) === (b.candidate_month ?? -1);
  }
  if (a.date_status === "unknown" && b.date_status === "unknown") return true;
  // 不同精度（如 confirmed vs unknown）不视为规则层重复，避免误并
  return false;
}

/** 最长公共子串长度（连续），用于识别"同一事件的不同表述" */
function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  let max = 0;
  // 仅做字符级 DP（名称不长，足够）
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > max) max = dp[j];
      } else {
        dp[j] = 0;
      }
      prev = tmp;
    }
  }
  return max;
}

/**
 * 名称是否指向同一事件：
 *  - 归一化后相等 / 互为子串（处理"广交会" vs "广交会（春季）"）
 *  - 或存在足够长的公共子串（处理"第138届中国进出口商品交易会（广交会）" vs "广交会（第138届）"）
 *    阈值：公共子串长度 ≥ max(4, 较短名的 50%)，既容错别名又避免"全国两会"与"广交会"误判。
 */
function nameLikelySame(na: string, nb: string): boolean {
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const minLen = Math.min(na.length, nb.length);
  if (minLen === 0) return false;
  const threshold = Math.max(4, Math.floor(minLen * 0.5));
  return longestCommonSubstring(na, nb) >= threshold;
}

/**
 * 两个候选是否为规则层（疑似）重复。
 * 判定至少结合：名称语义 + 时间 + 地区 + 分类。
 *  - 名称：归一化后相等/包含/足够长公共子串
 *  - 时间：同精度且日期±7天 / 同月 / 同为 unknown
 *  - 地区：双方都已知时必须一致
 *  - 分类：双方都已知时必须一致
 * 仅当四维度同时满足才判为疑似重复，避免"全国两会"与"广交会"这类误判。
 */
export function isRuleDuplicate(a: CandidateLike, b: CandidateLike): boolean {
  if (a.id === b.id) return false;
  if (a.target_year !== b.target_year) return false;

  const na = normalizeName(a.node_name);
  const nb = normalizeName(b.node_name);
  if (!na || !nb) return false;
  const nameMatch = nameLikelySame(na, nb);
  if (!nameMatch) return false;

  if (!timeAligns(a, b)) return false;

  // 地区：双方都已知则必须一致
  if (a.region && b.region && a.region !== b.region) return false;
  // 分类：双方都已知则必须一致
  if (a.category_id && b.category_id && a.category_id !== b.category_id) return false;

  return true;
}

/**
 * 候选入库后增量去重：对新插入的候选，在现有候选池中找规则层重复的主候选，
 * 命中则把新候选标为 dedup_status="duplicate" 并指向主候选（merged_into_id）。
 * 用户后续通过"查看对比 / 合并 / 保留两条"处理。
 * 已标记 kept（用户保留）的候选不参与。
 */
export async function flagDuplicatesForNew(
  ids: string[],
  targetYear: number,
): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const db = supabase();
  const { data: news, error } = await db
    .schema("public")
    .from("calendar_candidate")
    .select("*")
    .in("id", ids);
  if (error || !news || news.length === 0) return {};

  const { data: pool, error: pe } = await db
    .schema("public")
    .from("calendar_candidate")
    .select("*")
    .eq("target_year", targetYear)
    .in("review_status", ["pending", "merged", "confirmed"])
    .neq("dedup_status", "kept");
  if (pe) return {};

  const newCands = news as unknown as CandidateLike[];
  const poolCands = (pool ?? []) as unknown as CandidateLike[];

  const result: Record<string, string> = {};
  for (const c of newCands) {
    if (c.dedup_status === "kept") continue;
    let primary: CandidateLike | undefined;
    for (const p of poolCands) {
      if (p.id === c.id) continue;
      if (p.dedup_status === "kept") continue;
      if (isRuleDuplicate(c, p)) {
        primary = p;
        break;
      }
    }
    if (primary) {
      await db
        .schema("public")
        .from("calendar_candidate")
        .update({ dedup_status: "duplicate", merged_into_id: primary.id })
        .eq("id", c.id);
      result[c.id] = primary.id;
    }
  }
  return result;
}

const SOURCE_PRIORITY: Record<string, number> = {
  historical_migration: 0,
  manual: 1,
  pasted_text: 2,
  ai_supplement: 3,
};
const STATUS_PRIORITY: Record<string, number> = {
  confirmed: 0,
  month_known: 1,
  unknown: 2,
};

/** 选主候选：时间精度高 > 来源权威 > 创建早 */
function pickPrimary(group: CandidateLike[]): CandidateLike {
  return [...group].sort((a, b) => {
    const s = STATUS_PRIORITY[a.date_status] - STATUS_PRIORITY[b.date_status];
    if (s !== 0) return s;
    const p = (SOURCE_PRIORITY[a.source_type] ?? 9) - (SOURCE_PRIORITY[b.source_type] ?? 9);
    if (p !== 0) return p;
    return a.created_at < b.created_at ? -1 : 1;
  })[0];
}

export interface DedupCluster {
  primaryId: string;
  members: CandidateLike[];
}

/** 把所有 pending 候选按规则聚成重复簇（不落库，供预览） */
export function clusterCandidates(candidates: CandidateLike[]): DedupCluster[] {
  const pending = candidates.filter(
    (c) => c.review_status !== "rejected" && c.review_status !== "confirmed",
  );
  const visited = new Set<string>();
  const clusters: DedupCluster[] = [];
  for (const c of pending) {
    if (visited.has(c.id)) continue;
    const group: CandidateLike[] = [];
    for (const other of pending) {
      if (visited.has(other.id)) continue;
      if (isRuleDuplicate(c, other)) {
        group.push(other);
        visited.add(other.id);
      }
    }
    if (group.length > 1) {
      const primary = pickPrimary(group);
      clusters.push({ primaryId: primary.id, members: group });
    }
  }
  return clusters;
}

const SOURCE_LABEL: Record<string, string> = {
  historical_migration: "历史迁移",
  manual: "手动",
  pasted_text: "粘贴识别",
  ai_supplement: "AI补充",
};

/**
 * 执行规则去重：把簇内非主候选标记为 merged，指向主候选，
 * 主候选累积 merged_sources（来源标签数组）。
 */
export async function runRuleDedup(targetYear: number): Promise<{ clusters: number; merged: number }> {
  const db = supabase();
  const { data, error } = await db
    .schema("public")
    .from("calendar_candidate")
    .select("*")
    .eq("target_year", targetYear)
    .in("review_status", ["pending", "merged"])
    .neq("dedup_status", "duplicate")
    .neq("dedup_status", "kept");
  if (error) throw new Error(`读取候选失败: ${error.message}`);
  const candidates = (data ?? []) as unknown as CandidateLike[];

  const clusters = clusterCandidates(candidates);
  let merged = 0;

  for (const cluster of clusters) {
    const primary = cluster.members.find((m) => m.id === cluster.primaryId)!;
    const others = cluster.members.filter((m) => m.id !== cluster.primaryId);
    if (others.length === 0) continue;

    const sources: string[] = [];
    const addSource = (c: CandidateLike) => {
      const label = SOURCE_LABEL[c.source_type] ?? c.source_type;
      if (!sources.includes(label)) sources.push(label);
    };
    addSource(primary);
    for (const o of others) addSource(o);
    if (Array.isArray(primary.merged_sources)) {
      for (const s of primary.merged_sources as string[]) if (!sources.includes(s)) sources.push(s);
    }

    // 主候选：累积来源
    await db
      .schema("public")
      .from("calendar_candidate")
      .update({ merged_sources: sources })
      .eq("id", primary.id);

    // 其余：标记 merged
    for (const o of others) {
      await db
        .schema("public")
        .from("calendar_candidate")
        .update({
          dedup_status: "merged",
          merged_into_id: primary.id,
          merged_sources: [SOURCE_LABEL[o.source_type] ?? o.source_type],
        })
        .eq("id", o.id);
      merged++;
    }
  }

  return { clusters: clusters.length, merged };
}

/**
 * AI 语义去重（可选层）。当前受限于大模型调用配额时可由前端单独触发，
 * 不在常规流水线强制调用。返回结构化合并建议，由调用方决定是否落地。
 */
export interface SemanticDedupSuggestion {
  canonical_name: string;
  same_event: boolean;
  confidence: number;
}
export async function aiSemanticDedup(
  _pairs: Array<[CandidateLike, CandidateLike]>,
): Promise<SemanticDedupSuggestion[]> {
  // 占位：实际由 llm-client 批量判定。受 429 限制时返回空，调用方退化为规则层结果。
  return [];
}
