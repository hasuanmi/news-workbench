"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { normalizeEventName } from "@/lib/calendar-engine";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Pencil, Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  code: string;
  category_name: string;
  color: string;
}
interface AdminEvent {
  id: string;
  event_name: string;
  event_type: "fixed" | "dynamic";
  original_date: string | null;
  event_date: string | null;
  event_year: number | null;
  anniversary_base_year: number | null;
  region: string;
  importance: string;
  enabled: boolean;
  needs_review: boolean;
  review_status: string;
  source: string | null;
  category_id: string | null;
  category?: { code: string; category_name: string; color: string } | null;
  background: string | null;
  planning_hint: unknown;
  tags: unknown;
}

const emptyForm = {
  event_name: "",
  event_type: "fixed" as "fixed" | "dynamic",
  date: "",
  event_year: "",
  category_id: "",
  region: "national",
  importance: "B",
  background: "",
  planning_hint: "",
  tags: "",
};

const SOURCE_LABELS: Record<string, string> = {
  ai_recommend: "AI推荐",
  history_migrate: "历史迁移",
  user_add: "用户新增",
  user_paste: "粘贴识别",
};

const DELETE_REASONS = [
  "不属于重要新闻节点",
  "一次性事件",
  "重要性不足",
  "与广东/广州关联度低",
  "信息不准确",
  "重复节点",
  "已失效",
  "其他",
] as const;

