"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ReviewFilter, type ReviewFilter as ReviewFilterType } from "@/components/review/review-filter";
import { ReviewResult } from "@/components/review/review-result";
import { Button } from "@/components/ui/button";
import { History, Sparkles } from "lucide-react";
import type { ReviewModule } from "@/lib/review-types";
import { ReviewFollowup } from "@/components/review/review-followup";
import { DraftSelection } from "@/components/review/review-draft-selection";
import type { DraftPayload } from "@/lib/review-draft";
import { TaskProgress, type TaskStage } from "@/components/common/task-progress";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { format } from "date-fns";

/** 评报生成的真实阶段（由后端 SSE 驱动，前端不伪造步骤） */
const GENERATE_STAGES: TaskStage[] = [
  { id: "fetching", label: "读取今日文章" },
  { id: "analyzing", label: "筛选重点稿件" },
  { id: "structure", label: "识别同题与同行独有" },
  { id: "final", label: "生成评报" },
  { id: "saved", label: "保存结果" },
];

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
    setPhase("fetching");
    try {
      const res = await fetch("/api/review/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: format(filter.date, "yyyy-MM-dd"),
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

  /** 阶段2：基于已确认选稿生成评报（SSE）。保留旧结果，边生成边平滑替换 */
  const handleGenerateFromDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPhase("fetching");
    // 不清空旧 modules/finalSummary，生成中保留旧内容 + “正在更新”；
    // 收到真实 structure 阶段后再替换为新结构。

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
      <div>
        <PageHeader
          title="每日评报"
          subtitle="选择条件后，AI 对当天媒体报道进行横向比较并生成结构化评报"
          right={
            <Button variant="outline" onClick={() => setShowHistory((v) => !v)}>
              <History className="h-4 w-4 mr-2" />
              历史评报
            </Button>
          }
        />

        {/* 历史侧拉/抽屉 */}
        {showHistory && (
          <div className="bg-white border border-[var(--border)] rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">历史评报</h2>
              <Button variant="ghost" size="sm" onClick={loadHistory} disabled={historyLoading}>
                刷新
              </Button>
            </div>
            {historyLoading ? (
              <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">加载中…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">暂无历史评报</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => viewHistory(h.id)}
                    className="w-full text-left border border-[var(--border)] rounded-md px-3 py-2 hover:bg-[var(--background)] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {h.report_date}
                        <span className="ml-2 text-xs text-[var(--muted-foreground)]">v{h.version}</span>
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {h.review_status === "published" ? "已发布" : h.review_status === "approved" ? "已审核" : "待审核"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] truncate mt-1">{h.summary_preview || "（无摘要）"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 条件区 */}
        <ReviewFilter onGenerate={handleCreateDraft} loading={loading || draftLoading} onDateChange={() => { setError(null); setDraft(null); setPhase(""); }} />

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

        {/* 进度提示：仅后端 SSE 真实返回阶段才展示具体步骤；无阶段则只显示“处理中” */}
        {loading && (
          <div className="my-4">
            <TaskProgress
              stages={GENERATE_STAGES}
              currentId={phase}
              running={loading}
              failed={!!error}
              className="bg-white"
            />
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>
        )}

        {/* 结果区：保留旧结果，顶部“正在更新”提示，完成后平滑替换 */}
        {hasResult && (
          <div className="space-y-6">
            {loading && (
              <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-2 text-sm text-sky-700 flex items-center gap-2">
                <Sparkles className="h-4 w-4 animate-pulse" />
                正在更新评报…旧结果保留，生成完成后自动替换（AI 结果仅供辅助，最终需人工确认）
              </div>
            )}
            <ReviewResult modules={modules} finalSummary={finalSummary} displayRules={displayRules} />
            {!loading && currentReviewId && (
              <ReviewFollowup
                reviewId={currentReviewId}
                onReviewUpdated={() => viewHistory(currentReviewId)}
              />
            )}
          </div>
        )}

        {/* 空状态 */}
        {!hasResult && !loading && (
          <EmptyState
            className="py-16 mt-4"
            title="今日评报尚未生成"
            description="设置日期等条件后点击「生成每日评报」，AI 将分析当天媒体横向比较并生成结构化评报"
          />
        )}
      </div>
    </AppShell>
  );
}
