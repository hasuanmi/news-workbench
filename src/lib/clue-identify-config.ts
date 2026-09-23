import { getClueMonitorMediaIds } from "@/lib/active-media";
import type { PipelineFilter } from "@/lib/clue-pipeline";

/**
 * 线索识别（clue_identify）任务使用的“真实”过滤条件——单一事实来源。
 *
 * 与 src/lib/scheduler.ts 中 clue_identify 分支（约第 195-200 行）保持同一份配置：
 *   timeRange: "3d"
 *   mediaScope: "custom"
 *   customMediaIds: 所有 media.monitor_clue = true 的媒体（动态得出，当前 135 家）
 *   clueTypes: ["new_column"]
 *
 * runCluePipeline 内部的查询条件（is_test=false、clue_processed=false、publish_time>=窗口起点、
 * media_id IN 监测名单、order by publish_time desc、limit 100）即为“待识别文章”的口径。
 * 任何“待识别文章”统计都必须复用本文件，避免出现 24h / 3d 口径不一致。
 */

/**
 * 时间窗口：线索识别（clue_identify）任务与所有“待识别文章”统计的单一事实来源。
 * scheduler.ts 的 clue_identify 分支、run-summary 接口、buildClueIdentifyFilter 均引用本常量。
 * 调整识别时间窗口只需改这一处。
 */
export const CLUE_IDENTIFY_TIME_RANGE = "3d" as const;

export function clueTimeRangeLabel(range: string): string {
  switch (range) {
    case "24h":
      return "近24小时";
    case "3d":
      return "近3天";
    case "7d":
      return "近7天";
    default:
      return range;
  }
}

export function clueTimeRangeStart(range: string): Date | undefined {
  const now = new Date();
  if (range === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (range === "3d") return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // custom 由调用方自行处理
  return undefined;
}

/**
 * 构建与实际定时任务完全一致的 clue_identify 过滤条件。
 * 返回的 customMediaIds 为空时，调用方应自行决定是否降级（定时任务会抛错，本摘要仅作统计）。
 */
export async function buildClueIdentifyFilter(): Promise<PipelineFilter> {
  const mediaIds = await getClueMonitorMediaIds();
  return {
    timeRange: CLUE_IDENTIFY_TIME_RANGE,
    mediaScope: "custom",
    customMediaIds: mediaIds,
    clueTypes: ["new_column"],
  };
}

/**
 * 构建“待识别文章”的 article 查询（共享单一事实来源）。
 *
 * 自动任务（scheduler.ts clue_identify 分支）与 run-summary 接口都必须经由本函数取过滤条件，
 * 保证两者口径完全一致，杜绝 100 篇硬编码 / 时间窗口不一致的口径漂移。
 *
 * 固定过滤条件（与 runCluePipeline 内部逻辑完全一致）：
 *   is_test = false
 *   clue_processed = false
 *   publish_time >= 时间窗口起点（CLUE_IDENTIFY_TIME_RANGE）
 *   media_id IN mediaIds（默认 = media.monitor_clue=true 的 135 家；auto 任务显式传入同一份名单）
 *
 * opts.limit  ：用于流水线分批（每批 100）；不传则不限。
 * opts.count  ：true 时返回真实总数（select('id',{count:'exact',head:true}），不受 limit 钳制）。
 * opts.mediaIds：覆盖默认监测名单（手动按范围筛选时使用）。
 */
/**
 * 解析“待识别文章”的媒体范围（异步部分）：
 * 传入自定义名单则优先使用，否则回退 media.monitor_clue=true 的监测名单。
 */
export async function resolveClueIdentifyMediaIds(customMediaIds?: string[]): Promise<string[]> {
  if (customMediaIds && customMediaIds.length > 0) return customMediaIds;
  return await getClueMonitorMediaIds();
}

/**
 * ⚠️ 本函数必须保持同步，且调用方不能对返回值再 await：
 * Postgrest builder 本身是 thenable，await 会把它当 Promise 递归解包成 { data, error }
 * 结果对象，之后再调用 .order() / .not() 会抛 “xxx.order is not a function”。
 * 需要执行查询时，请显式 await 最终 builder（await buildClueIdentifyQuery(...)）。
 */
export function buildClueIdentifyQuery(
  db: any,
  opts?: { limit?: number; count?: boolean; mediaIds?: string[] }
): any {
  const mediaIds = opts?.mediaIds ?? [];
  const start = clueTimeRangeStart(CLUE_IDENTIFY_TIME_RANGE);
  let q = db
    .from("article")
    .select(
      opts?.count ? "id" : "id, title, content, media_id, publish_time, url",
      opts?.count ? { count: "exact", head: true } : {}
    )
    .eq("is_test", false)
    .eq("clue_processed", false);
  if (start) q = q.gte("publish_time", start.toISOString());
  if (mediaIds.length) q = q.in("media_id", mediaIds);
  if (opts?.limit !== undefined) q = q.limit(opts.limit);
  return q;
}
