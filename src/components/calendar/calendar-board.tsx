"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarEventDialog } from "./calendar-event-dialog";
import { normalizeEventName } from "@/lib/calendar-engine";
import { Search, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  code: string;
  category_name: string;
  color: string;
}
interface OccurrenceItem {
  id: string;
  event_name: string;
  date: string;
  daysUntil: number;
  anniversary: number | null;
  importance: string;
  region: string;
  category?: { code: string; category_name: string; color: string };
  background: string | null;
  planning_hint: unknown;
  source: string | null;
  tags: unknown;
}

type View = "week" | "next14" | "month" | "all";

const importanceStyle: Record<string, string> = {
  S: "bg-[var(--brand)] text-white",
  A: "bg-[var(--gold)] text-white",
  B: "bg-[var(--muted-foreground)] text-white",
};

export function CalendarBoard() {
  const [view, setView] = useState<View>("next14");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<OccurrenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [region, setRegion] = useState("all");
  const [importance, setImportance] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<OccurrenceItem | null>(null);
  const [windowDays, setWindowDays] = useState(14);
  const [floating, setFloating] = useState<
    Array<{
      id: string;
      event_name: string;
      date_status: string;
      candidate_month: number | null;
      importance: string;
      region: string;
      category?: { code: string; category_name: string; color: string } | null;
      background: string | null;
      planning_hint: unknown;
      source: string | null;
      tags: unknown;
    }>
  >([]);

  useEffect(() => {
    fetch("/api/calendar/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ view });
    if (category !== "all") params.set("category", category);
    if (region !== "all") params.set("region", region);
    if (importance !== "all") params.set("importance", importance);
    if (keyword) params.set("keyword", keyword);
    fetch(`/api/calendar?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setFloating(d.floating ?? []);
        if (d.windowDays) setWindowDays(d.windowDays);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [view, category, region, importance, keyword]);

  useEffect(() => {
    const t = setTimeout(load, keyword ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, keyword]);

  function handleSearch() {
    setKeyword(searchInput.trim());
  }

  // 按日期分组
  const grouped = new Map<string, OccurrenceItem[]>();
  for (const item of items) {
    const list = grouped.get(item.date) ?? [];
    list.push(item);
    grouped.set(item.date, list);
  }
  const dates = Array.from(grouped.keys()).sort();

  const weekDay = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">新闻日历</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            未来 {windowDays} 天提醒窗口内的节点按日期排序，支持分类、地域、重要度筛选。
          </p>
        </div>
      </header>

      {/* 筛选条 */}
      <div className="sticky top-0 z-10 bg-[var(--background)]/95 backdrop-blur py-3 -mx-2 px-2 border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="week">未来7天</TabsTrigger>
              <TabsTrigger value="next14">未来{windowDays}天</TabsTrigger>
              <TabsTrigger value="month">未来30天</TabsTrigger>
              <TabsTrigger value="all">全部</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="分类" />
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

          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="地域" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部地域</SelectItem>
              <SelectItem value="national">国内/国际</SelectItem>
              <SelectItem value="local">广东/广州</SelectItem>
            </SelectContent>
          </Select>

          <Select value={importance} onValueChange={setImportance}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="重要度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部重要度</SelectItem>
              <SelectItem value="S">S 级</SelectItem>
              <SelectItem value="A">A 级</SelectItem>
              <SelectItem value="B">B 级</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 ml-auto">
            <Input
              className="w-56"
              placeholder="搜索节点名称"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--muted-foreground)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
        </div>
      ) : dates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-[var(--muted-foreground)]">
            当前窗口内没有符合条件的节点，可切换视图或在后台添加节点。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dates.map((date) => {
            const d = new Date(date + "T00:00:00Z");
            const dayItems = grouped.get(date)!;
            const minDays = Math.min(...dayItems.map((i) => i.daysUntil));
            return (
              <div key={date} className="flex gap-4">
                <div className="w-20 shrink-0 text-right pt-3">
                  <div className="font-serif text-2xl font-bold leading-none">
                    {d.getUTCDate()}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-1">
                    {d.getUTCMonth() + 1}月 · {weekDay[d.getUTCDay()]}
                  </div>
                  {minDays === 0 && (
                    <Badge className="mt-1 bg-[var(--brand)] text-white">今天</Badge>
                  )}
                </div>
                <div className="flex-1 space-y-2 border-l-2 border-[var(--border)] pl-4">
                  {dayItems.map((item) => (
                    <Card
                      key={item.id}
                      className="cursor-pointer hover:border-[var(--primary)] transition-colors"
                      onClick={() => setSelected(item)}
                    >
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <Badge className={cn("shrink-0", importanceStyle[item.importance] ?? importanceStyle.B)}>
                          {item.importance}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {normalizeEventName(item.event_name)}
                            {item.anniversary && (
                              <span className="ml-2 text-[var(--primary)] font-serif">
                                {item.anniversary}周年
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--muted-foreground)]">
                            {item.category && (
                              <span style={{ color: item.category.color }}>
                                {item.category.category_name}
                              </span>
                            )}
                            {item.region === "local" && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" /> 广东/广州
                              </span>
                            )}
                            {item.daysUntil > 0 && <span>距今 {item.daysUntil} 天</span>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {floating.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#b8860b]" />
            时间待定 / 仅知月份（{floating.length}）
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {floating.map((f) => (
              <Card
                key={f.id}
                className="cursor-pointer hover:border-[var(--primary)] transition-colors"
                onClick={() =>
                  setSelected({
                    id: f.id,
                    event_name: f.event_name,
                    date: f.date_status === "month_known" && f.candidate_month ? `${f.candidate_month}月` : "待定",
                    daysUntil: -999,
                    anniversary: null,
                    importance: f.importance,
                    region: f.region,
                    category: f.category ?? undefined,
                    background: f.background,
                    planning_hint: f.planning_hint,
                    source: f.source,
                    tags: f.tags,
                  })
                }
              >
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Badge
                    className={cn(
                      "shrink-0",
                      f.date_status === "month_known" && "bg-[var(--gold)] text-white",
                      f.date_status === "unknown" && "bg-[var(--muted-foreground)] text-white",
                    )}
                  >
                    {f.date_status === "month_known" && f.candidate_month ? `${f.candidate_month}月` : "待定"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{normalizeEventName(f.event_name)}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {f.category && <span style={{ color: f.category.color }}>{f.category.category_name}</span>}
                      <span>时间待定</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <CalendarEventDialog
        item={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
