import { supabase } from "@/lib/db";

/**
 * 新闻线索监测名单 = 所有 media.monitor_clue = true 的媒体。
 *
 * 业务语义（用户澄清，2026-09-18）：
 * - monitor_clue = true 表示"该媒体属于新闻线索监测名单"，名单内所有媒体都应纳入监测目标。
 * - 当前只有 3 家抓取链路稳定（采集覆盖不足），但"采集未覆盖"不等于"排除出监测范围"；
 *   没有真实文章的媒体应视为"采集未成功 / 未覆盖"，而非剔除。
 * - 因此线索识别范围直接由 monitor_clue=true 动态得出（不硬编码、不依赖任何固定 3 家的配置）。
 * - 历史配置 clue.auto_monitor_media 已废弃；现仅保留 clue.auto_collected_media 用于标注
 *   "当前已接入自动采集的媒体"（采集覆盖率统计用），不可替代 monitor_clue 的监测语义，也不用于限定识别范围。
 */
export async function getClueMonitorMediaIds(): Promise<string[]> {
  const { data, error } = await supabase()
    .from("media")
    .select("id")
    .eq("monitor_clue", true);
  if (error) throw new Error(`读取线索监测名单失败: ${error.message}`);
  return (data ?? []).map((m) => m.id);
}
