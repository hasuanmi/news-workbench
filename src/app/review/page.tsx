"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ReviewFilter, type ReviewFilter as ReviewFilterType } from "@/components/review/review-filter";
import { ReviewResult } from "@/components/review/review-result";
import { Button } from "@/components/ui/button";
import { Loader2, History, Sparkles } from "lucide-react";
import type { ReviewModule } from "@/lib/review-types";
import { ReviewFollowup, type FollowupTurn } from "@/components/review/review-followup";
import { DraftSelection } from "@/components/review/review-draft-selection";
import type { DraftPayload } from "@/lib/review-draft";

interface DisplayRules {
  show_comparison_table?: boolean;
  show_media_name?: boolean;
  show_article_title?: boolean;
  show_article_url?: boolean;
  show_evidence?: boolean;
  peer_highlights_max?: number;
  same_topic_max?: number;
  summary_max_length?: number;
  language_style?: string;
}

interface HistoryItem {
  id: string;
  report_date: string;
  review_status: string;
  version: number;
  summary_preview: string;
}

const PHASE_TEXT: Record<string, string> = {
  fetching: "正在筛选本期文章并生成选稿…",
  analyzing: "AI 正在进行结构化分析（重点识别 / 同题聚类 / 同行亮点）…",
  structure: "结构化分析完成，正在撰写最终评报…",
  final: "正在撰写最终评报…",
  done: "评报已保存",
};

