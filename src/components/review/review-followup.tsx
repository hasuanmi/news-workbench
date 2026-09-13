"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { History, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";

export interface FollowupTurn {
  role: "user" | "assistant";
  content: string;
  mode?: "question" | "revise";
  /** 改稿轮次：完成后可据此更新到评报 */
  target?: string;
}

interface Revision {
  id: string;
  version: number;
  source: string;
  change_note: string | null;
  created_at: string;
}

interface ReviewFollowupProps {
  reviewId: string | null;
  turns: FollowupTurn[];
  onTurnsChange: (turns: FollowupTurn[]) => void;
  /** 「更新到当前评报」成功后回调（父组件重新拉取评报详情） */
  onReviewUpdated?: () => void;
}

const TARGET_OPTIONS = [
  { key: "final_summary", label: "最终评报" },
  { key: "today_focus", label: "今日重点" },
  { key: "same_topic", label: "同题观察" },
  { key: "peer_highlights", label: "同行亮点" },
  { key: "gz_daily", label: "广州日报观察" },
];

export function ReviewFollowup({
  reviewId,
  turns,
  onTurnsChange,
  onReviewUpdated,
}: ReviewFollowupProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"question" | "revise">("question");
  const [target, setTarget] = useState("final_summary");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading || !reviewId) return;
    setLoading(true);
    setError(null);
    const userTurn: FollowupTurn = { role: "user", content: text, mode, target: mode === "revise" ? target : undefined };
    const baseTurns = [...turns, userTurn];
    onTurnsChange(baseTurns);
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    try {
      const res = await fetch(`/api/review/${reviewId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          input: mode === "revise" ? `【修改目标：${targetLabel(target)}】${text}` : text,
          history: turns
            .filter((t) => t.role === "user" || t.role === "assistant")
            .map((t) => ({ role: t.role, content: t.content })),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `追问失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
            if (typeof evt.delta === "string") {
              acc += evt.delta;
              onTurnsChange([
                ...baseTurns,
                { role: "assistant", content: acc, mode, target: mode === "revise" ? target : undefined },
              ]);
            }
          } catch {
            // 忽略不完整分片
          }
        }
      }
      if (errored && !acc) throw new Error(errored);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "追问失败");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  /** 把某轮改稿结果更新到当前评报（保留历史版本） */
  const applyRevision = async (turn: FollowupTurn, idx: number) => {
    if (!reviewId || busyId) return;
    const tgt = turn.target || "final_summary";
    if (!confirm(`确认将本轮修改更新到「${targetLabel(tgt)}」？更新前会自动保留当前版本，可随时恢复。`)) return;
    setBusyId(`apply-${idx}`);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: tgt, content: stripBlockTag(turn.content), change_note: lastUserInstruction(turns, idx) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "更新失败");
      onReviewUpdated?.();
      loadRevisions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusyId(null);
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
    if (!confirm("确认恢复到该历史版本？恢复前会自动备份当前版本，本次恢复也可撤销。")) return;
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
          <span className="text-sm font-semibold text-[#1f1b16]">继续追问 / AI 协作修改</span>
          <span className="text-xs text-[#6b6257]">仅基于本次评报材料 · AI 结果仅供辅助，最终需人工确认</span>
          <button
            onClick={toggleVersions}
            className="ml-auto inline-flex items-center gap-1 text-xs text-[#6b6257] hover:text-[#b3392f]"
          >
            <History className="h-3.5 w-3.5" />
            历史版本
          </button>
        </div>

        {/* 版本历史 */}
        {showVersions && (
          <div className="border border-[#e8e2d8] rounded-md p-3 space-y-1.5 bg-[#faf7f2]/50">
            {versionsLoading ? (
              <p className="text-xs text-[#6b6257] py-2 text-center">加载版本中…</p>
            ) : revisions.length === 0 ? (
              <p className="text-xs text-[#6b6257] py-2 text-center">暂无历史版本</p>
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

        {/* 对话记录 */}
        {turns.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto border border-[#e8e2d8] rounded-md p-3">
            {turns.map((t, i) => (
              <div key={i} className={`text-sm ${t.role === "user" ? "text-right" : "text-left"}`}>
                <div
                  className={`inline-block max-w-[88%] rounded-md px-3 py-2 whitespace-pre-wrap text-left ${
                    t.role === "user"
                      ? "bg-[#faf7f2] text-[#1f1b16]"
                      : "bg-muted/40 text-[#1f1b16]"
                  }`}
                >
                  {t.role === "user" && t.mode === "revise" && (
                    <span className="mr-1 text-xs text-[#c87f2d]">[改稿·{targetLabel(t.target || "final_summary")}]</span>
                  )}
                  {t.content}
                  {/* 改稿完成：可更新到当前评报 */}
                  {t.role === "assistant" && t.mode === "revise" && i === turns.length - 1 && !loading && (
                    <span className="block mt-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={busyId === `apply-${i}`}
                        onClick={() => applyRevision(t, i)}
                      >
                        {busyId === `apply-${i}` ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        更新到当前评报（{targetLabel(t.target || "final_summary")}）
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 模式切换 */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "question", label: "追问" },
              { key: "revise", label: "协作修改" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              disabled={loading}
              onClick={() => setMode(m.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                mode === m.key
                  ? "bg-[#b3392f] text-white"
                  : "bg-muted/40 text-[#6b6257] hover:bg-muted/60"
              }`}
            >
              {m.label}
            </button>
          ))}

          {/* 改稿目标区块 */}
          {mode === "revise" && (
            <select
              value={target}
              disabled={loading}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-md border border-[#e8e2d8] bg-white px-2 py-1.5 text-xs text-[#1f1b16] focus:outline-none focus:ring-2 focus:ring-[#b3392f]/30"
            >
              {TARGET_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 快捷操作提示 */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q) => (
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

        {/* 输入 */}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder={
              mode === "question"
                ? "例如：展开今日重点里的科技创新主题，结合同题材料说明各家角度差异。"
                : "例如：把最终评报精简为三句话，突出广州可借鉴的三点；语言更书面。"
            }
            rows={2}
            className="flex-1 rounded-md border border-[#e8e2d8] bg-white px-3 py-2 text-sm text-[#1f1b16] placeholder:text-[#9a948a] focus:outline-none focus:ring-2 focus:ring-[#b3392f]/30 disabled:opacity-60 resize-none"
          />
          <Button onClick={submit} disabled={loading || !input.trim() || !reviewId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? "生成中" : "发送"}
          </Button>
        </div>

        {error && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

const QUICK_PROMPTS = [
  "展开某一主题",
  "重新比较指定媒体",
  "调整分析维度",
  "补充遗漏",
  "修改语言风格",
  "精简某一部分",
  "扩写某一部分",
];

function targetLabel(key: string): string {
  return TARGET_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

function sourceLabel(source: string): string {
  if (source === "generate") return "生成";
  if (source === "followup") return "协作修改";
  if (source === "restore") return "恢复";
  return source;
}

/** 去掉 AI 在区块改稿开头可能输出的【对应区块：xxx】标记 */
function stripBlockTag(text: string): string {
  return text.replace(/^\s*【对应区块：[^】]+】\s*/, "").trim();
}

/** 找到某条助手改稿对应的最近一条用户指令（作为版本改动说明） */
function lastUserInstruction(turns: FollowupTurn[], assistantIdx: number): string {
  for (let i = assistantIdx - 1; i >= 0; i--) {
    if (turns[i].role === "user") return turns[i].content.slice(0, 200);
  }
  return "AI 协作修改";
}
