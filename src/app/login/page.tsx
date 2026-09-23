"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      const redirect = params.get("redirect") || "/";
      router.replace(redirect);
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-10">
      {/* 品牌氛围层：低透明度品牌红 / 暖金光晕（不拦截交互） */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-[var(--brand)]/10 blur-3xl" />
        <div className="absolute -bottom-28 -left-24 h-[460px] w-[460px] rounded-full bg-[var(--gold)]/15 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-[300px] w-[520px] -translate-x-1/2 rounded-full bg-[var(--brand)]/[0.06] blur-3xl" />
      </div>

      <div className="animate-page-in relative w-full max-w-[420px]">
        {/* ===== 品牌区：完整官方 logo + 产品名 ===== */}
        <div className="text-center">
          <BrandLogo variant="full" height={54} className="mx-auto" />
          <h1 className="mt-5 font-serif text-[26px] font-bold tracking-tight text-[var(--foreground)]">
            AI 新闻辅助工作台
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
            新闻日历 · 新闻线索 · 每日评报
          </p>
        </div>

        {/* ===== 轻玻璃卡 ===== */}
        <div className="brand-glass mt-7 rounded-[20px] p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs text-[var(--muted-foreground)]">
                账号
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入账号"
                autoComplete="username"
                required
                className="h-10 rounded-lg border-[var(--border)] bg-white/80"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs text-[var(--muted-foreground)]">
                密码
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                required
                className="h-10 rounded-lg border-[var(--border)] bg-white/80"
              />
            </div>
            {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
            {/* 品牌红 CTA */}
            <Button
              type="submit"
              className="h-10 w-full rounded-lg bg-[var(--brand)] text-white hover:bg-[var(--brand-deep)]"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              登录
            </Button>
            <p className="text-xs text-center text-[var(--muted-foreground)]">
              内部编辑工具，账号由管理员开通
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-[var(--muted-foreground)]/80">
          广州日报 · 内部系统
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
