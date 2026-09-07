"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ReviewFilter, type ReviewFilter as ReviewFilterType } from "@/components/review/review-filter";
import { ReviewResult, type ReviewResult as ReviewResultType } from "@/components/review/review-result";

export default function ReviewPage() {
  const [result, setResult] = useState<ReviewResultType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (filter: ReviewFilterType) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/review/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: filter.date.toISOString(),
          mediaIds: filter.mediaIds,
          minWordCount: filter.minWordCount,
          highlightFlags: filter.highlightFlags,
          dimensions: filter.dimensions,
          topics: filter.topics,
          scanMissing: filter.scanMissing,
          customRequirement: filter.customRequirement,
        }),
      });
      if (!res.ok) throw new Error("生成失败");
      const data = await res.json();
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">每日评报</h1>
          <p className="text-sm text-[#6b6257] mt-1">选择条件后，AI 对当天媒体报道进行横向比较并生成评报</p>
        </div>

        {/* 条件区 */}
        <ReviewFilter onGenerate={handleGenerate} loading={loading} />

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>
        )}

        {/* 结果区 */}
        {result && <ReviewResult result={result} />}

        {/* 空状态 */}
        {!result && !loading && (
          <div className="text-center py-12 text-[#6b6257]">
            <p className="text-sm">设置条件后点击「生成每日评报」，AI 将分析当天报道并生成结构化评报</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
