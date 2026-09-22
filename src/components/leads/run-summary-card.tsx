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
    error: string | null;
  };
  pendingArticles24h: number | null;
  identification?: { deepseekCalls?: number } | null;
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
      <span className="font-semibold text-[#1f1b16] tabular-nums">{value}</span>
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
  const { scrape, connectedMediaCount, pendingArticles24h, identification } = data;
  return (
    <div className="mb-4 rounded-lg border border-[#e8e2d8] bg-white p-3" aria-label="运行摘要">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-[#1f1b16]">运行摘要</span>
        <Link
          href="/admin/media"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-[#b3392f] hover:underline"
        >
          查看全部数据源
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm">
        <Stat label="监测媒体总数" value={connectedMediaCount} />
        <Stat label="本轮成功抓取" value={scrape.successfulMedia} />
        <Stat label="异常 / 未成功" value={scrape.failedMedia} />
        <Stat label="抓取文章" value={scrape.articles} />
        <Stat label="待识别文章" value={pendingArticles24h ?? "—"} />
        <Stat label="DeepSeek 调用" value={identification?.deepseekCalls ?? "—"} suffix="次" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[#f0ece3] pt-2.5 text-xs text-[#6b6257]">
        <span>最近运行：{formatRunTime(scrape)}</span>
        <StatusBadge status={scrape.status} />
        {scrape.error && <span className="text-red-700">· {scrape.error}</span>}
      </div>
    </div>
  );
}
