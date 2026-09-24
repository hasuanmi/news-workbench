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
import { calendarSourceLabel } from "@/lib/calendar-policy";
import { getMonthExtras } from "@/lib/lunar-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalEvent, FloatingEvent } from "./calendar-types";

const WEEKDAY_HEADER = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKEND_INDEX = new Set([5, 6]); // 周六（下标5）、周日（6）

interface Props {
  todayStr: string;
  items: CalEvent[];
  floating: FloatingEvent[];
  viewDate: { y: number; m: number }; // 当前查看的年月（1-12）
  selectedId: string | null;
  anchorDate?: string; // 需要定位的节点日期 YYYY-MM-DD
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onSelect: (e: CalEvent) => void;
  onSelectFloating: (e: FloatingEvent) => void;
}

// 某单元格展开的"more"（date 键）
type MoreState = Record<string, boolean>;

// 网格单元格：补位月份也占位，非本月弱化展示
interface Cell {
  y: number;
  m: number;
  d: number;
  inMonth: boolean;
}

const MAX_PER_CELL = 2;

function buildGrid(y: number, m: number, daysInMonth: number, daysInPrev: number, leading: number): Cell[] {
  const cells: Cell[] = [];
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  for (let i = leading - 1; i >= 0; i--) {
    cells.push({ y: prevYear, m: prevMonth, d: daysInPrev - i, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y, m, d, inMonth: true });
  }
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  let extra = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ y: nextYear, m: nextMonth, d: extra, inMonth: false });
    extra++;
  }
  return cells;
}

