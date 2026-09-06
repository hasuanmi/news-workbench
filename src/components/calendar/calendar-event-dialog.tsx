"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface OccurrenceItem {
  id: string;
  event_name: string;
  date: string;
}

interface EventDetail extends OccurrenceItem {
  event_type: string;
  region: string;
  importance: string;
  description: string | null;
  source_name: string | null;
  tags: string[];
  anniversary: number | null;
  anniversary_base_year: number | null;
  review_status: string;
  enabled: boolean;
  category?: { code: string; category_name: string; color: string } | null;
}

const regionLabel = (r: string) => (r === "local" ? "广东/广州" : "国内/国际");

export function CalendarEventDialog({
  item,
  open,
  onOpenChange,
}: {
  item: OccurrenceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // AI 总结
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!item || !open) return;
    setLoading(true);
    setDetail(null);
    setNotFound(false);
    setSummary("");
    setSummaryError(null);
    setSummaryLoading(false);
    abortRef.current?.abort();
    fetch(`/api/calendar/${item.id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return (d.item ?? null) as EventDetail | null;
      })
      .then((d) => {
        setDetail(d);
        if (!d) setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    return () => abortRef.current?.abort();
  }, [item, open]);

  const generateSummary = async () => {
    if (!detail || summaryLoading) return;
    setSummaryLoading(true);
    setSummary("");
    setSummaryError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/calendar/${detail.id}/summary`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setSummaryError("AI 总结生成失败，请稍后重试");
        setSummaryLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload) as { text?: string; error?: string };
            if (obj.error) setSummaryError(obj.error);
            else if (obj.text) setSummary((s) => s + obj.text);
          } catch {
            // 忽略不完整分片
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSummaryError("AI 总结生成失败，请稍后重试");
      }
    } finally {
      setSummaryLoading(false);
    }
  };

  const tags: string[] = detail?.tags ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2 flex-wrap">
            {detail?.event_name ?? item?.event_name}
            {detail && (
              <Badge variant="outline">
                {detail.event_type === "fixed" ? "固定节点" : "动态节点"}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : notFound || !detail ? (
            <p className="text-sm text-[var(--muted-foreground)]">未找到节点详情</p>
          ) : (
            <div className="space-y-4 pr-4">
              {/* 元信息 */}
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">重要度 {detail.importance} 级</Badge>
                <Badge variant="secondary">{regionLabel(detail.region)}</Badge>
                {detail.category && (
                  <Badge variant="secondary" style={{ color: detail.category.color }}>
                    {detail.category.category_name}
                  </Badge>
                )}
                {detail.anniversary != null && (
                  <Badge variant="secondary">
                    今年 {detail.anniversary} 周年
                    {detail.anniversary_base_year ? `（${detail.anniversary_base_year} 年起）` : ""}
                  </Badge>
                )}
                {detail.review_status !== "approved" && (
                  <Badge variant="outline" className="text-amber-700 border-amber-600">
                    {detail.review_status === "pending" ? "待审核" : "已停用/归档"}
                  </Badge>
                )}
              </div>

              {/* 标签 */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              {/* 背景 / 描述 */}
              <section>
                <h3 className="text-sm font-semibold mb-1.5">背景信息</h3>
                <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                  {detail.description || "暂无背景信息，可在后台节点管理中补充。"}
                </p>
              </section>

              {/* AI 选题策划建议 */}
              <section className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">AI 选题策划建议</h3>
                  <Button
                    size="sm"
                    variant={summary ? "outline" : "default"}
                    onClick={generateSummary}
                    disabled={summaryLoading}
                  >
                    {summaryLoading ? "生成中…" : summary ? "重新生成" : "生成建议"}
                  </Button>
                </div>
                {summaryLoading && !summary && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    AI 正在分析节点信息，请稍候…
                  </p>
                )}
                {summaryError && (
                  <p className="text-sm text-red-700">{summaryError}</p>
                )}
                {summary && (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold">
                    {summary}
                  </div>
                )}
                {!summary && !summaryLoading && !summaryError && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    点击「生成建议」，AI 将结合节点背景与本地视角给出选题方向。
                  </p>
                )}
              </section>

              {detail.source_name && (
                <p className="text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3">
                  来源：{detail.source_name}
                </p>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
