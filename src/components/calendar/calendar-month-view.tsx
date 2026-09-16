"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  CalendarX,
} from "lucide-react";
import { normalizeEventName } from "@/lib/calendar-engine";
import type { CalEvent, FloatingEvent } from "./calendar-types";

const WEEKDAY_HEADER = ["一", "二", "三", "四", "五", "六", "日"];

const importanceStyle = (imp: string | null) => {
  if (imp === "S")
    return { backgroundColor: "var(--primary)", color: "#fff", borderColor: "var(--primary)" };
  if (imp === "A")
    return { backgroundColor: "#c87f2d", color: "#fff", borderColor: "#c87f2d" };
  return { backgroundColor: "transparent", color: "#5a534a", borderColor: "#d6cfc2" };
};

interface Props {
  items: CalEvent[];
  floating: FloatingEvent[];
  viewDate: { y: number; m: number }; // 当前查看的年月（1-12）
  selectedId: string | null;
  anchorDate?: string; // 需要定位的节点日期 YYYY-MM-DD
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSelect: (e: CalEvent) => void;
}

// 某单元格展开的"more"（date 键）
type MoreState = Record<string, boolean>;

export function CalendarMonthView({
  items,
  floating,
  viewDate,
  selectedId,
  anchorDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelect,
}: Props) {
  const [more, setMore] = useState<MoreState>({});

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const firstDay = new Date(viewDate.y, viewDate.m - 1, 1);
  const daysInMonth = new Date(viewDate.y, viewDate.m, 0).getDate();
  // 周一为一周起始
  const leading = (firstDay.getDay() + 6) % 7;

  // 本月按日分组
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of items) {
      const [y, m] = ev.date.split("-").map(Number);
      if (y === viewDate.y && m === viewDate.m) {
        const arr = map.get(ev.date) ?? [];
        arr.push(ev);
        map.set(ev.date, arr);
      }
    }
    return map;
  }, [items, viewDate]);

  // "本月待定"（月份已知）
  const monthFloating = floating.filter((f) => f.date_status === "month_known");
  const timeUnknown = floating.filter((f) => f.date_status === "unknown");

  const MAX_PER_CELL = 3;

  const pad = (n: number) => String(n).padStart(2, "0");

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isAnchor = (d: number) =>
    anchorDate === `${viewDate.y}-${String(viewDate.m).padStart(2, "0")}-${pad(d)}`;

  return (
    <div>
      {/* 月历头部 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-medium">
            {viewDate.y} 年 {viewDate.m} 月
          </span>
          <Button size="sm" variant="outline" onClick={onNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onToday}>
            回到本月
          </Button>
          <Button size="sm" variant="ghost" onClick={onToday}>
            今天
          </Button>
        </div>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs font-medium text-[var(--muted-foreground)]">
        {WEEKDAY_HEADER.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (d == null)
            return <div key={`blank-${idx}`} className="min-h-[92px] rounded-md bg-transparent" />;
          const dateStr = `${viewDate.y}-${String(viewDate.m).padStart(2, "0")}-${pad(d)}`;
          const dayEvents = byDay.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const showAll = more[dateStr] ?? false;
          const visible = showAll ? dayEvents : dayEvents.slice(0, MAX_PER_CELL);
          const hidden = dayEvents.length - visible.length;
          const anchored = isAnchor(d);

          return (
            <div
              key={dateStr}
              className={`min-h-[92px] rounded-md border p-1 ${
                isToday
                  ? "border-[var(--primary)] bg-[var(--muted)]/40"
                  : anchored
                    ? "border-[var(--primary)] bg-[var(--muted)]/30"
                    : "border-[var(--border)] bg-white"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`text-xs font-medium ${
                    isToday ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {d}
                  {isToday && (
                    <span className="ml-1 rounded-sm bg-[var(--primary)] px-1 text-[9px] text-white">
                      今天
                    </span>
                  )}
                </span>
              </div>

              <div className="space-y-0.5">
                {visible.map((ev) => {
                  const selected = ev.id === selectedId;
                  const st = importanceStyle(ev.importance);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelect(ev)}
                      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors ${
                        selected ? "ring-1 ring-inset ring-[var(--primary)]" : ""
                      }`}
                      style={{
                        ...st,
                        ...(ev.region === "local"
                          ? { borderLeft: "3px solid var(--primary)", paddingLeft: "4px" }
                          : {}),
                      }}
                      title={ev.event_name}
                    >
                      {normalizeEventName(ev.event_name)}
                      {ev.anniversary != null && ` ${ev.anniversary}周年`}
                    </button>
                  );
                })}

                {hidden > 0 && (
                  <button
                    onClick={() => setMore((s) => ({ ...s, [dateStr]: !showAll }))}
                    className="block w-full rounded px-1.5 py-0.5 text-left text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  >
                    {showAll ? "收起" : `+${hidden} 更多`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 本月待定 */}
      {monthFloating.length > 0 && (
        <div className="mt-4 rounded-md border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-[var(--muted-foreground)]" />
            {viewDate.m} 月待定事项
          </div>
          <div className="flex flex-wrap gap-1.5">
            {monthFloating.map((f) => (
              <FloatingChip key={f.id} f={f} />
            ))}
          </div>
        </div>
      )}

      {/* 时间待定 */}
      {timeUnknown.length > 0 && (
        <div className="mt-4 rounded-md border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <CalendarX className="h-4 w-4 text-[var(--muted-foreground)]" />
            时间待定
          </div>
          <div className="flex flex-wrap gap-1.5">
            {timeUnknown.map((f) => (
              <FloatingChip key={f.id} f={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FloatingChip({ f }: { f: FloatingEvent }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1 text-xs">
      {normalizeEventName(f.event_name)}
      {f.importance && <Badge variant="outline" className="text-[10px]">{f.importance}</Badge>}
    </span>
  );
}