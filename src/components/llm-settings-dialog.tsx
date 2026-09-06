"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  stream: boolean;
  maxCompletionTokens?: number;
  extraBody?: Record<string, unknown>;
}

interface LLMSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigured?: () => void;
}

export function LLMSettingsDialog({ open, onOpenChange, onConfigured }: LLMSettingsDialogProps) {
  const [mode, setMode] = useState<"paste" | "manual">("paste");
  const [pythonCode, setPythonCode] = useState("");
  const [config, setConfig] = useState<LLMConfig>({
    baseUrl: "",
    apiKey: "",
    model: "",
    stream: true,
  });
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"input" | "confirm">("input");

  // 解析 Python 代码（纯文本正则，绝不执行）
  const parsePythonCode = () => {
    setError(null);
    let code = pythonCode;

    // 中文弯引号转英文引号
    code = code.replace(/['']/g, "'").replace(/[""]/g, '"');

    const extractString = (pattern: RegExp): string | null => {
      const match = code.match(pattern);
      if (match && match[1]) {
        // 去掉引号
        return match[1].replace(/^['"]|['"]$/g, "");
      }
      return null;
    };

    const extractBool = (pattern: RegExp): boolean | null => {
      const match = code.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase() === "true";
      }
      return null;
    };

    const extractNumber = (pattern: RegExp): number | null => {
      const match = code.match(pattern);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        return isNaN(num) ? null : num;
      }
      return null;
    };

    const apiKey = extractString(/api_key\s*=\s*(['"][^'"]+['"])/);
    const baseUrl = extractString(/base_url\s*=\s*(['"][^'"]+['"])/);
    const model = extractString(/model\s*=\s*(['"][^'"]+['"])/);
    const stream = extractBool(/stream\s*=\s*(True|False)/);
    const maxTokens = extractNumber(/max_completion_tokens\s*=\s*(\d+)/);

    if (!apiKey || !baseUrl || !model) {
      const missing: string[] = [];
      if (!apiKey) missing.push("API Key");
      if (!baseUrl) missing.push("API 服务地址");
      if (!model) missing.push("模型名称");
      setError(`无法识别：${missing.join("、")}`);
      return;
    }

    // 检查 os.getenv
    if (code.includes("os.getenv") && (!apiKey || apiKey.includes("os.getenv"))) {
      setError("代码中使用 os.getenv 但未找到真实密钥值，请手动填写 API Key");
      return;
    }

    setConfig({
      baseUrl,
      apiKey,
      model,
      stream: stream ?? true,
      maxCompletionTokens: maxTokens ?? undefined,
    });
    setStep("confirm");
  };

  const clearCode = () => {
    setPythonCode("");
    setError(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "测试失败");
        setTestResult({ success: false, message: data.error || "测试失败" });
      } else if (data.success) {
        setTestResult({ success: true, message: "模型连接成功" });
      } else {
        setError(data.error || "连接失败");
        setTestResult({ success: false, message: data.error || "连接失败" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "网络错误";
      setError(msg);
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "保存失败");
      } else {
        onConfigured?.();
        onOpenChange(false);
        // 重置状态
        setPythonCode("");
        setConfig({ baseUrl: "", apiKey: "", model: "", stream: true });
        setStep("input");
        setTestResult(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "网络错误";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return "****";
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>大模型设置</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 模式切换 */}
          <div className="flex gap-2">
            <Button
              variant={mode === "paste" ? "default" : "outline"}
              onClick={() => setMode("paste")}
              size="sm"
            >
              粘贴 Python 示例
            </Button>
            <Button
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => setMode("manual")}
              size="sm"
            >
              手动填写
            </Button>
          </div>

          {mode === "paste" ? (
            <>
              <div className="space-y-2">
                <Label>粘贴 Python API 调用示例</Label>
                <Textarea
                  value={pythonCode}
                  onChange={(e) => setPythonCode(e.target.value)}
                  placeholder={`from openai import OpenAI

client = OpenAI(
    api_key="your-api-key",
    base_url="https://api.example.com/v1"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True,
    max_completion_tokens=1000
)`}
                  className="font-mono text-sm min-h-[200px]"
                />
                <p className="text-xs text-muted-foreground">
                  请粘贴平台提供的完整 Python API 示例。系统只会识别配置信息，不会执行这段代码。
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={parsePythonCode} size="sm">
                  自动识别配置
                </Button>
                <Button variant="outline" onClick={clearCode} size="sm">
                  清空
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>API 服务地址 (base_url)</Label>
                <Input
                  value={config.baseUrl}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>模型名称</Label>
                <Input
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  placeholder="gpt-4"
                />
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "confirm" && (
            <div className="space-y-4 border rounded-lg p-4">
              <h3 className="font-medium">识别结果确认</h3>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">API Key（脱敏）</Label>
                  <div className="text-sm font-mono">{maskApiKey(config.apiKey)}</div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">API 服务地址</Label>
                  <div className="text-sm">{config.baseUrl}</div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">模型名称</Label>
                  <div className="text-sm">{config.model}</div>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">流式输出</Label>
                  <Switch
                    checked={config.stream}
                    onCheckedChange={(checked) => setConfig({ ...config, stream: checked })}
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={testConnection} disabled={testing} size="sm">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  测试连接
                </Button>

                {testResult?.success && (
                  <Button onClick={saveConfig} disabled={loading} size="sm">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    保存并启用
                  </Button>
                )}

                <Button variant="outline" onClick={() => setStep("input")} size="sm">
                  返回修改
                </Button>

                <Button variant="ghost" onClick={() => onOpenChange(false)} size="sm">
                  取消
                </Button>
              </div>

              {testResult && (
                <div className="flex items-center gap-2 text-sm">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className={testResult.success ? "text-green-600" : "text-red-600"}>
                    {testResult.message}
                  </span>
                </div>
              )}
            </div>
          )}

          {mode === "manual" && step === "input" && (
            <div className="flex gap-2">
              <Button onClick={() => setStep("confirm")} size="sm">
                下一步
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)} size="sm">
                取消
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
