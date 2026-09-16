"use client";

import { Badge } from "@/components/ui/badge";
import { normalizeEventName } from "@/lib/calendar-engine";
import type { CalEvent } from "./calendar-types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const importanceBadge = (imp: string | null) => {
  if (imp === "S")
    return (
      <Badge className="bg-[var(--primary)] text-white">S</Badge>
    );
  if (imp === "A")
    return <Badge className="bg-[#c87f2d] text-white">A</Badge>;
  return (
    <Badge variant="outline" className="text-[#6b6257] border-[#c9c2b6]">
      B
    </Badge>
  );
};

const regionMark = (region: string | null) =>
  region === "local" ? (
    <span
      className="ml-1 inline-block h-3 w-0.5 self-stretch rounded"
      style={{ backgroundColor: "#b3392f" }}
      title="广东/广州"
    />
  ) : null;

interface Props {
  items: CalEvent[];
  todayStr: string; // YYYY-MM-DD
  selectedId: string | null;
  onSelect: (e: CalEvent) => void;
}

export function CalendarListView({ items, todayStr, selectedId, onSelect }: Props) {
  // 按日期分组
  const groups: { date: string; events: CalEvent[] }[] = [];
  const todayHasEvent = items.some((e) => e.date === todayStr);

  for (const ev of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === ev.date) last.events.push(ev);
    else groups.push({ date: ev.date, events: [ev] });
  }

  return (
    <div className="relative">
      {groups.map((g) => {
        const isToday = g.date === todayStr;
        const [y, m, d] = g.date.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        const wd = dateObj.getDay();
        return (
          <div key={g.date} className="relative pl-5 pb-4">
            {/* 时间轴 */}
            <div className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-white" />
            {g !== groups[groups.length - 1] && (
              <div className="absolute left-[4px] top-5 bottom-0 w-px bg-[var(--border)]" />
            )}

            {/* 日期组头 */}
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[13px] font-medium text-[var(--foreground)]">
                {m}月{d}日 <span className="text-[var(--muted-foreground)]">周{WEEKDAYS[wd]}</span>
              </span>
              {isToday && todayHasEvent && (
                <Badge variant="secondary" className="text-[11px]">
                  今天
                </Badge>
              )}
            </div>

            {/* 当天节点（紧凑） */}
            <div className="space-y-0.5">
              {g.events.map((ev) => {
                const selected = ev.id === selectedId;
                const dist =
                  isToday ? "今天" : ev.daysUntil > 0 ? `距今${ev.daysUntil}天` : `已过${-ev.daysUntil}天`;
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      selected
                        ? "bg-[var(--muted)] ring-1 ring-inset ring-[var(--border)]"
                        : "hover:bg-[var(--muted)]/60"
                    }`}
                  >
                    {importanceBadge(ev.importance)}
                    <span className="min-w-0 flex-1 truncate">
                      {normalizeEventName(ev.event_name)}
                      {ev.anniversary != null && (
                        <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                          {ev.anniversary}周年
                        </span>
                      )}
                    </span>
                    {ev.category && (
                      <span
                        className="shrink-0 text-xs"
                        style={{ color: ev.category.color }}
                      >
                        {ev.category.category_name}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                      {dist}
                    </span>
                    {regionMark(ev.region)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">
          未来 30 天暂无新闻节点
        </div>
      )}
    </div>
  );
}