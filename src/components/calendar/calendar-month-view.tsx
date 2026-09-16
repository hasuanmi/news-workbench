"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  CalendarX,
  MapPin,
  Star,
} from "lucide-react";
import { normalizeEventName } from "@/lib/calendar-engine";
import { getMonthExtras } from "@/lib/lunar-calendar";
import type { CalEvent, FloatingEvent, CalCategory } from "./calendar-types";

const WEEKDAY_HEADER = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKEND_INDEX = new Set([5, 6]); // 周六（下标5）、周日（6）

// —— 事件标签颜色体系（浅底色 + 深色文字，胶囊标签）——
// 依据：事件类型（分类）为主色调；本地/重要级用辅助标记叠加。
type TagPalette = { bg: string; text: string; dot: string };
const defaultPalette: TagPalette = { bg: "#f0ece4", text: "#5a534a", dot: "#9a948a" };

function paletteForCategory(cat?: CalCategory | null): TagPalette {
  const name = cat?.category_name ?? "";
  if (/纪念日|节日/.test(name)) return { bg: "#efe9f3", text: "#6b4a8a", dot: "#8f6cb0" }; // 纪念日/周年 偏紫灰
  if (/党史|历史/.test(name)) return { bg: "#f3e4e2", text: "#a03a2f", dot: "#c0584b" }; // 重大历史 深红
  if (/总书记|讲话|论述/.test(name)) return { bg: "#f4e2e3", text: "#8f2f33", dot: "#b3392f" }; // 政治/讲话 紫红深红
  if (/重大会议|政策/.test(name)) return { bg: "#f0e6ef", text: "#7a3d88", dot: "#9a5aa8" }; // 重大会议/政策 紫红
  if (/国家战略|区域发展/.test(name)) return { bg: "#e4ebf4", text: "#2d5a8a", dot: "#3d7fbf" }; // 区域战略 蓝
  if (/展会|会议|活动|行业/.test(name)) return { bg: "#e3eef7", text: "#1f6f9e", dot: "#2d8fc4" }; // 经济/产业/展会 蓝
  if (/广东|广州/.test(name)) return { bg: "#f4e6d8", text: "#a05c22", dot: "#c87f2d" }; // 广东/广州本地 橙棕
  return defaultPalette;
}

/** 标签完整样式：底色按分类类型，本地节点叠加橙棕、S/A 级叠加强调点 */
function tagStyle(ev: CalEvent): { bg: string; text: string; dot: string; isLocal: boolean; isImportant: boolean } {
  const p = paletteForCategory(ev.category);
  const isLocal = ev.region === "local";
  const isImportant = ev.importance === "S" || ev.importance === "A";
  let bg = p.bg;
  // 本地节点：橙棕强调
  if (isLocal) bg = "#f4e6d8";
  // S 级节点：朱砂红作强调（浅底色版本保持克制）
  const text = isImportant && ev.importance === "S" ? "#b3392f" : p.text;
  const dot = isImportant && ev.importance === "S" ? "#b3392f" : isLocal ? "#c87f2d" : p.dot;
  return { bg, text, dot, isLocal, isImportant };
}

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

// 网格单元格：补位月份也占位，非本月弱化展示
interface Cell {
  y: number;
  m: number;
  d: number;
  inMonth: boolean;
}

