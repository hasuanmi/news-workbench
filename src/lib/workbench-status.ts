import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabase } from "@/lib/db";
import { getLocalTriggers } from "@/lib/local-triggers";

export interface WorkbenchTaskStatus {
  time: string | null;
  status: string;
  detail: string;
}
interface Journal {
  started_at: string;
  ended_at?: string;
  status: string;
  steps?: { name: string; status: string; ended_at?: string }[];
}
async function journal(name: string): Promise<Journal | null> {
  try { return JSON.parse(await readFile(path.join(process.cwd(), "logs", "scheduler", `${name}-latest.json`), "utf8")); }
  catch { return null; }
}

export async function getWorkbenchTasks() {
  const db = supabase();
  const [calendar, ingest, localCalendar, localMedia, triggers] = await Promise.all([
    db.from("task_log").select("start_time,status,new_data_count").eq("workflow_name", "calendar_recommend").order("start_time", { ascending: false }).limit(1).maybeSingle(),
    db.from("task_log").select("start_time,status,new_data_count").eq("workflow_name", "ingest").order("start_time", { ascending: false }).limit(1).maybeSingle(),
    journal("calendar_recommend"), journal("media_then_clues"), getLocalTriggers(),
  ]);
  function status(kind: "calendar" | "media"): WorkbenchTaskStatus {
    const result = kind === "calendar" ? calendar : ingest;
    const local = kind === "calendar" ? localCalendar : localMedia;
    const trigger = triggers[kind === "calendar" ? "calendar_recommend" : "clue_identify"];
    let latest: WorkbenchTaskStatus = result.data ? {
      time: result.data.start_time, status: result.data.status,
      detail: `${kind === "calendar" ? "新增节点" : "单次入库"} ${result.data.new_data_count ?? 0} 条`,
    } : { time: null, status: result.error ? "unknown" : "none", detail: result.error ? "执行记录暂时无法读取" : "暂无执行记录" };
    const newer = (time: string) => !latest.time || Date.parse(time) >= Date.parse(latest.time);
    if (local && newer(local.ended_at ?? local.started_at)) {
      const steps = (local.steps ?? []).filter(step => step.name === "media_fetch");
      const ok = steps.filter(step => step.status === "success").length;
      const failed = steps.filter(step => step.status === "failed").length;
      const running = steps.some(step => step.status === "running");
      const status = kind === "media" && steps.length
        ? running ? "unknown" : failed ? ok ? "partial" : "failed" : "success"
        : local.status === "running" ? "unknown" : local.status;
      latest = { time: local.started_at, status, detail: kind === "media" && steps.length
        ? `抓取成功 ${ok} / ${steps.length} 个数据源${running ? "，完成状态待核实" : ""}`
        : status === "failed" ? "本地任务执行失败，请查看任务日志" : status === "unknown" ? "尚无完成记录，请核实任务状态" : latest.detail };
    }
    if (trigger?.lastDispatchAt && newer(trigger.lastDispatchAt) && trigger.lastResult !== 0) {
      latest = { time: trigger.lastDispatchAt, status: trigger.state === "Running" ? "running" : "failed",
        detail: trigger.state === "Running" ? "系统任务正在执行" : `系统任务未正常完成（${trigger.lastResult}）` };
    }
    return latest;
  }
  return { calendar: status("calendar"), media: status("media") };
}
