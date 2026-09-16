"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  LayoutDashboard,
  CalendarDays,
  Radar,
  FileText,
  Settings,
  Newspaper,
  LogOut,
  Loader2,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { LLMSettingsDialog } from "@/components/llm-settings-dialog";
import { PageTransition } from "@/components/common/page-transition";

const navItems = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/calendar", label: "新闻日历", icon: CalendarDays },
  { href: "/leads", label: "新闻线索", icon: Radar },
  { href: "/review", label: "每日评报", icon: FileText },
  { href: "/admin", label: "系统管理", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);
  const [llmConnected, setLlmConnected] = useState(false);

  useEffect(() => {
    // 检查 LLM 配置状态
    fetch("/api/admin/llm")
      .then((res) => res.json())
      .then((data) => setLlmConnected(data.enabled))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const visibleNav = navItems;

  return (
    <div className="min-h-screen flex">
      {/* 侧边导航 */}
      <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-[var(--border)]">
          <div className="w-8 h-8 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center">
            <Newspaper className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <div className="font-serif font-bold text-sm">新闻工作台</div>
            <div className="text-[11px] text-[var(--muted-foreground)]">广州日报</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)] font-medium"
                    : "text-[var(--foreground)] hover:bg-[var(--accent)]"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--border)] space-y-2">
          {/* 接入大模型按钮（登录用户通用） */}
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setLlmDialogOpen(true)}
          >
            <Bot className="w-4 h-4" />
            {llmConnected ? "模型已连接" : "接入大模型"}
          </Button>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] px-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中
            </div>
          ) : user ? (
            <>
              <div className="px-2 text-xs">
                <div className="font-medium">{user.displayName}</div>
                <Badge variant="outline" className="mt-1 text-[10px] h-5">管理员</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-[var(--muted-foreground)]"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </Button>
            </>
          ) : null}
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto px-8 py-6">
          <PageTransition contentKey={pathname}>{children}</PageTransition>
        </div>
      </main>

      {/* 大模型设置弹窗 */}
      <LLMSettingsDialog
        open={llmDialogOpen}
        onOpenChange={setLlmDialogOpen}
        onConfigured={() => setLlmConnected(true)}
      />
    </div>
  );
}
