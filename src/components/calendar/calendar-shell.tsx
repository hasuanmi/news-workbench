"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/common/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Plus, List, CalendarDays } from "lucide-react";
import { CalendarListView } from "./calendar-list-view";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarDetailPanel, type DetailEntry } from "./calendar-detail-panel";
import { CalendarEditPanel } from "./calendar-edit-panel";
import { CalendarDeleteDialog } from "./calendar-delete-dialog";
import type { CalCategory, CalEvent, FloatingEvent } from "./calendar-types";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { ErrorState } from "@/components/common/error-state";
import { calendarSourceLabel } from "@/lib/calendar-policy";

type ViewMode = "list" | "month";

// UI 需要的事件的轻量字段（列表返回）
interface CalListEvent extends CalEvent {
  event_name: string;
}

export function CalendarShell() {
  const [view, setView] = useState<ViewMode>("list");
  const [range, setRange] = useState<"year" | "next30">("year");
  const [years, setYears] = useState<number[]>([]);
  const [todayStr, setTodayStr] = useState("");
  const [currentYear, setCurrentYear] = useState(0);
  const [needsCompletion, setNeedsCompletion] = useState<{ id: string; event_name: string; source?: string; source_type?: string; reason?: string }[]>([]);

  // 筛选
  const [categories, setCategories] = useState<CalCategory[]>([]);
  const [catFilter, setCatFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [importanceFilter, setImportanceFilter] = useState<string>("all");
  const [keyword, setKeyword] = useState("");

  // 数据
  const [items, setItems] = useState<CalListEvent[]>([]);
  const [floating, setFloating] = useState<FloatingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 选中与视图
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState({ y: 0, m: 1 });
  const [anchorDate, setAnchorDate] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<DetailEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DetailEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestId = useRef(0);
  useEffect(() => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [y, m] = day.split("-").map(Number);
    setTodayStr(day);
    setCurrentYear(y);
    setViewDate({ y, m });
  }, []);

  // 拉取分类与节点
  const load = useCallback(async () => {
    if (!viewDate.y) return;
    const request = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [catRes, evRes] = await Promise.all([
        fetch("/api/calendar/categories"),
        fetch(`/api/calendar?view=${range}&year=${viewDate.y}`),
      ]);
      const catData = await catRes.json();
      const evData = await evRes.json();
      if (request !== requestId.current) return;
      if (!catRes.ok || !evRes.ok) {
        throw new Error("新闻日历数据暂时无法加载，请重试；如持续失败，请检查数据库结构与连接。");
      }
      setCategories(Array.isArray(catData.items) ? catData.items : []);
      setItems(Array.isArray(evData.items) ? evData.items : []);
      setFloating(Array.isArray(evData.floating) ? evData.floating : []);
      setNeedsCompletion(evData.needsCompletion ?? []);
      setYears(evData.years ?? []);
      setCurrentYear(evData.currentYear);
    } catch (error) {
      if (request !== requestId.current) return;
      setLoadError(error instanceof Error ? error.message : "新闻日历加载失败，请重试。");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [viewDate.y, range]);

  useEffect(() => {
    load();
  }, [load]);

  // 筛选后的列表数据
  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (catFilter !== "all" && e.category?.id !== catFilter) return false;
      if (regionFilter === "local" && !["local", "guangdong", "guangzhou"].includes(e.region ?? "")) return false;
      if (regionFilter !== "all" && regionFilter !== "local" && e.region !== regionFilter) return false;
      if (importanceFilter !== "all" && e.importance !== importanceFilter) return false;
      if (keyword && !e.event_name.includes(keyword)) return false;
      return true;
    });
  }, [items, catFilter, regionFilter, importanceFilter, keyword]);

  const filteredFloating = useMemo(() => {
    return floating.filter((e) => {
      if (catFilter !== "all" && e.category?.id !== catFilter) return false;
      if (regionFilter === "local" && !["local", "guangdong", "guangzhou"].includes(e.region ?? "")) return false;
      if (regionFilter !== "all" && regionFilter !== "local" && e.region !== regionFilter) return false;
      if (importanceFilter !== "all" && e.importance !== importanceFilter) return false;
      if (keyword && !e.event_name.includes(keyword)) return false;
      return true;
    });
  }, [floating, catFilter, regionFilter, importanceFilter, keyword]);

  // 选中事件：搜索/定位到某日时，跳转该节点所在月
  const selectEvent = useCallback((e: CalListEvent) => {
    setSelectedId(e.id);
    if (e.date) {
      const [y, m] = e.date.split("-").map(Number);
      setViewDate({ y, m });
      setAnchorDate(e.date);
    }
  }, []);

  // 搜索：回车后尝试定位（跳到匹配节点所在月）
  const applySearch = useCallback(() => {
    if (!keyword.trim()) {
      return;
    }
    const hit = items.find((e) => e.event_name.includes(keyword));
    if (hit && hit.date) {
      const [y, m] = hit.date.split("-").map(Number);
      setViewDate({ y, m });
      setAnchorDate(hit.date);
    }
  }, [keyword, items]);

  // 维护操作
  const toggleEnabled = async (id: string, enabled: boolean) => {
    await fetch(`/api/admin/calendar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    load();
  };

  const confirmDelete = async (reason: string) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/calendar/${deleteTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete_reason: reason }),
      });
      setDeleteTarget(null);
      setSelectedId(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const moveMonth = (offset: number) => {
    setRange("year");
    setSelectedId(null);
    setViewDate(previous => {
      const next = new Date(previous.y, previous.m - 1 + offset, 1);
      return { y: next.getFullYear(), m: next.getMonth() + 1 };
    });
  };

  return (
    <div>
      <PageHeader
        title="新闻日历"
        subtitle="全年节点底图 · 动态 AI 补充 · 历史回看 · 跨年固定节点预览"
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* 左侧主内容 */}
      <div className="flex min-w-0 flex-col">
        {/* 工具栏 */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white/65 p-3 ring-1 ring-black/[0.035]">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="list">
                <List className="h-4 w-4 mr-1" /> 列表
              </TabsTrigger>
              <TabsTrigger value="month">
                <CalendarDays className="h-4 w-4 mr-1" /> 月历
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={viewDate.y ? String(viewDate.y) : ""} onValueChange={(value) => {
            setRange("year"); setSelectedId(null); setViewDate(date => ({ ...date, y: Number(value) }));
          }}>
            <SelectTrigger className="h-8 w-32" aria-label="日历年份"><SelectValue placeholder="选择年份" /></SelectTrigger>
            <SelectContent>
              {[...new Set([...years, viewDate.y])].filter(Boolean).sort((a, b) => a - b).map(year => (
                <SelectItem key={year} value={String(year)}>{year}年{year === currentYear + 1 ? " · 预览" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant={range === "year" ? "secondary" : "ghost"} onClick={() => setRange("year")}>全年</Button>
          <Button size="sm" variant={range === "next30" ? "secondary" : "ghost"} onClick={() => {
            setRange("next30"); setSelectedId(null); setViewDate({ y: currentYear, m: Number(todayStr.slice(5, 7)) });
          }}>未来30天</Button>

          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue placeholder="全部地区" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部地区</SelectItem>
              <SelectItem value="national">国内/国际</SelectItem>
              <SelectItem value="local">广东/广州</SelectItem>
            </SelectContent>
          </Select>

          <Select value={importanceFilter} onValueChange={setImportanceFilter}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="全部重要度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部重要度</SelectItem>
              <SelectItem value="S">S</SelectItem>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
            </SelectContent>
          </Select>

          <Input
            className="h-8 w-48"
            placeholder="搜索节点…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
          />

          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              setEditing(null);
              setShowCreate(true);
              setSelectedId(null);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> 新增节点
          </Button>
        </div>

        {/* 摘要条 */}
        <div className="mb-3 px-1 py-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
          {loading ? "正在更新日历…" : loadError ? "节点加载失败" : `${range === "next30" ? "未来 30 天" : `${viewDate.y} 年全年`}共 ${filtered.length} 个日期明确节点，${filteredFloating.length} 个时间待定事项`}
          {range === "year" && viewDate.y > currentYear && <span className="ml-2">固定 / 可推导节点提前预览，不复制本年度动态事件</span>}
          {range === "year" && viewDate.y < currentYear && <span className="ml-2">历史回看：保留原年度事项与来源</span>}
        </div>

        {/* 主内容区：不设内部滚动，页面自然撑开滚动 */}
        <div className="min-w-0 flex-1">
          {loading && items.length === 0 ? (
            <PageSkeleton lines={4} cards={2} withHeader={false} className="py-4" />
          ) : loadError ? (
            <ErrorState title="新闻日历加载失败" message={loadError} onRetry={load} />
          ) : view === "list" ? (
            <CalendarListView
              year={viewDate.y}
              items={filtered}
              todayStr={todayStr}
              selectedId={selectedId}
              onSelect={selectEvent}
            />
          ) : (
            <CalendarMonthView
              items={filtered}
              floating={filteredFloating}
              todayStr={todayStr}
              viewDate={viewDate}
              selectedId={selectedId}
              anchorDate={anchorDate}
              onPrevMonth={() => moveMonth(-1)}
              onSelectFloating={event => setSelectedId(event.id)}
              onNextMonth={() => moveMonth(1)}
              onToday={() => {
                setRange("year");
                setViewDate({ y: currentYear, m: Number(todayStr.slice(5, 7)) });
              }}
              onSelect={selectEvent}
            />
          )}
          {view === "list" && filteredFloating.length > 0 && (
            <section className="mt-6 rounded-lg border p-4">
              <h2 className="mb-3 font-semibold">{viewDate.y} 年时间待定事项</h2>
              {filteredFloating.map(event => <button key={event.id} onClick={() => setSelectedId(event.id)} className="flex w-full flex-wrap gap-2 border-t py-3 text-left text-sm">
                <span>{event.candidate_month ? `${event.candidate_month}月 · 日期待定` : "时间待定"}</span>
                <span className="flex-1 font-medium">{event.event_name}</span>
                <Badge variant="outline">{calendarSourceLabel(event.source, event.source_type)}</Badge>
              </button>)}
            </section>
          )}
          {needsCompletion.length > 0 && range === "year" && (
            <details className="mt-5 rounded-2xl bg-[#f2eee7]/80 p-4 text-sm ring-1 ring-black/[0.035]">
              <summary className="cursor-pointer font-medium text-[#796b59]">信息待补全 · {needsCompletion.length} 条原始线索已暂缓展示</summary>
              <p className="my-3 text-xs leading-relaxed text-[var(--muted-foreground)]">以下是待核实的原始记录，不属于正式新闻节点。仅在补齐具体事件名称与来源依据后展示。</p>
              <div className="divide-y divide-black/[0.04]">{needsCompletion.map(event => <div key={event.id} className="py-3"><div className="flex flex-wrap gap-2 text-xs"><span>原始名称：{event.event_name}</span><span className="text-[var(--muted-foreground)]">{calendarSourceLabel(event.source, event.source_type)}</span></div><p className="mt-1 text-[11px] text-[#8c7c68]">{event.reason}</p></div>)}</div>
            </details>
          )}
        </div>
      </div>

      {/* 右侧常驻面板：sticky 顶部，页面滚动时保持可见；内容超高时面板内部滚动 */}
      <aside className="min-w-0 overflow-hidden rounded-2xl bg-[#fffdfa] shadow-[0_6px_28px_rgba(75,50,30,0.05)] ring-1 ring-black/[0.04] xl:sticky xl:top-5 xl:max-h-[calc(100vh-3rem)]">
        {showCreate || editing ? (
          <CalendarEditPanel
            year={viewDate.y}
            categories={categories}
            editing={
              editing
                ? {
                    id: editing.id,
                    event_name: editing.event_name,
                    event_type: editing.event_type,
                    date_status: editing.date_status,
                    event_month: editing.event_month,
                    importance: editing.importance,
                    region: editing.region,
                    category_id: editing.category?.id,
                    description: editing.description,
                    original_date: editing.original_date,
                    event_date: editing.event_date,
                    enabled: editing.enabled,
                  }
                : null
            }
            onClose={() => {
              setShowCreate(false);
              setEditing(null);
            }}
            onSaved={load}
          />
        ) : (
          <CalendarDetailPanel
            eventId={selectedId}
            year={viewDate.y}
            onEdit={(e) => {
              setEditing(e);
              setShowCreate(false);
            }}
            onToggleEnabled={toggleEnabled}
            onRequestDelete={setDeleteTarget}
            onSaved={load}
          />
        )}
      </aside>

      {/* 删除原因弹窗 */}
      <CalendarDeleteDialog
        open={Boolean(deleteTarget)}
        eventName={deleteTarget?.event_name ?? ""}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
      </div>
    </div>
  );
}
