export interface ScrapeRun {
  status?: string;
  phase?: string;
  started_at?: string;
  ended_at?: string;
  steps?: { name: string; status?: string; started_at?: string; ended_at?: string }[];
}

/** Only evidence belonging to this run can explain its failure. */
export function hasQueueConnectionFailure(log: string, run: ScrapeRun): boolean {
  if (!run.started_at) return false;
  const start = Date.parse(run.started_at), end = run.ended_at ? Date.parse(run.ended_at) : Infinity;
  return log.split(/\r?\n/).some(line => {
    // Python logger may prefix the timestamp with ANSI colour sequences.
    const timestamp = line.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
    if (!timestamp || !line.includes("[ingest]") || !line.includes("All connection attempts failed")) return false;
    const time = Date.parse(`${timestamp[1]}T${timestamp[2]}+08:00`);
    return time >= start && time <= end;
  });
}

export function diagnoseScrapeRun(run: ScrapeRun | null, connectionFailure = false) {
  const steps = run?.steps ?? [];
  const media = steps.filter(step => step.name === "media_fetch");
  const ai = steps.find(step => step.name === "clue_identify");
  if (!run) return { stage: "暂无抓取执行记录", reason: "尚不能判断媒体采集与 AI 识别是否执行。", aiEntered: false };
  if (ai) return {
    stage: ai.status === "failed" ? "媒体采集已执行 → AI 识别失败" : ai.status === "success" ? "媒体采集已执行 → AI 识别完成" : "媒体采集已执行 → AI 识别进行中",
    reason: ai.status === "failed" ? "失败发生在 AI 识别阶段，请查看该次识别记录。" : "以下识别数量仅对应本次抓取关联的任务。", aiEntered: true,
  };
  if (connectionFailure && media.length && media.every(step => step.status === "failed")) return {
    stage: "抓取队列读取失败 → 未进入媒体采集 → 未进入 AI 识别",
    reason: "抓取子进程无法连接主服务获取队列；不是所有媒体网站都没有新闻。修复连接后需要重新抓取，旧批次仍保留失败记录。", aiEntered: false,
  };
  if (run.phase === "main_health") return { stage: `${run.status === "running" ? "正在检查主服务" : "主服务健康检查失败"} → 未进入媒体采集 → 未进入 AI 识别`, reason: "任务已启动，但主服务尚未通过健康检查。", aiEntered: false };
  if (run.phase === "media_preflight" || run.phase === "queue_read") return {
    stage: `${run.phase === "media_preflight" ? "网络 / 代理准备" : "抓取队列读取"}${run.status === "running" ? "中" : "失败"} → 未进入媒体采集 → 未进入 AI 识别`,
    reason: "失败阶段来自本次任务的实际执行记录。", aiEntered: false,
  };
  if (media.length) return {
    stage: run.status === "running" ? "媒体采集中 → 尚未进入 AI 识别" : "媒体采集未成功完成 → 未进入 AI 识别",
    reason: "抓取步骤未产出可进入本轮识别流程的成功结果；请检查抓取日志。", aiEntered: false,
  };
  return { stage: "抓取准备阶段 → 未进入 AI 识别", reason: "尚无媒体抓取步骤记录，请检查任务开关、队列读取或网络准备阶段。", aiEntered: false };
}