export default function ReviewPage() {
  const [modules, setModules] = useState<ReviewModule[]>([]);
  const [finalSummary, setFinalSummary] = useState("");
  const [displayRules, setDisplayRules] = useState<DisplayRules | null>(null);
  const [phase, setPhase] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null);
  const [followupTurns, setFollowupTurns] = useState<FollowupTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [draftExcluded, setDraftExcluded] = useState<string[]>([]);
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftLoading, setDraftLoading] = useState(false);

  /** 阶段1：本期选稿（筛选 + AI 分组，落库可追溯），不直接生成长文 */
  const handleCreateDraft = useCallback(async (filter: ReviewFilterType) => {
    setDraftLoading(true);
    setError(null);
    setModules([]);
    setFinalSummary("");
    setDisplayRules(null);
    setCurrentReviewId(null);
    setFollowupTurns([]);
    setPhase("fetching");
    try {
      const res = await fetch("/api/review/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: filter.date.toISOString(),
          topics: filter.topics,
          customRequirement: filter.customRequirement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "选稿失败");
      setDraft(data.draft);
      setDraftExcluded(data.draft?.excluded_article_ids ?? []);
      setDraftDate(data.report_date);
      setPhase("draft");
    } catch (e) {
      setError(e instanceof Error ? e.message : "选稿失败");
    } finally {
      setDraftLoading(false);
    }
  }, []);

  const toggleExclude = useCallback((articleId: string) => {
    setDraftExcluded((prev) => {
      const next = prev.includes(articleId) ? prev.filter((id) => id !== articleId) : [...prev, articleId];
      // 同步到服务端，确保可追溯
      fetch("/api/review/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: draftDate, excluded_article_ids: next }),
      }).catch(() => {});
      return next;
    });
  }, [draftDate]);

  /** 阶段2：基于已确认选稿生成评报（SSE） */
  const handleGenerateFromDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    setModules([]);
    setFinalSummary("");
    setDisplayRules(null);
    setCurrentReviewId(null);
    setFollowupTurns([]);
    setPhase("analyzing");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/admin/review/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate: draftDate }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `生成失败（${res.status}）`);
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
            if (evt.error) {
              setError(evt.error);
              continue;
            }
            if (evt.warning) {
              // eslint-disable-next-line no-console
              console.warn("评报警告:", evt.warning);
              continue;
            }
            if (evt.phase === "structure") {
              setModules(Array.isArray(evt.modules) ? evt.modules : []);
              setDisplayRules(evt.display_rules ?? null);
              setPhase("final");
            } else if (evt.phase === "final") {
              setPhase("final");
              setFinalSummary((s) => s + (evt.content ?? ""));
            } else if (evt.phase === "saved") {
              setPhase("done");
              if (evt.id) setCurrentReviewId(evt.id);
            } else if (evt.phase) {
              setPhase(evt.phase);
            }
          } catch {
            // 忽略不完整分片
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "生成失败");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [draftDate]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/review?pageSize=30");
      const data = await res.json();
      setHistory(data.reviews ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, loadHistory]);

  const viewHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/review/${id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "加载失败");
      setModules(data.review.modules ?? []);
      setFinalSummary(data.review.final_summary ?? "");
      setDisplayRules(data.review.display_rules ?? null);
      setCurrentReviewId(id);
      setFollowupTurns([]);
      setPhase("done");
      setShowHistory(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  const hasResult = modules.length > 0 || finalSummary.length > 0;

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">每日评报</h1>
            <p className="text-sm text-[#6b6257] mt-1">选择条件后，AI 对当天媒体报道进行横向比较并生成结构化评报</p>
          </div>
          <Button variant="outline" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-4 w-4 mr-2" />
            历史评报
          </Button>
        </div>

        {/* 历史侧拉/抽屉 */}
        {showHistory && (
          <div className="bg-white border border-[#e8e2d8] rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#1f1b16]">历史评报</h2>
              <Button variant="ghost" size="sm" onClick={loadHistory} disabled={historyLoading}>
                刷新
              </Button>
            </div>
            {historyLoading ? (
              <p className="text-sm text-[#6b6257] py-4 text-center">加载中…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-[#6b6257] py-4 text-center">暂无历史评报</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => viewHistory(h.id)}
                    className="w-full text-left border border-[#e8e2d8] rounded-md px-3 py-2 hover:bg-[#faf7f2] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#1f1b16]">
                        {h.report_date}
                        <span className="ml-2 text-xs text-[#6b6257]">v{h.version}</span>
                      </span>
                      <span className="text-xs text-[#6b6257]">
                        {h.review_status === "published" ? "已发布" : h.review_status === "approved" ? "已审核" : "待审核"}
                      </span>
                    </div>
                    <p className="text-xs text-[#6b6257] truncate mt-1">{h.summary_preview || "（无摘要）"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 条件区 */}
        <ReviewFilter onGenerate={handleCreateDraft} loading={loading} />

        {/* 阶段1 选稿结果 */}
        {!loading && draft && phase === "draft" && (
          <div className="mt-4">
            <DraftSelection
              draft={draft}
              excluded={draftExcluded}
              onToggleExclude={toggleExclude}
              onGenerate={handleGenerateFromDraft}
              loadingGenerate={loading}
            />
          </div>
        )}

        {/* 进度提示 */}
        {loading && (
          <div className="mb-4 p-3 bg-[#faf7f2] border border-[#e8e2d8] rounded-md text-sm text-[#6b6257] flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {PHASE_TEXT[phase] || "处理中…"}
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>
        )}

        {/* 结果区 */}
        {hasResult && (
          <div className="space-y-6">
            <ReviewResult modules={modules} finalSummary={finalSummary} displayRules={displayRules} />
            {loading && phase === "final" && (
              <p className="text-xs text-[#6b6257] flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                评报生成中（AI 结果仅供辅助，最终需人工确认）…
              </p>
            )}
            {!loading && currentReviewId && (
              <ReviewFollowup
                reviewId={currentReviewId}
                turns={followupTurns}
                onTurnsChange={setFollowupTurns}
                onReviewUpdated={() => viewHistory(currentReviewId)}
              />
            )}
          </div>
        )}

        {/* 空状态 */}
        {!hasResult && !loading && (
          <div className="text-center py-12 text-[#6b6257]">
            <p className="text-sm">设置条件后点击「生成每日评报」，AI 将分析当天报道并生成结构化评报</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
