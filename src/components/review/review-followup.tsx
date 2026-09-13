"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Send, Sparkles } from "lucide-react";

export interface FollowupTurn {
  role: "user" | "assistant";
  content: string;
  mode?: "question" | "revise";
}

interface ReviewFollowupProps {
  reviewId: string | null;
  turns: FollowupTurn[];
  onTurnsChange: (turns: FollowupTurn[]) => void;
}

export function ReviewFollowup({ reviewId, turns, onTurnsChange }: ReviewFollowupProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"question" | "revise">("question");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading || !reviewId) return;
    setLoading(true);
    setError(null);
    const userTurn: FollowupTurn = { role: "user", content: text, mode };
    onTurnsChange([...turns, userTurn]);
    setInput("");
    setMode("question");

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    try {
      const res = await fetch(`/api/review/${reviewId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          input: text,
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
            if (evt.error) throw new Error(evt.error);
            if (typeof evt.delta === "string") {
              acc += evt.delta;
              onTurnsChange([...turns, { role: "user", content: text, mode }, { role: "assistant", content: acc }]);
            }
          } catch {
            // 忽略不完整分片
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "追问失败");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <Card className="border-[#e8e2d8]">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#b3392f]" />
          <span className="text-sm font-semibold text-[#1f1b16]">继续追问 / AI 协作修改</span>
          <span className="text-xs text-[#6b6257]">AI 结果仅供辅助，最终需人工确认</span>
        </div>

        {/* 对话记录 */}
        {turns.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto border border-[#e8e2d8] rounded-md p-3">
            {turns.map((t, i) => (
              <div key={i} className={`text-sm ${t.role === "user" ? "text-right" : "text-left"}`}>
                <div
                  className={`inline-block max-w-[85%] rounded-md px-3 py-2 whitespace-pre-wrap text-left ${
                    t.role === "user"
                      ? "bg-[#faf7f2] text-[#1f1b16]"
                      : "bg-muted/40 text-[#1f1b16]"
                  }`}
                >
                  {t.role === "user" && t.mode === "revise" && (
                    <span className="mr-1 text-xs text-[#c87f2d]">[改稿]</span>
                  )}
                  {t.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 模式切换 */}
        <div className="flex gap-2">
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
        </div>

        {/* 输入 */}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder={
              mode === "question"
                ? "例如：今日重点里对科技创新着墨偏少，能否对比分析一下当天的科技相关报道？"
                : "例如：把最终评报第三段改写成更精炼的两句，突出广州可借鉴的三点建议。"
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