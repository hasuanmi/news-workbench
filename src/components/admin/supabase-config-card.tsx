"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { toast } from "sonner";

interface ConfigView {
  configured: boolean;
  url: string;
  projectRef: string | null;
  /** 后端只返回掩码，页面永远拿不到完整密钥 */
  serviceKeyMasked: string;
  backend: string;
  source: "process" | "file" | "none";
}

interface ProbeResult {
  ok: boolean;
  initialized: boolean;
  reason: "ok" | "not_initialized" | "bad_url" | "bad_key" | "network" | "unknown";
  message: string;
  projectRef: string | null;
  missingTables: string[];
  sqlEditorUrl: string | null;
}

const API = "/api/admin/config/supabase";

export function SupabaseConfigCard() {
  const [view, setView] = useState<ConfigView | null>(null);
  const [url, setUrl] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as ConfigView;
      setView(d);
      setUrl((prev) => (prev ? prev : d.url ?? ""));
    } catch {
      /* 静默：卡片会以「未配置」呈现 */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function runProbe(): Promise<ProbeResult | null> {
    if (!url.trim()) {
      toast.error("请先填写 Project URL");
      return null;
    }
    if (!serviceKey.trim()) {
      toast.error("请先填写 Service Role Key");
      return null;
    }
    setTesting(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", url: url.trim(), serviceRoleKey: serviceKey.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "测试连接失败");
        return null;
      }
      setProbe(d as ProbeResult);
      return d as ProbeResult;
    } catch {
      toast.error("测试连接失败，请稍后重试");
      return null;
    } finally {
      setTesting(false);
    }
  }

  async function handleTest() {
    const result = await runProbe();
    if (!result) return;
    if (result.ok && result.initialized) toast.success(result.message);
    else if (result.ok && !result.initialized) toast.warning("可以连接，但数据库尚未初始化");
    else toast.error(result.message);
  }

  async function handleSave() {
    if (!url.trim() || !serviceKey.trim()) {
      toast.error("请先填写 Project URL 与 Service Role Key");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", url: url.trim(), serviceRoleKey: serviceKey.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "保存失败");
        return;
      }
      toast.success(d.requiresRestart ? "已保存，重启服务后生效" : "已保存并立即生效，无需重启服务");
      setServiceKey("");
      setProbe((d.probe as ProbeResult) ?? null);
      await load();
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyInitSql() {
    try {
      const res = await fetch(`${API}?include=sql`, { cache: "no-store" });
      const d = await res.json();
      const sql = d?.initSql as string | undefined;
      if (!sql) {
        toast.error("未能读取初始化脚本，请联系管理员");
        return;
      }
      await navigator.clipboard.writeText(sql);
      toast.success("已复制，去 Supabase SQL Editor 粘贴运行即可");
    } catch {
      toast.error("复制失败，请稍后重试");
    }
  }

  const statusBadge = () => {
    if (!view?.configured) return <Badge variant="secondary">未配置</Badge>;
    if (probe && !probe.ok) return <Badge variant="destructive">连接异常</Badge>;
    if (probe && !probe.initialized) return <Badge variant="secondary">待初始化</Badge>;
    if (probe?.initialized) return <Badge variant="secondary">正常</Badge>;
    return <Badge variant="secondary">已配置</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="w-4 h-4" />
            数据库连接（Supabase）
          </CardTitle>
          {statusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Project URL</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxxxxxx.supabase.co"
            className="font-mono text-sm"
            autoComplete="off"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            在 Supabase 控制台 → Project Settings → Data API 复制。接口地址由它自动推导，无需另外填写。
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Service Role Key</Label>
          <div className="flex gap-2">
            <Input
              type={showKey ? "text" : "password"}
              value={serviceKey}
              onChange={(e) => setServiceKey(e.target.value)}
              placeholder={view?.serviceKeyMasked ? `已保存（${view.serviceKeyMasked}），重新输入可更换` : "粘贴 Service Role Key"}
              className="font-mono text-sm"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowKey((v) => !v)}
              title={showKey ? "隐藏" : "显示"}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            仅保存在本机并只供服务端使用，页面不会回显完整内容。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={handleTest} disabled={testing || saving}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            测试连接
          </Button>
          <Button type="button" onClick={handleSave} disabled={testing || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            保存配置
          </Button>
          {view?.projectRef && (
            <span className="text-xs text-[var(--muted-foreground)] font-mono">
              项目标识：{view.projectRef}
            </span>
          )}
        </div>

        {probe && (
          <div
            className={`text-sm rounded-md border p-3 flex items-start gap-2 ${
              probe.ok && probe.initialized
                ? "border-green-500/40 text-green-700 dark:text-green-400"
                : "border-amber-500/40 text-amber-700 dark:text-amber-400"
            }`}
          >
            {probe.ok && probe.initialized ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <Database className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{probe.message}</span>
          </div>
        )}

        {probe?.ok && !probe.initialized && (
          <div className="rounded-md border p-4 space-y-3 bg-[var(--muted)]/30">
            <div>
              <p className="text-sm font-semibold">数据库尚未初始化</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                当前 Supabase 项目里还没有本系统需要的数据表，按下面三步完成一次初始化即可。
              </p>
            </div>

            <ol className="text-xs text-[var(--muted-foreground)] space-y-1 list-decimal list-inside">
              <li>点「复制初始化 SQL」</li>
              <li>点「打开 Supabase SQL Editor」，粘贴后点 Run</li>
              <li>回到本页点「测试连接」重新检测</li>
            </ol>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyInitSql}>
                <Copy className="w-4 h-4 mr-2" />
                复制初始化 SQL
              </Button>
              {probe.sqlEditorUrl && (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={probe.sqlEditorUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    打开 Supabase SQL Editor
                  </a>
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={handleTest} disabled={testing}>
                <RefreshCw className="w-4 h-4 mr-2" />
                重新检测
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
