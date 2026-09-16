"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Radar, ArrowRight } from "lucide-react";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { EmptyState } from "@/components/common/empty-state";

interface UpcomingNode {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  importance: string;
  anniversary: number | null;
}

interface LeadsItem {
  id: string;
  media_name: string;
  column_name: string;
  first_found_at: string;
}

interface HomePreview {
  show_upcoming: number;
  show_leads: number;
  home_days: number;
  upcoming: UpcomingNode[];
  latest_leads: LeadsItem[];
}

const IMPORTANCE_STYLE: Record<string, string> = {
  S: "bg-[#b3392f] text-white",
  A: "bg-[#c87f2d] text-white",
  B: "bg-[#6b6257] text-white",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DashboardHome() {
  const [preview, setPreview] = useState<HomePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/home/preview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPreview(d))
      .catch(() => setError("首页预览加载失败"));
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl font-bold">工作台首页</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          未来节点与最新线索一屏速览，点击进入对应模块处理。
        </p>
        {error && <p className="text-xs text-[#b3392f] mt-2">{error}</p>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== 未来新闻节点 ===== */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-[var(--muted-foreground)] flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> 未来{preview?.home_days ?? 7}天新闻节点
            </CardTitle>
            <Link href="/calendar" className="text-xs text-[#b3392f] hover:underline flex items-center gap-0.5">
              查看全部 <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {!preview ? (
              <PageSkeleton lines={3} cards={0} withHeader={false} className="py-2" />
            ) : preview.upcoming.length > 0 ? (
              preview.upcoming.slice(0, preview.show_upcoming).map((n) => (
                <Link
                  key={n.id}
                  href="/calendar"
                  className="flex items-center justify-between gap-3 px-1 py-2 rounded hover:bg-[var(--accent)] group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-10 shrink-0 text-xs text-[var(--muted-foreground)]">
                      {formatDate(n.date)}
                    </span>
                    <span className="text-sm font-medium truncate group-hover:text-[#b3392f]">
                      {n.name}
                      {n.anniversary ? (
                        <span className="text-[var(--muted-foreground)] text-xs ml-1">
                          {n.anniversary}周年
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <span
                    className={`w-5 h-5 shrink-0 rounded text-[11px] flex items-center justify-center ${
                      IMPORTANCE_STYLE[n.importance] ?? IMPORTANCE_STYLE.B
                    }`}
                  >
                    {n.importance}
                  </span>
                </Link>
              ))
            ) : (
              <EmptyState
                className="py-6"
                title="当前时间范围暂无节点"
                description="未来数日内暂无已确定日期的重要新闻节点"
              />
            )}
          </CardContent>
        </Card>

        {/* ===== 最新新闻线索（新栏目） ===== */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-[var(--muted-foreground)] flex items-center gap-2">
              <Radar className="w-4 h-4" /> 最新新闻线索
            </CardTitle>
            <Link href="/leads" className="text-xs text-[#b3392f] hover:underline flex items-center gap-0.5">
              查看全部 <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {!preview ? (
              <PageSkeleton lines={3} cards={0} withHeader={false} className="py-2" />
            ) : preview.latest_leads.length > 0 ? (
              preview.latest_leads.slice(0, preview.show_leads).map((l) => (
                <Link
                  key={l.id}
                  href="/leads"
                  className="flex flex-col gap-0.5 px-1 py-2 rounded hover:bg-[var(--accent)] group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate group-hover:text-[#b3392f]">
                      {l.column_name}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)] shrink-0">
                      {formatDateTime(l.first_found_at)}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)] ml-1">{l.media_name}</span>
                </Link>
              ))
            ) : (
              <EmptyState
                className="py-6"
                title="今天暂未发现新栏目"
                description="最新识别出的新栏目线索会展示在这里"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}