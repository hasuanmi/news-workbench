import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Database, Settings, Newspaper, Radio } from "lucide-react";

const sections = [
  { href: "/admin/calendar", title: "日历节点管理", desc: "节点增删改、停用、分类调整、动态节点审核", icon: CalendarDays },
  { href: "/admin/categories", title: "日历分类管理", desc: "维护八大分类，新增/改名/停用分类", icon: Settings },
  { href: "/admin/media", title: "媒体与数据源", desc: "媒体池、电子报/官网地址、启用状态、PoC 状态", icon: Newspaper },
  { href: "/admin/review", title: "线索审核", desc: "AI 发现线索的人工审核（M3 启用工作流后生效）", icon: Radio },
  { href: "/admin/config", title: "系统配置", desc: "提醒窗口、置信度阈值、字数阈值、定时任务时间", icon: Database },
];

export default function AdminHome() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-serif text-2xl font-bold">系统管理</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            所有规则配置化，业务规则变化优先改配置与开关，不改主工作流。
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((s) => (
            <Link key={s.href} href={s.href}>
              <Card className="h-full hover:border-[var(--primary)] transition-colors">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <div className="w-10 h-10 rounded-md bg-[var(--secondary)] flex items-center justify-center">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--muted-foreground)]">{s.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
