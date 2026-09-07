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

function duration(start: string, end: string | null): string {
  if (!end) return "进行中…";
  const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

export default function SchedulerAdminPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [cronConfigured, setCronConfigured] = useState(false);
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
        setCronConfigured(data.cronConfigured);
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
          <h1 className="font-serif text-2xl font-bold">定时任务</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            配置线索识别、每周简报、每日评报的自动调度。到达 cron 时间后，由服务器定时器或外部 cron
            调用接口触发；也可在此手动立即执行。
          </p>
        </header>

        {!cronConfigured && (
          <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/5">
            <CardContent className="py-3 text-sm text-[var(--muted-foreground)]">
              未检测到 <code className="px-1 bg-[var(--secondary)] rounded">CRON_SECRET</code>{" "}
              环境变量。外部定时器调用 <code className="px-1 bg-[var(--secondary)] rounded">/api/cron/{"{job}"}</code>{" "}
              时需要此密钥鉴权；当前可使用「立即执行」手动触发。详见 DEPLOY.md。
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" /> 任务调度
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
                  className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3 rounded-md border border-[var(--border)]"
                >
                  <div className="flex items-center gap-3 md:w-64 shrink-0">
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={(v) => updateJob(job.name, { enabled: v })}
                    />
                    <div>
                      <div className="text-sm font-medium">{job.title}</div>
                      <Badge variant={job.enabled ? "default" : "secondary"} className="mt-1 text-[10px]">
                        {job.enabled ? "已启用" : "已停用"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--muted-foreground)]">{job.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={job.cron}
                        onChange={(e) => updateJob(job.name, { cron: e.target.value })}
                        className="h-8 text-xs font-mono w-40"
                        placeholder="分 时 日 月 周"
                      />
                      <span className="text-xs text-[var(--muted-foreground)]">{cronHint(job.cron)}</span>
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
                    立即执行
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
