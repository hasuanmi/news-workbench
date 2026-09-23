"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Briefing {
  id: string;
  week_start: string;
  sections: {
    new_columns?: string;
    key_series?: string;
    focus_topics?: string;
    features?: string;
  };
  final_summary: string;
  review_status: string;
  created_at: string;
}

export function WeeklyBriefingList() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");

  const fetchBriefings = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leads/weekly?limit=10");
    const data = await res.json();
    if (data.success) {
      setBriefings(data.briefings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBriefings();
  }, [fetchBriefings]);

  const handleGenerate = async () => {
    setGenerating(true);
    setStreamContent("");

    const res = await fetch("/api/admin/leads/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!res.body) {
      setGenerating(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            setGenerating(false);
            fetchBriefings();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              setStreamContent((prev) => prev + parsed.content);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-6">
      {/* 生成按钮 */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-[var(--brand)] hover:bg-[#9a2f26] text-white"
        >
          {generating ? "生成中..." : "生成本周简报"}
        </Button>
        <span className="text-sm text-[var(--muted-foreground)]">
          基于过去 7 天已发布的新闻线索生成媒体简报
        </span>
      </div>

      {/* 流式生成预览 */}
      {streamContent && (
        <Card className="border-[var(--brand)]/30 bg-[#fff9f5]">
          <CardContent className="p-4">
            <h3 className="font-medium text-[var(--brand)] mb-2">正在生成...</h3>
            <div className="prose prose-sm max-w-none text-[var(--foreground)] whitespace-pre-wrap">
              {streamContent}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 历史周报列表 */}
      {loading ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">加载中...</div>
      ) : briefings.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p className="text-lg mb-2">暂无周报</p>
          <p className="text-sm">点击「生成本周简报」开始</p>
        </div>
      ) : (
        <div className="space-y-4">
          {briefings.map((briefing) => (
            <Card key={briefing.id} className="border-[var(--border)] shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-serif font-bold text-lg text-[var(--foreground)]">
                    {briefing.week_start} 周报
                  </h3>
                  <span className="text-xs px-2 py-0.5 bg-[var(--border)] text-[var(--muted-foreground)] rounded">
                    {briefing.review_status === "approved" ? "已发布" : "待审核"}
                  </span>
                </div>

                {briefing.final_summary && (
                  <p className="text-sm text-[var(--muted-foreground)] mb-3 italic">
                    {briefing.final_summary}
                  </p>
                )}

                <div className="space-y-3 text-sm">
                  {briefing.sections.new_columns && (
                    <div>
                      <h4 className="font-medium text-[var(--brand)] mb-1">新栏目动态</h4>
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">
                        {briefing.sections.new_columns}
                      </p>
                    </div>
                  )}
                  {briefing.sections.key_series && (
                    <div>
                      <h4 className="font-medium text-[var(--gold)] mb-1">重点系列</h4>
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">
                        {briefing.sections.key_series}
                      </p>
                    </div>
                  )}
                  {briefing.sections.focus_topics && (
                    <div>
                      <h4 className="font-medium text-[var(--muted-foreground)] mb-1">关注专题</h4>
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">
                        {briefing.sections.focus_topics}
                      </p>
                    </div>
                  )}
                  {briefing.sections.features && (
                    <div>
                      <h4 className="font-medium text-[#3f7d5c] mb-1">特色策划</h4>
                      <p className="text-[var(--foreground)] whitespace-pre-wrap">
                        {briefing.sections.features}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