const MAX_PER_CELL = 3;

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
  const monthFloating = floating.filter((f) => f.date_status === "month_known");
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
    <div className="pb-4">
      {/* 月历头部：年月标题（强存在感） + 翻页 + 回到本月/今天 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            onClick={onPrevMonth}
            aria-label="上个月"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {monthLabel}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            onClick={onNextMonth}
            aria-label="下个月"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onToday}>
            今天
          </Button>
          <Button size="sm" variant="outline" onClick={onToday}>
            回到本月
          </Button>
        </div>
      </div>

      {/* 星期栏：独立一行，周末用浅朱砂文字 */}
      <div className="mb-1 grid grid-cols-7 pb-2 text-center">
        {WEEKDAY_HEADER.map((w, i) => (
          <div
            key={w}
            className={`text-sm font-semibold ${
              WEEKEND_INDEX.has(i) ? "text-[#b3392f]/70" : "text-[var(--muted-foreground)]"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格：弱化方形网格感，用极浅细线分隔；日期自然撑开，页面滚动 */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--border)]/60 bg-[#ece7dc]">
        {cells.map((c, idx) => {
          const dateStr = fmt(c);
          const dayEvents = byDay.get(dateStr) ?? [];
          const isToday = !c.inMonth ? false : dateStr === todayStr;
          const anchored = isAnchor(c);
          const hasSelectedHere = dayEvents.some((e) => e.id === selectedId);
          const selectedCell = (anchored || hasSelectedHere) && !isToday;
          const showAll = more[dateStr] ?? false;
          const visible = showAll ? dayEvents : dayEvents.slice(0, MAX_PER_CELL);
          const hidden = dayEvents.length - visible.length;
          const extra = extraMap.get(dateStr);

          return (
            <div
              key={`${dateStr}-${idx}`}
              className={`flex min-h-[118px] flex-col px-2 pb-2 pt-1.5 transition-colors ${
                c.inMonth ? "bg-white" : "bg-[#faf8f3]"
              } ${selectedCell ? "bg-[#fdf4f1]" : ""} ${
                !c.inMonth ? "opacity-45" : ""
              } hover:bg-[#fcf8f3]`}
            >
              {/* 日期主视觉：大号粗体公历 + 农历小字 */}
              <div className="flex items-baseline justify-between">
                <div className="flex flex-col items-start">
                  <span
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[21px] font-semibold leading-none ${
                      isToday
                        ? "bg-[#f5ddd8] text-[var(--primary)]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {c.d}
                  </span>
                  {c.inMonth && extra?.lunar && (
                    <span className="mt-0.5 text-[11px] leading-none text-[var(--muted-foreground)]/75">
                      {extra.lunar}
                    </span>
                  )}
                </div>
                {c.inMonth && dayEvents.length > 0 && !showAll && (
                  <span className="mt-0.5 text-[10px] font-medium tabular-nums text-[var(--muted-foreground)]/60">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* 节气 / 节日小标签（紫底，自然嵌在日期下） */}
              {c.inMonth && (extra?.solarTerm || (extra?.festivals ?? []).length > 0) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {extra!.solarTerm && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-[#efe9f3] px-1 py-px text-[10px] font-medium text-[#6b4a8a]">
                      <Star className="h-2.5 w-2.5" />
                      {extra!.solarTerm}
                    </span>
                  )}
                  {(extra!.festivals ?? []).slice(0, 2).map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center rounded bg-[#f4ead6] px-1 py-px text-[10px] font-medium text-[#a05c22]"
                    >
                      {f}
                    </span>
                  ))}
                  {(extra!.festivals ?? []).length > 2 && (
                    <span className="text-[10px] text-[var(--muted-foreground)]/60">
                      +{(extra!.festivals ?? []).length - 2}
                    </span>
                  )}
                </div>
              )}

              {/* 事件胶囊平铺 */}
              {dayEvents.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-1">
                  {visible.map((ev) => {
                    const selected = ev.id === selectedId;
                    const t = tagStyle(ev);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onSelect(ev)}
                        title={ev.event_name}
                        className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow ${
                          selected ? "ring-1 ring-inset ring-[var(--primary)] bg-white/70" : ""
                        } hover:shadow-sm`}
                        style={{ backgroundColor: t.bg, color: t.text }}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: t.dot }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {normalizeEventName(ev.event_name)}
                          {ev.anniversary != null && (
                            <span className="opacity-75"> {ev.anniversary}周年</span>
                          )}
                        </span>
                        {t.isImportant && (
                          <Badge className="shrink-0 bg-white/40 px-1 text-[9px] text-inherit" variant="outline">
                            {ev.importance}
                          </Badge>
                        )}
                      </button>
                    );
                  })}

                  {hidden > 0 && (
                    <button
                      onClick={() => setMore((s) => ({ ...s, [dateStr]: !showAll }))}
                      className="w-fit rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    >
                      {showAll ? "收起" : `+${hidden} 更多`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 本月待定 + 时间待定 */}
      <div className="mt-4 flex flex-col gap-4 md:flex-row">
        {monthFloating.length > 0 && (
          <div className="flex-1 rounded-lg border border-[var(--border)]/70 bg-white p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
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

        {timeUnknown.length > 0 && (
          <div className="flex-1 rounded-lg border border-[var(--border)]/70 bg-white p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
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
    </div>
  );
}

function FloatingChip({ f }: { f: FloatingEvent }) {
  const p = paletteForCategory(f.category);
  const isLocal = f.region === "local";
  const bg = isLocal ? "#f4e6d8" : p.bg;
  const dot = isLocal ? "#c87f2d" : p.dot;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
      style={{ backgroundColor: bg, color: p.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
      {normalizeEventName(f.event_name)}
      {isLocal && <MapPin className="ml-0.5 h-3 w-3 opacity-70" />}
      {f.importance && (
        <Badge variant="outline" className="ml-0.5 text-[10px]">
          {f.importance}
        </Badge>
      )}
    </span>
  );
}