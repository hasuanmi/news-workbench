"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LeadsFilter, type LeadsFilter as LeadsFilterType } from "@/components/leads/leads-filter";
import { ClueCard, type Clue } from "@/components/leads/clue-card";

export default function LeadsPage() {
  const [clues, setClues] = useState<Clue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 页面挂载时加载已存在的线索（已确认/待确认）
  const loadClues = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/leads?timeRange=all&pageSize=50");
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
    loadClues();
  }, [loadClues]);

  const handleIdentify = async (filter: LeadsFilterType) => {
    setLoading(true);
    setError(null);
    setInfo(null);
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
      // 去重：确保线索 id 唯一
      const uniqueClues = (data.clues || []).filter(
        (clue: Clue, index: number, self: Clue[]) =>
          index === self.findIndex((c) => c.id === clue.id)
      );
      setClues(uniqueClues);
      // AI 声明保留语义：识别完成但本次无新线索时给出明确提示
      const processed = data.stats?.processed ?? data.processed;
      const found = data.stats?.cluesFound ?? data.cluesFound;
      if (processed !== undefined && uniqueClues.length === 0) {
        setInfo(`本次扫描 ${processed} 篇${found !== undefined ? `，未发现新线索` : ""}。可在条件区调整时间范围/主题后重试。`);
      } else if (uniqueClues.length === 0) {
        setInfo("本次未识别到新线索，可调整条件后重试。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "识别失败");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (id: string) => {
    await fetch(`/api/admin/leads/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });
    setClues((prev) => prev.map((c) => (c.id === id ? { ...c, review_status: "confirmed" } : c)));
  };

  const handleIgnore = async (id: string) => {
    await fetch(`/api/admin/leads/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ignore" }),
    });
    setClues((prev) => prev.map((c) => (c.id === id ? { ...c, review_status: "ignored" } : c)));
  };

  const handleView = (id: string) => {
    // TODO: 打开线索详情弹窗
    console.log("View clue:", id);
  };

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">新闻线索</h1>
          <p className="text-sm text-[#6b6257] mt-1">
            从已入库文章中识别值得关注的新栏目、系列报道、专题、特色策划
          </p>
        </div>

        {/* 条件区 */}
        <LeadsFilter onIdentify={handleIdentify} loading={loading} />

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>
        )}

        {/* 提示信息 */}
        {info && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">{info}</div>
        )}

        {/* 结果区 */}
        {clues.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif font-bold text-[#1f1b16]">
                识别结果（{clues.length} 条）
              </h2>
              <div className="text-sm text-[#6b6257]">
                已确认 {clues.filter((c) => c.review_status === "confirmed").length} 条 · 待处理{" "}
                {clues.filter((c) => c.review_status === "pending").length} 条
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clues.map((clue) => (
                <ClueCard
                  key={clue.id}
                  clue={clue}
                  onConfirm={handleConfirm}
                  onIgnore={handleIgnore}
                  onView={handleView}
                />
              ))}
            </div>
          </div>
        )}

        {/* 空状态 */}
        {clues.length === 0 && !loading && (
          <div className="text-center py-12 text-[#6b6257]">
            <p className="text-sm">设置条件后点击「开始识别」，AI 将分析文章并生成线索卡片</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
