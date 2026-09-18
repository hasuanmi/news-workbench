"use client";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Play, Save, RefreshCw, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Job {
  name: string;
  title: string;
  description: string;
  defaultCron: string;
  enabled: boolean;
  cron: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastSuccessAt: string | null;
  lastProcessedCount: number | null;
  lastError: string | null;
  nextRunAt: string | null;
  autoScheduled: boolean;
}

interface JobLog {
  id: string;
  workflow_name: string;
  status: string;
  start_time: string;
  end_time: string | null;
  source_count: number;
  success_count: number;
  failure_count: number;
  new_data_count: number;
  error_message: string | null;
}

const JOB_TITLES: Record<string, string> = {
  calendar_recommend: "日历 AI 推荐",
  clue_identify: "新闻线索识别",
  weekly_briefing: "每周简报",
  daily_review: "每日评报",
};

const CRON_HINTS: { match: (c: string) => boolean; label: string }[] = [
  { match: (c) => /^0 9 \* \* \*$/.test(c), label: "每天 09:00" },
  { match: (c) => /^0 10 \* \* 1$/.test(c), label: "每周一 10:00" },
  { match: (c) => /^30 10 \* \* \*$/.test(c), label: "每天 10:30" },
];

function cronHint(cron: string): string {
  return CRON_HINTS.find((h) => h.match(cron))?.label ?? "自定义";
}

