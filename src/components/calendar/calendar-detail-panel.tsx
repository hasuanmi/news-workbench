"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pencil, Power, Trash2, Sparkles } from "lucide-react";
import { normalizeEventName } from "@/lib/calendar-engine";
import type { CalDetail } from "./calendar-types";

const regionLabel = (r?: string) => (r === "local" ? "广东/广州" : "国内/国际");

const SOURCE_LABEL: Record<string, string> = {
  ai_recommend: "AI 推荐",
  history_migrate: "历史迁移",
  user_add: "用户新增",
  user_paste: "用户粘贴",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  fixed: "固定节点",
  dynamic: "动态节点",
};

// 详情字段名：数据库列 description 承载背景信息
type DetailEntry = {
  id: string;
  event_name: string;
  event_type: string;
  original_date: string | null;
  event_date: string | null;
  description: string | null;
  enabled: boolean;
  source?: string | null;
  source_name?: string | null;
  category?: ({ id?: string } & NonNullable<Partial<CalDetail>["category"]>) | null;
} & Omit<
  Partial<CalDetail>,
  "category"
>;

interface Props {
  eventId: string | null;
  onEdit: (e: DetailEntry) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onRequestDelete: (e: DetailEntry) => void;
  onSaved?: () => void;
}

export function CalendarDetailPanel({
  eventId,
  onEdit,
  onToggleEnabled,
  onRequestDelete,
  onSaved,
}: Props) {
  const [detail, setDetail] = useState<DetailEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // AI 总结
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setDetail(null);
    setNotFound(false);
    setSummary("");
    setSummaryError(null);
    setSummaryLoading(false);
    abortRef.current?.abort();
    fetch(`/api/calendar/${eventId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) return null;
        return (d.item ?? null) as DetailEntry | null;
      })
      .then((d) => {
        setDetail(d);
        if (!d) setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    return () => abortRef.current?.abort();
  }, [eventId]);

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
  const source = detail?.source ?? null;
  const sourceLabel = source ? SOURCE_LABEL[source] ?? source : null;

  return (
    <div className="flex h-full flex-col">
      {!eventId ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
          选择一个新闻节点查看详情
        </div>
      ) : loading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : notFound || !detail ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
          未找到节点详情
        </div>
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-4">
              {/* 标题 */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-serif text-lg leading-snug">
                    {normalizeEventName(detail.event_name)}
                  </h2>
                  <Badge variant="outline" className="shrink-0">
                    {EVENT_TYPE_LABEL[detail.event_type] ?? detail.event_type}
                  </Badge>
                </div>
              </div>

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
                    {detail.event_year
                      ? `（${detail.event_year} 年起）`
                      : detail.anniversary_base_year
                        ? `（${detail.anniversary_base_year} 年起）`
                        : ""}
                  </Badge>
                )}
                {!detail.enabled && (
                  <Badge variant="outline" className="text-amber-700 border-amber-600">
                    已停用
                  </Badge>
                )}
              </div>

              {/* 来源 */}
              {(sourceLabel || detail.source_name) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {sourceLabel && (
                    <Badge variant="outline">来源：{sourceLabel}</Badge>
                  )}
                  {detail.source_name && (
                    <span className="text-[var(--muted-foreground)]">
                      {detail.source_name}
                    </span>
                  )}
                </div>
              )}

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

              {/* 背景信息 */}
              <section>
                <h3 className="text-sm font-semibold mb-1.5">背景信息</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {detail.description || "暂无背景信息，可点击「编辑」补充。"}
                </p>
              </section>

              {/* AI 选题策划建议 */}
              <section className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> AI 选题策划建议
                  </h3>
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
                {summaryError && <p className="text-sm text-red-700">{summaryError}</p>}
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
            </div>
          </ScrollArea>

          {/* 操作条 */}
          <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
            <Button size="sm" variant="outline" onClick={() => onEdit(detail)}>
              <Pencil className="h-4 w-4 mr-1" /> 编辑
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleEnabled(detail.id, !detail.enabled)}
            >
              <Power className="h-4 w-4 mr-1" />
              {detail.enabled ? "停用" : "启用"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-700 border-red-300 hover:bg-red-50"
              onClick={() => onRequestDelete(detail)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> 删除
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export type { DetailEntry };