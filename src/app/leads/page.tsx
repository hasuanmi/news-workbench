"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LeadsFilter, type LeadsFilter as LeadsFilterType } from "@/components/leads/leads-filter";
import { ClueCard, type Clue } from "@/components/leads/clue-card";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { toast } from "sonner";

type Scope = "active" | "history";

export default function LeadsPage() {
  const [clues, setClues] = useState<Clue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("active");

  // 页面挂载时加载窗口内的今日待确认 + 已确认线索
  const loadClues = useCallback(async (sc: Scope) => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads?scope=${sc}&pageSize=50`);
      if (!res.ok) throw new Error("加载线索失败");
      const data = await res.json();
      setClues(data.clues || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载线索失败");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadClues(scope);
  }, [scope, loadClues]);

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
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">新闻线索</h1>
          <p className="text-sm text-[#6b6257] mt-1">
            从时间窗口内的新文章中识别新栏目、系列报道、专题、特色策划；每条线索附原文依据供核验
          </p>
        </div>

        {/* 条件区 */}
        <LeadsFilter onIdentify={handleIdentify} loading={loading} />

        {/* 视图切换：今日待确认 / 历史线索库 */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { key: "active" as Scope, label: "今日待确认" },
            { key: "history" as Scope, label: "历史线索库" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setScope(tab.key)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                scope === tab.key
                  ? "bg-[#b3392f] text-white border-[#b3392f]"
                  : "bg-white text-[#6b6257] border-[#e8e2d8] hover:bg-[#faf7f2] hover:border-[#d8d0bf]"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => loadClues(scope)}
            className="ml-auto text-xs text-[#6b6257] hover:text-[#b3392f]"
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
              <PageSkeleton key={i} lines={3} cards={0} withHeader={false} className="rounded-lg border border-[#eeeadd] p-4" />
            ))}
          </div>
        ) : clues.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif font-bold text-[#1f1b16]">
                {scope === "active" ? "今日待确认" : "历史线索库"}（{clues.length} 条）
              </h2>
              <div className="text-sm text-[#6b6257]">
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
            title={scope === "active" ? "今天暂未发现新栏目" : "历史线索库暂无已确认线索"}
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