export function CalendarMonthView({
  todayStr,
  items,
  floating,
  viewDate,
  selectedId,
  anchorDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelect,
  onSelectFloating,
}: Props) {
  const [more, setMore] = useState<MoreState>({});


  const firstDay = new Date(viewDate.y, viewDate.m - 1, 1);
  const daysInMonth = new Date(viewDate.y, viewDate.m, 0).getDate();
  const daysInPrev = new Date(viewDate.y, viewDate.m - 1, 0).getDate();
  // 周一为一周起始
  const leading = (firstDay.getDay() + 6) % 7;

  // 全部节点按日分组（含非本月补位格，弱化展示）
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of items) {
      const arr = map.get(ev.date) ?? [];
      arr.push(ev);
      map.set(ev.date, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const order = (x: CalEvent) =>
          x.importance === "S" ? 0 : x.importance === "A" ? 1 : 2;
        return order(a) - order(b) || a.event_name.localeCompare(b.event_name, "zh");
      });
    }
    return map;
  }, [items]);

  // 农历/节气/节日辅助信息（仅当前查看月；补位月不在此查）
  const monthExtras = useMemo(
    () => getMonthExtras(viewDate.y, viewDate.m),
    [viewDate],
  );
  const extraMap = useMemo(() => {
    const map = new Map<string, (typeof monthExtras)[number]["extra"]>();
    for (const md of monthExtras) map.set(md.date, md.extra);
    return map;
  }, [monthExtras]);

  // "本月待定"（月份已知）+ 完全未知
  const monthFloating = floating.filter((f) => f.date_status === "month_known" && f.candidate_month === viewDate.m);
  const timeUnknown = floating.filter((f) => f.date_status === "unknown");

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (c: Cell) => `${c.y}-${pad(c.m)}-${pad(c.d)}`;

  const cells = useMemo(
    () => buildGrid(viewDate.y, viewDate.m, daysInMonth, daysInPrev, leading),
    [viewDate, daysInMonth, daysInPrev, leading],
  );

  const isAnchor = (c: Cell) => anchorDate === fmt(c);

  const monthLabel = `${viewDate.y} 年 ${viewDate.m} 月`;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white/80 p-3 shadow-[0_4px_24px_rgba(75,50,30,0.035)] ring-1 ring-black/[0.035] sm:p-5">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-medium tracking-[0.2em] text-[var(--muted-foreground)]">新闻日历 · 全年工作底图</p>
            <h2 className="font-serif text-3xl font-bold tracking-tight" aria-label={monthLabel}>{viewDate.y}<span className="mx-2 text-base font-normal text-[var(--muted-foreground)]">年</span>{viewDate.m}<span className="ml-2 text-base font-normal text-[var(--muted-foreground)]">月</span></h2>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-[var(--muted)]/60 p-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onPrevMonth} aria-label="上个月"><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="rounded-full text-xs" onClick={onToday}>回到本月</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onNextMonth} aria-label="下个月"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </header>
        <div className="overflow-x-auto pb-1"><div className="min-w-[560px]">
          <div className="mb-2 grid grid-cols-7 text-center">{WEEKDAY_HEADER.map((w, i) => <div key={w} className={`py-2 text-[11px] font-medium ${WEEKEND_INDEX.has(i) ? "text-[var(--brand)]/65" : "text-[var(--muted-foreground)]"}`}>周{w}</div>)}</div>
          <div className="grid grid-cols-7 gap-1.5" aria-label={monthLabel + "节点"}>
            {cells.map(c => {
              const dateStr = fmt(c), dayEvents = byDay.get(dateStr) ?? [];
              const isToday = c.inMonth && dateStr === todayStr;
              const selected = isAnchor(c) || dayEvents.some(e => e.id === selectedId);
              const extra = extraMap.get(dateStr), hidden = dayEvents.length - MAX_PER_CELL;
              return <div key={dateStr} className={`min-h-[142px] min-w-0 rounded-xl p-2 transition-colors ${!c.inMonth ? "bg-[#f8f6f2]/60 opacity-40" : selected ? "bg-[#fbf0ed] ring-1 ring-[var(--brand)]/15" : "bg-[#faf9f6] hover:bg-[#f5f2ec]"}`}>
                <div className="flex items-center justify-between"><span className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full text-[26px] font-semibold leading-none tabular-nums ${isToday ? "bg-[var(--brand)] text-white" : "text-[var(--foreground)]"}`}>{c.d}</span>{isToday && <span className="text-[9px] text-[var(--brand)]">今天</span>}</div>
                <div className="mt-1 mb-2 h-4 truncate text-[10px] leading-4 text-[var(--muted-foreground)]/65" title={[extra?.lunar, extra?.solarTerm, ...(extra?.festivals ?? [])].filter(Boolean).join(" · ")}>{c.inMonth && [extra?.lunar, extra?.solarTerm, ...(extra?.festivals ?? [])].filter(Boolean).join(" · ")}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, MAX_PER_CELL).map(ev => <EventPill key={ev.id} event={ev} selected={ev.id === selectedId} onSelect={() => onSelect(ev)} />)}
                  {hidden > 0 && <Popover open={more[dateStr] ?? false} onOpenChange={open => setMore(previous => ({ ...previous, [dateStr]: open }))}>
                    <PopoverTrigger asChild><button className="rounded-md px-1 py-1 text-[10px] font-medium text-[var(--brand)] hover:bg-white" aria-label={dateStr + " 查看另外" + hidden + "个节点"}>+{hidden} 更多</button></PopoverTrigger>
                    <PopoverContent className="w-80 rounded-xl border-[var(--border)]/60 bg-[#fffdfa] p-4 shadow-lg">
                      <p className="mb-3 text-sm font-semibold">{dateStr} · {dayEvents.length} 个节点</p>
                      <div className="max-h-72 space-y-2 overflow-auto">{dayEvents.map(ev => <EventPill key={ev.id} event={ev} expanded selected={ev.id === selectedId} onSelect={() => { onSelect(ev); setMore(previous => ({ ...previous, [dateStr]: false })); }} />)}</div>
                    </PopoverContent>
                  </Popover>}
                </div>
              </div>;
            })}
          </div>
        </div></div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <FloatingSection title="本月待定" note={viewDate.m + "月 · 日期尚未确定"} items={monthFloating} onSelect={onSelectFloating} icon="month" />
        <FloatingSection title="时间待定" note={viewDate.y + "年 · 事件明确，时间待核实"} items={timeUnknown} onSelect={onSelectFloating} icon="unknown" />
      </div>
    </div>
  );
}

function EventPill({ event, selected, onSelect, expanded = false }: { event: CalEvent; selected: boolean; onSelect: () => void; expanded?: boolean }) {
  const label = event.anniversary != null ? normalizeEventName(event.event_name) + " " + event.anniversary + "周年" : event.event_name;
  return <button onClick={onSelect} title={label + " · " + calendarSourceLabel(event.source, event.source_type)} className={`flex w-full items-start gap-1 rounded-md px-1.5 py-1.5 text-left transition-colors ${selected ? "bg-white ring-1 ring-[var(--brand)]/30" : "bg-white/70 hover:bg-white hover:shadow-sm"}`}>
    <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${event.importance === "S" ? "bg-[var(--brand)]" : "bg-[#b6a18b]"}`} />
    <span className="min-w-0 flex-1"><span className={`text-[11px] leading-[1.45] text-[#554e47] ${expanded ? "block" : "line-clamp-2"}`}>{label}</span>{expanded && <span className="mt-1 block text-[10px] text-[var(--muted-foreground)]">{calendarSourceLabel(event.source, event.source_type)}</span>}</span>
    {event.importance && <span className={`mt-0.5 shrink-0 rounded border px-0.5 text-[8px] leading-3 ${event.importance === "S" ? "border-[var(--brand)]/20 text-[var(--brand)]" : "border-[#d8d1c8]/60 text-[#9b8e7e]"}`}>{event.importance}</span>}
  </button>;
}

function FloatingSection({ title, note, items, onSelect, icon }: { title: string; note: string; items: FloatingEvent[]; onSelect: (event: FloatingEvent) => void; icon: "month" | "unknown" }) {
  const Icon = icon === "month" ? CalendarClock : CalendarX;
  return <section className="rounded-2xl bg-white/70 p-4 ring-1 ring-black/[0.035]">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-[var(--brand)]/70" />{title}<span className="ml-auto text-xs font-normal text-[var(--muted-foreground)]">{items.length} 项</span></h3>
    <p className="mt-1 mb-3 text-[11px] text-[var(--muted-foreground)]">{note}</p>
    {items.length ? <div className="space-y-2">{items.map(event => <button key={event.id} onClick={() => onSelect(event)} className="flex w-full items-start gap-2 rounded-lg bg-[#f7f4ef] px-3 py-2 text-left hover:bg-[#f2ece4]"><span className="min-w-0 flex-1 text-xs leading-relaxed">{event.event_name}<span className="mt-1 block text-[10px] text-[var(--muted-foreground)]">{calendarSourceLabel(event.source, event.source_type)}</span></span><Badge variant="outline" className="rounded px-1 text-[9px] font-normal">{event.importance}</Badge></button>)}</div> : <p className="py-2 text-xs text-[var(--muted-foreground)]/70">暂无待定事项</p>}
  </section>;
}
