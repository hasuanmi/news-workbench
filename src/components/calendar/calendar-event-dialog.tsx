"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OccurrenceItem {
  id: string;
  event_name: string;
  date: string;
}

interface EventDetail extends OccurrenceItem {
  event_type: string;
  region: string;
  importance: string;
  background: string | null;
  planning_hint: unknown;
  source: string | null;
  tags: unknown;
  anniversary_base_year: number | null;
  category?: { code: string; category_name: string; color: string };
}

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

  useEffect(() => {
    if (!item || !open) return;
    setLoading(true);
    setDetail(null);
    fetch(`/api/calendar/${item.id}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.item ?? null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [item, open]);

  const hints: string[] = Array.isArray(detail?.planning_hint)
    ? (detail!.planning_hint as string[])
    : [];
  const tags: string[] = Array.isArray(detail?.tags) ? (detail!.tags as string[]) : [];

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
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : detail ? (
            <div className="space-y-4 pr-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">重要度 {detail.importance} 级</Badge>
                <Badge variant="secondary">
                  {detail.region === "local" ? "广东/广州" : "国内/国际"}
                </Badge>
                {detail.category && (
                  <Badge variant="secondary" style={{ color: detail.category.color }}>
                    {detail.category.category_name}
                  </Badge>
                )}
                {detail.anniversary_base_year && (
                  <Badge variant="secondary">基准年 {detail.anniversary_base_year}</Badge>
                )}
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              <section>
                <h3 className="text-sm font-semibold mb-1.5">背景信息</h3>
                <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                  {detail.background || "暂无背景信息"}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-1.5">建议策划方向</h3>
                {hints.length > 0 ? (
                  <ul className="text-sm space-y-1 list-disc pl-5">
                    {hints.map((h, i) => (
                      <li key={i} className="leading-relaxed">
                        {h}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">暂无策划建议</p>
                )}
              </section>

              {detail.source && (
                <p className="text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3">
                  来源：{detail.source}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">未找到节点详情</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
