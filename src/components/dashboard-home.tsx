"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Radar, ArrowRight } from "lucide-react";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { BrandLogo } from "@/components/brand-logo";

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
  calendar_warning?: string | null;
}

/* 重要级标签：统一品牌红 / 暖金 / 墨灰，不再散落临时色值 */
const IMPORTANCE_STYLE: Record<string, string> = {
  S: "bg-[var(--brand)] text-white",
  A: "bg-[var(--gold)] text-white",
  B: "bg-[var(--muted-foreground)] text-white",
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
  const [greeting, setGreeting] = useState("");
  const [todayLabel, setTodayLabel] = useState("");

  useEffect(() => {
    // 问候语与日期在挂载后计算，避免服务端/客户端渲染不一致
    const now = new Date();
    const h = now.getHours();
    setGreeting(h < 6 ? "凌晨好" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好");
    const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
    setTodayLabel(`${now.getMonth() + 1}月${now.getDate()}日 星期${week}`);
  }, []);

  useEffect(() => {
    fetch("/api/home/preview")
      .then((r) => {
        if (!r.ok) throw new Error("首页预览加载失败");
        return r.json();
      })
      .then((d) => d && setPreview(d))
      .catch(() => setError("首页预览加载失败"));
  }, []);

  return (
    <div className="space-y-6">
      {/* ===== 品牌欢迎区 ===== */}
      <section className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-6 py-5 [box-shadow:var(--card-shadow)]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--brand)]/[0.07] blur-2xl" />
          <div className="absolute -bottom-24 left-1/3 h-44 w-72 rounded-full bg-[var(--gold)]/[0.10] blur-2xl" />
        </div>
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)]">
            <BrandLogo variant="mark" height={34} />
          </div>
          <div className="min-w-0">
            <h1 className="font-serif text-xl font-bold leading-tight text-[var(--foreground)]">
              广州日报 AI 新闻辅助工作台
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {greeting}
              {todayLabel ? ` · ${todayLabel}` : ""} · 未来节点与最新线索一屏速览，点击进入对应模块处理。
            </p>
          </div>
        </div>
      </section>

      {error && <p className="text-xs text-[var(--destructive)] -mt-2">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== 未来新闻节点 ===== */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                <CalendarDays className="w-4 h-4" />
              </span>
              未来{preview?.home_days ?? 7}天新闻节点
            </CardTitle>
            <Link href="/calendar" className="text-xs text-[var(--brand)] hover:underline flex items-center gap-0.5">
              查看全部 <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {error ? (
              <ErrorState title="首页预览加载失败" message={error} className="py-6" />
            ) : !preview ? (
              <PageSkeleton lines={3} cards={0} withHeader={false} className="py-2" />
            ) : preview.calendar_warning ? (
              <ErrorState title="新闻节点加载失败" message={preview.calendar_warning} className="py-6" />
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
                    <span className="text-sm font-medium truncate group-hover:text-[var(--brand)]">
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
            <CardTitle className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                <Radar className="w-4 h-4" />
              </span>
              最新新闻线索
            </CardTitle>
            <Link href="/leads" className="text-xs text-[var(--brand)] hover:underline flex items-center gap-0.5">
              查看全部 <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {error ? (
              <ErrorState title="首页预览加载失败" message={error} className="py-6" />
            ) : !preview ? (
              <PageSkeleton lines={3} cards={0} withHeader={false} className="py-2" />
            ) : preview.latest_leads.length > 0 ? (
              preview.latest_leads.slice(0, preview.show_leads).map((l) => (
                <Link
                  key={l.id}
                  href="/leads"
                  className="flex flex-col gap-0.5 px-1 py-2 rounded hover:bg-[var(--accent)] group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate group-hover:text-[var(--brand)]">
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
