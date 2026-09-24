"use client";

import { Badge } from "@/components/ui/badge";
import { useEffect, useRef } from "react";
import { normalizeEventName } from "@/lib/calendar-engine";
import { calendarSourceLabel } from "@/lib/calendar-policy";
import type { CalEvent, CalCategory } from "./calendar-types";

type TagPalette = { bg: string; text: string; dot: string };
const defaultPalette: TagPalette = { bg: "#f0ece4", text: "#5a534a", dot: "#9a948a" };

function paletteForCategory(cat?: CalCategory | null): TagPalette {
  const name = cat?.category_name ?? "";
  if (/纪念日|节日/.test(name)) return { bg: "#f5f0f7", text: "#6b4a8a", dot: "#8f6cb0" };
  if (/党史|历史/.test(name)) return { bg: "#f3e4e2", text: "#a03a2f", dot: "#c0584b" };
  if (/总书记|讲话|论述/.test(name)) return { bg: "#f4e2e3", text: "#8f2f33", dot: "var(--brand)" };
  if (/重大会议|政策/.test(name)) return { bg: "#f0e6ef", text: "#7a3d88", dot: "#9a5aa8" };
  if (/国家战略|区域发展/.test(name)) return { bg: "#e4ebf4", text: "#2d5a8a", dot: "#3d7fbf" };
  if (/展会|会议|活动|行业/.test(name)) return { bg: "#e3eef7", text: "#1f6f9e", dot: "#2d8fc4" };
  if (/广东|广州/.test(name)) return { bg: "#f4e6d8", text: "#a05c22", dot: "var(--gold)" };
  return defaultPalette;
}

function tagStyle(ev: CalEvent): { bg: string; text: string; dot: string } {
  const p = paletteForCategory(ev.category);
  const isLocal = ev.region === "local";
  const bg = isLocal ? "#f4e6d8" : p.bg;
  const text = ev.importance === "S" ? "var(--brand)" : p.text;
  const dot = ev.importance === "S" ? "var(--brand)" : isLocal ? "var(--gold)" : p.dot;
  return { bg, text, dot };
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const regionMark = (region: string | null) =>
  region === "local" ? (
    <span
      className="ml-1 inline-block h-3 w-0.5 self-stretch rounded"
      style={{ backgroundColor: "var(--brand)" }}
      title="广东/广州"
    />
  ) : null;

interface Props {
  items: CalEvent[];
  todayStr: string; // YYYY-MM-DD
  year: number;
  selectedId: string | null;
  onSelect: (e: CalEvent) => void;
}

export function CalendarListView({ items, todayStr, year, selectedId, onSelect }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const focusToday = year === Number(todayStr.slice(0, 4));
  const datesKey = items.map(event => event.date).join(",");
  useEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>("[data-today-anchor]");
    container.scrollTop = focusToday && target ? target.offsetTop : 0;
  }, [focusToday, todayStr, year, datesKey]);
  // 按日期分组
  const groups: { date: string; events: CalEvent[] }[] = [];
  const todayHasEvent = items.some((e) => e.date === todayStr);

  for (const ev of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === ev.date) last.events.push(ev);
    else groups.push({ date: ev.date, events: [ev] });
  }
  if (focusToday && !todayHasEvent) {
    groups.push({ date: todayStr, events: [] });
    groups.sort((a, b) => a.date.localeCompare(b.date));
  }

  return (
    <div>
    {focusToday && <p className="mb-3 text-xs text-[var(--muted-foreground)]">从今天面向未来安排工作 · 向上滚动回看今年过去节点</p>}
    <div ref={viewport} role="region" aria-label="全年新闻节点时间轴" tabIndex={0} className="relative h-[65vh] min-h-80 overflow-y-auto overscroll-contain pr-2">
      {groups.map((g) => {
        const isToday = g.date === todayStr;
        const [y, m, d] = g.date.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        const wd = dateObj.getDay();
        return (
          <div key={g.date} data-today-anchor={isToday ? "true" : undefined} className="relative pl-5 pb-4">
            {/* 时间轴 */}
            <div className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-white" />
            {g !== groups[groups.length - 1] && (
              <div className="absolute left-[4px] top-5 bottom-0 w-px bg-[var(--border)]" />
            )}

            {/* 日期组头 */}
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[13px] font-medium text-[var(--foreground)]">
                {y}年{m}月{d}日 <span className="text-[var(--muted-foreground)]">周{WEEKDAYS[wd]}</span>
              </span>
              {isToday && (
                <Badge variant="secondary" className="text-[11px]">
                  今天
                </Badge>
              )}
            </div>

            {/* 当天节点（紧凑） */}
            <div className="space-y-0.5">
              {g.events.length === 0 && <p className="py-2 text-xs text-[var(--muted-foreground)]">今天暂无节点，以下为未来安排</p>}
              {g.events.map((ev) => {
                const selected = ev.id === selectedId;
                const dist =
                  isToday ? "今天" : ev.daysUntil > 0 ? `距今${ev.daysUntil}天` : `已过${-ev.daysUntil}天`;
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev)}
                    className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-left text-sm transition-shadow ${
                      selected
                        ? "ring-1 ring-inset ring-[var(--primary)]"
                        : "hover:ring-1 hover:ring-inset hover:ring-[var(--border)]"
                    }`}
                    style={{ backgroundColor: tagStyle(ev).bg }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tagStyle(ev).dot }}
                    />
                    <span
                      className="min-w-0 flex-1 basis-[calc(100%-1rem)] truncate font-medium"
                      style={{ color: tagStyle(ev).text }}
                    >
                      {ev.anniversary != null ? normalizeEventName(ev.event_name) : ev.event_name}
                      {ev.anniversary != null && (
                        <span className="ml-1 text-xs opacity-75">
                          {ev.anniversary}周年
                        </span>
                      )}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{calendarSourceLabel(ev.source, ev.source_type)}</Badge>
                    {ev.category && (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                        style={{
                          color: tagStyle(ev).text,
                          backgroundColor: "rgba(0,0,0,0.05)",
                        }}
                      >
                        {ev.category.category_name}
                      </span>
                    )}
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: tagStyle(ev).text, opacity: 0.65 }}
                    >
                      {dist}
                    </span>
                    {regionMark(ev.region)}
                    {ev.importance === "S" && (
                      <Badge className="bg-[var(--primary)] text-white">S</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="py-16 text-center text-sm text-[var(--muted-foreground)]">
          所选年份与筛选条件下暂无新闻节点
        </div>
      )}
    </div>
    </div>
  );
}
