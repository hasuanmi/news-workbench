"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { History, Loader2, RefreshCcw, RotateCcw, Sparkles } from "lucide-react";

/**
 * 每日评报「补充要求 → 重新生成完整评报」（WF04-F）
 *
 * 本功能不是普通聊天问答：
 * - 用户填写补充要求后，系统基于“本期选稿 / 同题聚类 / 同行独有 / 原始评报 / 新增要求”
 *   重新生成一版完整评报。
 * - 新版本全量替换保存为当前评报的新版本（原版本自动快照，可在“历史版本”中查看/恢复）。
 * - AI 输出为结构化四区块 + 最终评报文本，由父组件的 ReviewResult 组件渲染，不直接塞入 Markdown 原文。
 */

interface Revision {
  id: string;
  version: number;
  source: string;
  change_note: string | null;
  created_at: string;
}

interface ReviewFollowupProps {
  reviewId: string | null;
  /** 重新生成并保存为新版本成功后回调（父组件重新拉取评报详情展示新版本） */
  onReviewUpdated?: () => void;
}

export function ReviewFollowup({ reviewId, onReviewUpdated }: ReviewFollowupProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const submit = async () => {
    const requirement = input.trim();
    if (!requirement || loading || !reviewId) return;
    setLoading(true);
    setError(null);
    setProgress("正在读取本期选稿与原始评报…");
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/review/${reviewId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: requirement }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `操作失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let savedVersion: number | null = null;
      let errored: string | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.error) {
              errored = evt.error;
              continue;
            }
            if (evt.phase === "structure") {
              setProgress("结构化四区块已重写完成，正在撰写最终评报…");
            } else if (evt.phase === "final") {
              setProgress("正在生成最终评报…");
            } else if (evt.phase === "saved") {
              savedVersion = evt.version ?? null;
              setProgress(`重新生成完成，已保存为新版本 v${evt.version}`);
            } else if (evt.phase === "done") {
              // 完成
            } else {
              setProgress(evt.phase ?? "");
            }
          } catch {
            // 忽略不完整分片
          }
        }
      }
      if (errored) throw new Error(errored);
      if (savedVersion) {
        // 通知父组件重新拉取本次评报详情，展示新版本内容（结构化渲染）
        onReviewUpdated?.();
        loadRevisions();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "重新生成失败");
      }
    } finally {
      setLoading(false);
      setProgress("");
      abortRef.current = null;
    }
  };

  const loadRevisions = async () => {
    if (!reviewId) return;
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/review/${reviewId}/revisions`);
      const data = await res.json();
      setRevisions(data.revisions ?? []);
    } catch {
      setRevisions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const toggleVersions = () => {
    const next = !showVersions;
    setShowVersions(next);
    if (next) loadRevisions();
  };

  const restore = async (revisionId: string) => {
    if (!reviewId || busyId) return;
    if (!confirm("确认恢复到该历史版本？恢复前会自动备份当前版本，可随时撤销。")) return;
    setBusyId(`restore-${revisionId}`);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/revisions/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "恢复失败");
      onReviewUpdated?.();
      loadRevisions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-[#e8e2d8]">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#b3392f]" />
          <span className="text-sm font-semibold text-[#1f1b16]">补充要求，重新生成完整评报</span>
          <span className="text-xs text-[#6b6257]">基于本期选稿 / 同题聚类 / 同行独有 / 原始评报 · AI 结果仅供辅助，最终需人工确认</span>
          <button
            onClick={toggleVersions}
            className="ml-auto inline-flex items-center gap-1 text-xs text-[#6b6257] hover:text-[#b3392f]"
          >
            <History className="h-3.5 w-3.5" />
            历史版本（原版本 / 当前版本）
          </button>
        </div>

        {/* 版本历史：原版本 / 当前版本，可切换恢复 */}
        {showVersions && (
          <div className="border border-[#e8e2d8] rounded-md p-3 space-y-1.5 bg-[#faf7f2]/50">
            {versionsLoading ? (
              <p className="text-xs text-[#6b6257] py-2 text-center">加载版本中…</p>
            ) : revisions.length === 0 ? (
              <p className="text-xs text-[#6b6257] py-2 text-center">暂无历史版本（当前版本保存在评报中）</p>
            ) : (
              revisions.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-medium text-[#1f1b16]">v{r.version}</span>
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[#6b6257]">
                      {sourceLabel(r.source)}
                    </span>
                    <span className="ml-2 text-[#6b6257] truncate">{r.change_note || "—"}</span>
                    <span className="ml-2 text-[#9a948a]">
                      {new Date(r.created_at).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs shrink-0"
                    disabled={busyId === `restore-${r.id}`}
                    onClick={() => restore(r.id)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    恢复
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        <p className="text-xs leading-relaxed text-[#6b6257] bg-muted/40 border border-[#e8e2d8] rounded-md px-3 py-2">
          提交补充要求后，系统会基于本期选稿、同题聚类、同行独有报道与原始评报，<b>重新生成一版完整评报</b>并保存为当前评报的
          新版本；原版本会保留在「历史版本」中，可随时恢复。例如：把重点调整到科技创新主题、语言更书面、精简为三段、增补某媒体的独家信息等。
        </p>

        {/* 快捷补充建议 */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REQUIREMENTS.map((q) => (
            <button
              key={q}
              disabled={loading}
              onClick={() => setInput(q)}
              className="rounded-full border border-[#e8e2d8] px-2.5 py-1 text-xs text-[#6b6257] hover:bg-[#faf7f2] disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* 输入补充要求 */}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="填写补充要求，例如：把分析重点调整到科技创新主题；语言更书面；精简为三段；补充某媒体的独家信息…"
            rows={2}
            className="flex-1 rounded-md border border-[#e8e2d8] bg-white px-3 py-2 text-sm text-[#1f1b16] placeholder:text-[#9a948a] focus:outline-none focus:ring-2 focus:ring-[#b3392f]/30 disabled:opacity-60 resize-none"
          />
          <Button onClick={submit} disabled={loading || !input.trim() || !reviewId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {loading ? "重新生成中" : "重新生成完整评报"}
          </Button>
        </div>

        {loading && (
          <p className="text-xs text-[#6b6257] flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {progress || "正在重新生成…"}（生成完成后将保存为新版本，可在上方切换原版本）
          </p>
        )}

        {error && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

const QUICK_REQUIREMENTS = [
  "把分析重点调整到科技创新",
  "语言更书面、更简洁",
  "精简为三段式段落",
  "补充说明广州日报独家信息",
  "突出本地案例与数据支撑",
];

function sourceLabel(source: string): string {
  if (source === "generate") return "生成";
  if (source === "followup") return "重新生成";
  if (source === "restore") return "恢复";
  return source;
}