"use client";

import Link from "next/link";

type RunSummaryData = {
  connectedMediaCount: number;
  scrape: {
    status: string;
    phase: string | null;
    startedAt: string | null;
    endedAt: string | null;
    articles: number;
    successfulMedia: number;
    failedMedia: number;
    successfulSources: number | null;
    failedSources: number | null;
    successfulTasks: number;
    failedTasks: number;
    sourceIdentityVerified: boolean;
    error: string | null;
    diagnosis?: { stage: string; reason: string; aiEntered: boolean };
    runId?: string | null;
  };
  pendingArticles: number | null;
  pendingWindow?: string;
  pendingWindowLabel?: string;
  pendingMediaScope?: number;
  pendingError?: string | null;
  identification?: {
    deepseekCalls?: number;
    batchCount?: number;
    totalProcessed?: number;
    totalFetched?: number;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  success: "成功",
  failed: "失败",
  running: "运行中",
  interrupted: "已中断",
  skipped: "已跳过",
  unknown: "暂无记录",
};

const STATUS_DOT: Record<string, string> = {
  success: "bg-green-500",
  failed: "bg-red-500",
  running: "bg-amber-500",
  interrupted: "bg-gray-400",
  skipped: "bg-gray-300",
  unknown: "bg-gray-300",
};

const STATUS_TEXT: Record<string, string> = {
  success: "text-green-700",
  failed: "text-red-700",
  running: "text-amber-700",
  interrupted: "text-gray-600",
  skipped: "text-gray-500",
  unknown: "text-gray-500",
};

function Stat({ label, value, suffix }: { label: string; value: React.ReactNode; suffix?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[#8a8275]">{label}</span>
      <span className="font-semibold text-[var(--foreground)] tabular-nums">{value}</span>
      {suffix && <span className="text-[#8a8275]">{suffix}</span>}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const dot = STATUS_DOT[status] ?? STATUS_DOT.unknown;
  const text = STATUS_TEXT[status] ?? STATUS_TEXT.unknown;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span className={`inline-flex items-center gap-1 ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function formatRunTime(run: RunSummaryData["scrape"]): string {
  const t = run.endedAt || run.startedAt;
  if (!t) return "暂无记录";
  try {
    return new Date(t).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function RunSummaryCard({ data }: { data: RunSummaryData }) {
  const { scrape, connectedMediaCount, pendingArticles, pendingWindowLabel, pendingMediaScope, identification } = data;
  return (
    <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-3" aria-label="运行摘要">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-[var(--foreground)]">运行摘要</span>
        <Link
          href="/admin/media"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--brand)] hover:underline"
        >
          查看全部数据源
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm">
        <Stat label="监测媒体总数" value={connectedMediaCount} />
        <Stat label={scrape.sourceIdentityVerified ? "成功数据源" : "成功任务（旧记录）"} value={scrape.successfulSources ?? scrape.successfulTasks} />
        <Stat label={scrape.sourceIdentityVerified ? "未成功数据源" : "未成功任务（旧记录）"} value={scrape.failedSources ?? scrape.failedTasks} />
        <Stat label="抓取文章" value={scrape.articles} />
        <Stat label="待识别文章" value={pendingArticles ?? "—"} suffix={pendingWindowLabel ? `（${pendingWindowLabel}）` : ""} />
        <Stat label="本轮处理" value={scrape.diagnosis?.aiEntered === false ? 0 : identification?.totalFetched ?? identification?.totalProcessed ?? "—"} suffix="篇" />
        <Stat label="识别批次" value={scrape.diagnosis?.aiEntered === false ? 0 : identification?.batchCount ?? "—"} suffix="批" />
        <Stat label="AI 调用" value={scrape.diagnosis?.aiEntered === false ? 0 : identification?.deepseekCalls ?? "—"} suffix="次" />
      </div>
      {scrape.diagnosis && <div className="mt-2 space-y-1 text-xs" aria-label="运行阶段诊断">
        <p className="font-medium">{scrape.diagnosis.stage}</p>
        <p className="text-[var(--muted-foreground)]">{scrape.diagnosis.reason}</p>
        <p className="text-[var(--muted-foreground)]">{scrape.sourceIdentityVerified ? "抓取数量按 source_id 去重，同一家媒体可能有多个源。" : "旧记录缺少 source_id，任务次数不能视为独立数据源覆盖数。"}</p>
      </div>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[#f0ece3] pt-2.5 text-xs text-[var(--muted-foreground)]">
        <span>最近运行：{formatRunTime(scrape)}</span>
        <StatusBadge status={scrape.status} />
        {scrape.error && <span className="text-red-700">· {scrape.error}</span>}
      </div>
      {pendingMediaScope !== undefined && (
        <div className="mt-1.5 text-[11px] text-[#9a9183]">
          待识别范围：{pendingWindowLabel} · {pendingMediaScope} 家监测媒体 · 仅统计尚未识别的正式文章
        </div>
      )}
    </div>
  );
}
