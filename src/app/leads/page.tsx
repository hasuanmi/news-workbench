"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LeadsFilter, type LeadsFilter as LeadsFilterType } from "@/components/leads/leads-filter";
import { ClueCard, type Clue } from "@/components/leads/clue-card";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { PageHeader } from "@/components/common/page-header";
import { RunSummaryCard } from "@/components/leads/run-summary-card";
import { toast } from "sonner";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Scope = "active" | "history";

export default function LeadsPage() {
  const [clues, setClues] = useState<Clue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("active");
  /** 筛选区默认收起：把首屏让给运行摘要与线索卡片 */
  const [filterOpen, setFilterOpen] = useState(false);
  const [runSummary,setRunSummary]=useState<any>(null);
  const loadRunSummary=useCallback(async()=>{try{const r=await fetch('/api/leads/run-summary');if(r.ok)setRunSummary(await r.json());}catch{}},[]);

  // 页面挂载时加载窗口内的今日待确认 + 已确认线索
  const loadClues = useCallback(async (sc: Scope) => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads?scope=${sc}&pageSize=50`);
      if (!res.ok) throw new Error("加载线索失败");
      const data = await res.json();
      setClues(data.clues || []);
      if (data.evidence_warning) setError(data.evidence_warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载线索失败");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadClues(scope);
  }, [scope, loadClues]);
  useEffect(()=>{loadRunSummary();const timer=setInterval(loadRunSummary,15000);return()=>clearInterval(timer);},[loadRunSummary]);

  const handleIdentify = async (filter: LeadsFilterType) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    setScope("active");
    try {
      const res = await fetch("/api/admin/leads/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeRange: filter.timeRange,
          customStart: filter.customStart?.toISOString(),
          customEnd: filter.customEnd?.toISOString(),
          mediaScope: filter.mediaScope,
          customMediaIds: filter.customMediaIds,
          clueTypes: filter.clueTypes,
          topics: filter.topics,
          customRequirement: filter.customRequirement,
        }),
      });
      if (!res.ok) throw new Error("识别失败");
      const data = await res.json();
      // 识别后重新拉取窗口内列表（保证依据/新鲜度一致），而不是直接用返回的去重结果
      await loadClues("active");
      await loadRunSummary();
      if(data.executed===false&&data.total===0){const message='本轮未执行识别：待处理文章0篇';setInfo(message);toast.info(message);return;}
      const processed = data.stats?.processed ?? data.processed;
      const found = data.stats?.cluesFound ?? data.cluesFound;
      if (processed !== undefined) {
        setInfo(`本次扫描 ${processed} 篇，识别出线索 ${found ?? 0} 条。已按新鲜度窗口收敛到今日待确认。`);
        toast.success(`线索识别完成：${processed} 篇扫描，识别 ${found ?? 0} 条`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "识别失败";
      setError(msg);
      toast.error(`识别失败：${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshAfterReview = (id: string, status: string) => {
    setClues((prev) => prev.map((c) => (c.id === id ? { ...c, review_status: status } : c)));
  };

  const handleConfirm = async (id: string) => {
    await fetch(`/api/admin/leads/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });
    refreshAfterReview(id, "confirmed");
  };

  const handleIgnore = async (id: string, reason?: string) => {
    await fetch(`/api/admin/leads/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ignore", reason }),
    });
    refreshAfterReview(id, "ignored");
  };

  const pendingCount = clues.filter((c) => c.review_status === "pending").length;
  const confirmedCount = clues.filter((c) => c.review_status === "confirmed").length;

  return (
    <AppShell>
      <div>
        <PageHeader
          title="新闻线索"
          subtitle="从时间窗口内的新文章中识别新栏目、系列报道、专题、特色策划；每条线索附原文依据供核验"
        />

        {/* 运行摘要（置顶突出） */}
        {runSummary && <RunSummaryCard data={runSummary} />}

        {/* 条件区：默认收起，压缩首屏高度 */}
        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] [box-shadow:var(--card-shadow)]">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm"
          >
            <span className="flex items-center gap-2 font-medium">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]">
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </span>
              筛选与识别条件
              {!filterOpen && (
                <span className="text-xs text-[var(--muted-foreground)]">已收起，点击展开</span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-150",
                filterOpen && "rotate-180"
              )}
            />
          </button>
          {filterOpen && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <LeadsFilter onIdentify={handleIdentify} loading={loading} />
            </div>
          )}
        </div>

        {/* 视图切换：今日待确认 / 历史线索库 */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { key: "active" as Scope, label: "今日待确认" },
            { key: "history" as Scope, label: "历史线索库" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setScope(tab.key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color] duration-150",
                scope === tab.key
                  ? "bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--brand-line)]"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--accent)]"
              )}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => loadClues(scope)}
            className="ml-auto text-xs text-[var(--muted-foreground)] hover:text-[var(--brand)]"
          >
            刷新
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>
        )}

        {/* 提示信息 */}
        {info && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">{info}</div>
        )}

        {/* 结果区 */}
        {loadingList ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <PageSkeleton key={i} lines={3} cards={0} withHeader={false} className="rounded-lg border border-[var(--border)] p-4" />
            ))}
          </div>
        ) : clues.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif font-bold text-[var(--foreground)]">
                {scope === "active" ? "今日待确认" : "历史线索库"}（{clues.length} 条）
              </h2>
              <div className="text-sm text-[var(--muted-foreground)]">
                {scope === "active" && <>待确认 {pendingCount} 条 · </>}
                已确认 {confirmedCount} 条
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clues.map((clue) => (
                <ClueCard
                  key={clue.id}
                  clue={clue}
                  onConfirm={scope === "active" ? handleConfirm : undefined}
                  onIgnore={scope === "active" ? handleIgnore : undefined}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            className="py-14"
            title={scope === "active" ? (runSummary?.identification?.executed===false&&runSummary?.identification?.pendingArticles===0&&runSummary?.identification?.errors?.length===0 ? "本轮未执行识别：待处理文章0篇" : "当前暂无新栏目线索") : "历史线索库暂无已确认线索"}
            description={
              scope === "active"
                ? "可在条件区选择 24 小时 / 3 天 / 7 天时间窗口后点击「开始识别」。"
                : "识别并确认过的新闻线索会沉淀到这里。"
            }
          />
        )}
      </div>
    </AppShell>
  );
}
