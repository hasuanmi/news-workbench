"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/common/loading-button";
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function LLMConfigCard() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const readStatus = useCallback(async () => {
    setLoading(true);
    setTestResult(null);
    setStatusError(null);
    try {
      const res = await fetch("/api/admin/llm", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || typeof data.enabled !== "boolean") {
        throw new Error(data.error || "无法读取模型状态");
      }
      setEnabled(data.enabled);
      setConfigured(Boolean(data.config));
      setBaseUrl(data.config?.baseUrl ?? "");
      setModel(data.config?.model ?? "");
      setMaskedKey(data.config?.apiKeyMasked ?? null);
      setDirty(false);
      return true;
    } catch {
      setEnabled(null);
      setStatusError("无法读取模型状态，请重试");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void readStatus();
  }, [readStatus]);

  function markChanged() {
    setDirty(true);
    setTestResult(null);
  }

  const connected = testResult ? testResult.success : !dirty && enabled === true;
  const busy = saving || testing;
  const statusLabel = loading ? "加载中" : statusError ? "状态未知"
    : connected ? "已连接" : dirty ? "待验证" : configured ? "已保存，未连接" : "未配置";

  async function testConnection() {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      toast.error("请填写 Base URL、API Key 与模型名后测试连接");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setTestResult({ success: true, message: "模型连接成功" });
      } else {
        setTestResult({ success: false, message: d.error || "连接失败" });
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : "网络错误" });
    } finally {
      setTesting(false);
    }
  }

  async function saveConfig() {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      toast.error("请填写 Base URL、API Key 与模型名");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, model, stream: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "保存失败");
        return;
      }
      setApiKey("");
      setTestResult(null);
      setEnabled(null);
      const refreshed = await readStatus();
      if (refreshed) {
        toast.success("AI 模型配置已保存，状态已刷新");
      } else {
        toast.error("配置已保存，但无法确认后端状态，请重试读取");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">AI 模型配置</CardTitle>
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
            (connected && !statusError
              ? "bg-[var(--brand-soft)] text-[var(--brand)]"
              : "bg-[var(--accent)] text-[var(--muted-foreground)]")
          }
        >
          <span
            className={
              "h-1.5 w-1.5 rounded-full " +
              (connected && !statusError ? "bg-[var(--brand)]" : "bg-[var(--muted-foreground)]")
            }
          />
          {statusLabel}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中
          </div>
        ) : (
          <>
            {statusError && (
              <div role="alert" className="flex items-center gap-2 text-sm text-[var(--destructive)]">
                {statusError}
                <Button variant="outline" size="sm" onClick={() => void readStatus()} disabled={busy}>
                  重试读取
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="llm-base-url">Base URL</Label>
              <Input
                id="llm-base-url"
                disabled={busy}
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); markChanged(); }}
                placeholder="https://api.example.com/v1"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="llm-api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="llm-api-key"
                  disabled={busy}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); markChanged(); }}
                  placeholder={maskedKey ? `${maskedKey}（重新填写以更新）` : "sk-..."}
                  className="font-mono text-sm pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0"
                  aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="llm-model">模型名</Label>
              <Input
                id="llm-model"
                disabled={busy}
                value={model}
                onChange={(e) => { setModel(e.target.value); markChanged(); }}
                placeholder="deepseek-chat / gpt-4 等"
                className="text-sm"
              />
            </div>

            {testResult && (
              <div className="flex items-center gap-2 text-sm">
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--brand)]" />
                ) : (
                  <XCircle className="h-4 w-4 text-[var(--destructive)]" />
                )}
                <span className={testResult.success ? "text-[var(--brand)]" : "text-[var(--destructive)]"}>
                  {testResult.message}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <LoadingButton onClick={saveConfig} loading={saving} disabled={testing} loadingText="保存中...">
                保存
              </LoadingButton>
              <Button variant="outline" onClick={testConnection} disabled={busy}>
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                测试连接
              </Button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              配置保存在服务端内存中，服务重启后需重新填写；测试连接不会写入配置。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