function fmtTime(t: string | null): string {
  if (!t) return "—";
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function fmtLongTime(t: string | null): string {
  if (!t) return "—";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
    2,
    "0"
  )} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function duration(start: string, end: string | null): string {
  if (!end) return "进行中…";
  const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

export default function SchedulerAdminPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [autoScheduled, setAutoScheduled] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/scheduler");
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs);
        setLogs(data.logs);
        setAutoScheduled(data.autoScheduled);
        setServerMessage(data.message ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateJob = (name: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.name === name ? { ...j, ...patch } : j)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const jobsPayload: Record<string, { enabled: boolean; cron: string }> = {};
      for (const j of jobs) jobsPayload[j.name] = { enabled: j.enabled, cron: j.cron };
      const res = await fetch("/api/admin/scheduler", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: jobsPayload }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("定时任务配置已保存");
      } else {
        toast.error(data.error || "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (name: string) => {
    setRunningJob(name);
    try {
      const res = await fetch("/api/admin/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: name }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.summary || "任务执行成功");
      } else {
        toast.error(data.error || data.summary || "任务执行失败");
      }
      await load();
    } finally {
      setRunningJob(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-serif text-2xl font-bold">定时任务状态</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            查看新闻日历推荐、新闻线索识别、每周简报和每日评报的执行记录。
            自动状态和下次时间以实际触发器为准；「立即执行」用于手动补跑。
          </p>
        </header>

        {/* 自动运行状态横幅（明确告知是否真的会每天自动执行） */}
        <Card className={autoScheduled ? "border-[var(--success)]/40 bg-[var(--success)]/5" : "border-[var(--warning)]/40 bg-[var(--warning)]/5"}>
          <CardContent className="py-3 text-sm flex items-start gap-2">
            <span className="text-lg leading-none mt-0.5">{autoScheduled ? "✅" : "⚠️"}</span>
            <div>
              {autoScheduled ? (
                <p className="font-medium text-slate-700">真实自动触发器已安装：已核对 Windows 任务记录，执行结果以下方日志为准。</p>
              ) : (
                <p className="font-medium text-[var(--warning)]">
                  自动运行尚未验证：系统本身不会启动定时器。请先使用「立即执行」验收，再核对外部定时调用。
                </p>
              )}
              <p className="mt-1 text-slate-500">{serverMessage}</p>
            </div>
          </CardContent>
        </Card>

        {!autoScheduled && (
          <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/5">
            <CardContent className="py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--muted-foreground)]">
              <span>正式部署后请在服务器配置 crontab，定时调用</span>
              <code className="px-1.5 bg-[var(--secondary)] rounded">/api/cron/{"{job}"}</code>
              <span>（需环境变量</span>
              <code className="px-1.5 bg-[var(--secondary)] rounded">CRON_SECRET</code>
              <span>, 与后台密钥 <code className="px-1.5 bg-[var(--secondary)] rounded">ingest.api_token</code> / 抓取端保持一致）。完整方案见 DEPLOY.md「定时任务」。</span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" /> 任务调度与运行状态
            </CardTitle>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? "保存中…" : "保存配置"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-[var(--muted-foreground)]">加载中…</p>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.name}
                  className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 p-3 rounded-md border border-[var(--border)]"
                >
                  <div className="flex items-center gap-3 lg:w-60 shrink-0">
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={(v) => updateJob(job.name, { enabled: v })}
                    />
                    <div>
                      <div className="text-sm font-medium">{job.title}</div>
                      <Badge variant={job.enabled ? "default" : "secondary"} className="mt-1 text-[10px]">
                        {!job.enabled ? "已停用" : job.autoScheduled ? "真实自动触发已安装" : "仅支持手动触发"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--muted-foreground)]">{job.description}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-[var(--muted-foreground)]">
                      <span className="flex items-center gap-1">
                        执行时间：
                        <Input
                          value={job.cron}
                          disabled={job.autoScheduled}
                          onChange={(e) => updateJob(job.name, { cron: e.target.value })}
                          className="h-7 text-xs font-mono w-36 inline-flex"
                          placeholder="分 时 日 月 周"
                        />
                      </span>
                      <span>{cronHint(job.cron)}</span>
                      <span className="flex items-center gap-1">
                        下一次执行：<b>{job.nextRunAt ? fmtLongTime(job.nextRunAt) : "—"}</b>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--muted-foreground)]">
                      <span>最近执行：{job.lastRunAt ? fmtLongTime(job.lastRunAt) : "从未执行"}</span>
                      <span>
                        最近成功：
                        {job.lastSuccessAt ? fmtLongTime(job.lastSuccessAt) : "—"}
                      </span>
                      <span>
                        最近处理：{job.lastProcessedCount !== null ? `${job.lastProcessedCount} 篇` : "—"}
                      </span>
                      {job.lastError && (
                        <span className="text-[var(--destructive)]">最近错误：{job.lastError}</span>
                      )}
                      {job.lastRunStatus === "failed" && (
                        <span className="text-[var(--destructive)]">最近一次失败</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => runNow(job.name)}
                    disabled={runningJob !== null}
                  >
                    {runningJob === job.name ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-1" />
                    )}
                    立即执行一次
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> 运行日志
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1" /> 刷新
            </Button>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">暂无运行记录。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--muted-foreground)] border-b border-[var(--border)]">
                      <th className="py-2 pr-3 font-medium">任务</th>
                      <th className="py-2 pr-3 font-medium">状态</th>
                      <th className="py-2 pr-3 font-medium">开始</th>
                      <th className="py-2 pr-3 font-medium">耗时</th>
                      <th className="py-2 pr-3 font-medium">处理/新增</th>
                      <th className="py-2 pr-3 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-[var(--border)]/60">
                        <td className="py-2 pr-3">{JOB_TITLES[log.workflow_name] ?? log.workflow_name}</td>
                        <td className="py-2 pr-3">
                          {log.status === "success" ? (
                            <span className="inline-flex items-center gap-1 text-[var(--success)] text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 成功
                            </span>
                          ) : log.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 text-[var(--destructive)] text-xs">
                              <XCircle className="w-3.5 h-3.5" /> 失败
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--warning)] text-xs">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 运行中
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs">{fmtTime(log.start_time)}</td>
                        <td className="py-2 pr-3 text-xs">{duration(log.start_time, log.end_time)}</td>
                        <td className="py-2 pr-3 text-xs">
                          {log.source_count > 0 ? `${log.source_count}` : "—"}
                          {log.new_data_count > 0 ? ` / ${log.new_data_count}` : ""}
                        </td>
                        <td className="py-2 pr-3 text-xs text-[var(--muted-foreground)] max-w-xs truncate">
                          {log.error_message || (log.status === "success" ? "正常完成" : "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
