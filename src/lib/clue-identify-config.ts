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
