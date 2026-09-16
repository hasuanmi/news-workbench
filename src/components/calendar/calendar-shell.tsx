"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type ViewMode = "list" | "month";

// UI 需要的事件的轻量字段（列表返回）
interface CalListEvent extends CalEvent {
  event_name: string;
}

export function CalendarShell() {
  const [view, setView] = useState<ViewMode>("list");

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

  // 选中与视图
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<{ y: number; m: number }>(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1 };
  });
  const [anchorDate, setAnchorDate] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<DetailEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DetailEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // 拉取分类与节点
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, evRes] = await Promise.all([
        fetch("/api/calendar/categories"),
        fetch("/api/calendar?view=next30"),
      ]);
      const catData = await catRes.json();
      const evData = await evRes.json();
      setCategories(Array.isArray(catData.items) ? catData.items : []);
      setItems(Array.isArray(evData.items) ? evData.items : []);
      setFloating(Array.isArray(evData.floating) ? evData.floating : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 筛选后的列表数据
  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (catFilter !== "all" && e.category?.id !== catFilter) return false;
      if (regionFilter !== "all" && e.region !== regionFilter) return false;
      if (importanceFilter !== "all" && e.importance !== importanceFilter) return false;
      if (keyword && !e.event_name.includes(keyword)) return false;
      return true;
    });
  }, [items, catFilter, regionFilter, importanceFilter, keyword]);

  // 仅影响列表视图总数；月历仍展示全量（工具栏筛选仍作用于月历标签？保持一致性：月历也按筛选展示）
  const monthFiltered = useMemo(() => {
    return items.filter((e) => {
      if (catFilter !== "all" && e.category?.id !== catFilter) return false;
      if (regionFilter !== "all" && e.region !== regionFilter) return false;
      if (importanceFilter !== "all" && e.importance !== importanceFilter) return false;
      return true;
    });
  }, [items, catFilter, regionFilter, importanceFilter]);

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
      const n = new Date();
      setViewDate({ y: n.getFullYear(), m: n.getMonth() + 1 });
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

  const freshSearch = (v: string) => {
    setKeyword(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(applySearch, 400);
  };

  return (
    <div>
      {/* 页面标题：与其他页面一致，置于筛选栏上方 */}
      <header className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">新闻日历</h1>
        <p className="text-sm text-[#6b6257] mt-1">按分类 / 地区 / 重要度筛选，列表或月历查看全年重点节点</p>
      </header>
      <div className="flex gap-0">
      {/* 左侧主内容 */}
      <div className="flex min-w-0 flex-1 flex-col border-r border-[var(--border)]">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
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
            onChange={(e) => freshSearch(e.target.value)}
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
        <div className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-2 text-sm text-[var(--muted-foreground)]">
          {loading ? "加载中…" : `未来 30 天共 ${filtered.length} 个节点`}
        </div>

        {/* 主内容区：不设内部滚动，页面自然撑开滚动 */}
        <div className="flex-1 p-4">
          {loading ? (
            <PageSkeleton lines={4} cards={2} withHeader={false} className="py-4" />
          ) : view === "list" ? (
            <CalendarListView
              items={filtered}
              todayStr={todayStr}
              selectedId={selectedId}
              onSelect={selectEvent}
            />
          ) : (
            <CalendarMonthView
              items={monthFiltered}
              floating={floating}
              viewDate={viewDate}
              selectedId={selectedId}
              anchorDate={anchorDate}
              onPrevMonth={() =>
                setViewDate((p) =>
                  p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 },
                )
              }
              onNextMonth={() =>
                setViewDate((p) =>
                  p.m === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: p.m + 1 },
                )
              }
              onToday={() => {
                const n = new Date();
                setViewDate({ y: n.getFullYear(), m: n.getMonth() + 1 });
              }}
              onSelect={selectEvent}
            />
          )}
        </div>
      </div>

      {/* 右侧常驻面板：sticky 顶部，页面滚动时保持可见；内容超高时面板内部滚动 */}
      <aside className="sticky top-0 h-[calc(100vh-4rem)] w-[30%] min-w-[320px] max-w-[440px] shrink-0 self-start overflow-y-auto border-l border-[var(--border)] bg-white">
        {showCreate || editing ? (
          <CalendarEditPanel
            categories={categories}
            editing={
              editing
                ? {
                    id: editing.id,
                    event_name: editing.event_name,
                    event_type: editing.event_type,
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