export function AdminCalendar() {
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState<AdminEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>(DELETE_REASONS[0]);

  useEffect(() => {
    fetch("/api/calendar/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab !== "all") params.set("status", tab);
    if (keyword) params.set("keyword", keyword);
    fetch(`/api/admin/calendar?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [tab, keyword]);

  useEffect(() => {
    const t = setTimeout(load, keyword ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, keyword]);

  async function patchEvent(id: string, update: Record<string, unknown>) {
    const res = await fetch(`/api/admin/calendar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "操作失败");
      return false;
    }
    load();
    return true;
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  }

  function openEdit(ev: AdminEvent) {
    setEditing(ev);
    setForm({
      event_name: ev.event_name,
      event_type: ev.event_type,
      date: ev.original_date ?? ev.event_date ?? "",
      event_year: ev.event_year ? String(ev.event_year) : ev.anniversary_base_year ? String(ev.anniversary_base_year) : "",
      category_id: ev.category_id ?? "",
      region: ev.region,
      importance: ev.importance,
      background: (ev as { description?: string | null }).description ?? "",
      planning_hint: Array.isArray(ev.planning_hint) ? (ev.planning_hint as string[]).join("\n") : "",
      tags: Array.isArray(ev.tags) ? (ev.tags as string[]).join("，") : "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.event_name.trim() || !form.date) {
      toast.error("名称和日期必填");
      return;
    }
    setSaving(true);
    const payload = {
      event_name: (form.event_name || "").replace(/\s*(第)?\d+\s*周年\s*$/g, "").trim(),
      event_type: form.event_type,
      category_id: form.category_id || null,
      region: form.region,
      importance: form.importance,
      description: form.background || null,
      ...(form.event_type === "fixed"
        ? { original_date: form.date, event_year: form.event_year ? Number(form.event_year) : Number(form.date.slice(0, 4)) }
        : { event_date: form.date }),
    };
    try {
      const res = editing
        ? await fetch(`/api/admin/calendar/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/admin/calendar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "保存失败");
        return;
      }
      toast.success(editing ? "已更新" : "已新增节点");
      setDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">日历节点管理</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            默认直接维护正式日历节点；删除需说明原因，供后续 AI 推荐参考（软删除，可追溯）。
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> 新增节点
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">待审核</TabsTrigger>
          <TabsTrigger value="approved">已启用</TabsTrigger>
          <TabsTrigger value="disabled">已停用</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>

      <Input
        className="max-w-sm"
        placeholder="搜索节点名称"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--muted-foreground)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-[var(--muted-foreground)]">暂无数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">日期</TableHead>
                  <TableHead>节点名称</TableHead>
                  <TableHead className="w-24">分类</TableHead>
                  <TableHead className="w-16">重要度</TableHead>
                  <TableHead className="w-20">类型/状态</TableHead>
                  <TableHead className="w-44 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {ev.original_date ?? ev.event_date ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {normalizeEventName(ev.event_name)}
                        {ev.source && SOURCE_LABELS[ev.source] && (
                          <Badge variant="secondary" className="text-[10px]">
                            {SOURCE_LABELS[ev.source]}
                          </Badge>
                        )}
                        {ev.event_type === "fixed" && (ev.event_year ?? ev.anniversary_base_year) && (
                          <span className="text-xs text-[var(--primary)]">
                            {new Date().getFullYear() - (ev.event_year ?? ev.anniversary_base_year!)}周年
                          </span>
                        )}
                        {ev.needs_review && (
                          <Badge variant="outline" className="text-[10px] border-[#b8860b] text-[#b8860b]">
                            待审
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {ev.category ? (
                        <span className="text-xs" style={{ color: ev.category.color }}>
                          {ev.category.category_name}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">未分类</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-[10px]",
                          ev.importance === "S" && "bg-[#b3392f] text-white",
                          ev.importance === "A" && "bg-[#c87f2d] text-white",
                          ev.importance === "B" && "bg-[#6b6257] text-white"
                        )}
                      >
                        {ev.importance}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        <div>{ev.event_type === "fixed" ? "固定" : "动态"}</div>
                        <div className={ev.enabled ? "text-[#3f7d5c]" : "text-[var(--muted-foreground)]"}>
                          {ev.enabled ? "启用" : "停用"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {ev.needs_review && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-[#3f7d5c]"
                              onClick={() =>
                                patchEvent(ev.id, { needs_review: false, review_status: "approved", enabled: true })
                              }
                            >
                              <Check className="w-3.5 h-3.5" /> 通过
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-[var(--destructive)]"
                              onClick={() =>
                                patchEvent(ev.id, { needs_review: false, review_status: "rejected", enabled: false })
                              }
                            >
                              <X className="w-3.5 h-3.5" /> 驳回
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEdit(ev)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => patchEvent(ev.id, { enabled: !ev.enabled })}
                        >
                          {ev.enabled ? "停用" : "启用"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-[var(--destructive)]"
                          onClick={() => {
                            setDeleting(ev);
                            setDeleteReason(DELETE_REASONS[0]);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif">{editing ? "编辑节点" : "新增节点"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="space-y-1.5">
              <Label>节点名称 *</Label>
              <Input
                value={form.event_name}
                onChange={(e) => setForm({ ...form, event_name: e.target.value })}
                placeholder="如：中华人民共和国成立"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select
                  value={form.event_type}
                  onValueChange={(v) => setForm({ ...form, event_type: v as "fixed" | "dynamic" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">固定节点（每年重复）</SelectItem>
                    <SelectItem value="dynamic">动态节点（当期一次性）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.event_type === "fixed" ? "基准日期 (月日每年重复) *" : "事件日期 *"}</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>
            {form.event_type === "fixed" && (
              <div className="space-y-1.5">
                <Label>事件发生年份（可选，用于周年计算）</Label>
                <Input
                  type="number"
                  placeholder="如 1949"
                  value={form.event_year}
                  onChange={(e) => setForm({ ...form, event_year: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>分类</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.category_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>地域</Label>
                <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national">国内/国际</SelectItem>
                    <SelectItem value="local">广东/广州</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>重要度</Label>
                <Select value={form.importance} onValueChange={(v) => setForm({ ...form, importance: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">S 级</SelectItem>
                    <SelectItem value="A">A 级</SelectItem>
                    <SelectItem value="B">B 级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>背景信息</Label>
              <Textarea
                rows={3}
                value={form.background}
                onChange={(e) => setForm({ ...form, background: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>建议策划方向（每行一条）</Label>
              <Textarea
                rows={3}
                value={form.planning_hint}
                onChange={(e) => setForm({ ...form, planning_hint: e.target.value })}
                placeholder={"如：专访亲历者\n历史影像回顾"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>标签（逗号分隔）</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="如：待确认，经贸"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认（软删除 + 必填原因） */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">删除节点</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--muted-foreground)]">
            即将删除「{deleting ? normalizeEventName(deleting.event_name) : ""}」。删除为软删除，将保留原节点信息、来源与删除原因，供后续 AI 推荐参考。
          </p>
          <div className="space-y-1.5">
            <Label>删除原因 *</Label>
            <Select value={deleteReason} onValueChange={setDeleteReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELETE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                const ok = await patchEvent(deleting.id, { delete_reason: deleteReason });
                if (ok) {
                  toast.success("已删除节点（可追溯）");
                  setDeleting(null);
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> 确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
