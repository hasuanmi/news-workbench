"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Radar, FileText, ShieldCheck, Database, Clock } from "lucide-react";

interface Stats {
  upcoming14d: number;
  reviewQueue: number;
  pendingNodes: number;
  mediaCount: number;
  todayLeads: number;
  isAdmin: boolean;
}

export function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => undefined);
  }, []);

  const cards = [
    {
      href: "/calendar",
      title: "未来14天重要节点",
      value: stats?.upcoming14d ?? "—",
      suffix: "个",
      icon: CalendarDays,
      desc: "进入14天提醒窗口的已启用节点",
    },
    {
      href: "/leads",
      title: "监测中的新闻线索",
      value: stats?.todayLeads ?? "—",
      suffix: "条",
      icon: Radar,
      desc: "工作流累计识别的媒体栏目/策划线索",
    },
    {
      href: "/review",
      title: "每日评报",
      value: "待建设",
      suffix: "",
      icon: FileText,
      desc: "M4 阶段上线：同题聚类、六维比较、自动评报",
      muted: true,
    },
  ];

  const adminCards = [
    {
      href: "/admin/review",
      title: "待审线索",
      value: stats?.reviewQueue ?? "—",
      suffix: "条",
      icon: ShieldCheck,
      desc: "AI 低置信度或人工录入，等待确认入库",
    },
    {
      href: "/admin/calendar",
      title: "待审日历节点",
      value: stats?.pendingNodes ?? "—",
      suffix: "条",
      icon: Clock,
      desc: "动态节点发现或分类不确定，等待审核",
    },
    {
      href: "/admin/media",
      title: "启用媒体",
      value: stats?.mediaCount ?? "—",
      suffix: "家",
      icon: Database,
      desc: "媒体池总数可在系统管理中维护",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl font-bold">工作台首页</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          新闻日历、新闻线索、每日评报三模块总览。配置驱动，规则可在后台调整。
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold text-[var(--muted-foreground)] mb-3">编辑视角</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link key={c.href} href={c.href}>
              <Card className="h-full hover:border-[var(--primary)] transition-colors">
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                    {c.title}
                  </CardTitle>
                  <c.icon className="w-4 h-4 text-[var(--muted-foreground)]" />
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold font-serif ${c.muted ? "text-lg text-[var(--muted-foreground)]" : ""}`}>
                    {c.value}
                    {!c.muted && <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">{c.suffix}</span>}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-2">{c.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {stats?.isAdmin && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--muted-foreground)] mb-3">管理员视角</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {adminCards.map((c) => (
              <Link key={c.href} href={c.href}>
                <Card className="h-full hover:border-[var(--primary)] transition-colors">
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                      {c.title}
                    </CardTitle>
                    <c.icon className="w-4 h-4 text-[var(--muted-foreground)]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-serif">
                      {c.value}
                      <span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">{c.suffix}</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-2">{c.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
