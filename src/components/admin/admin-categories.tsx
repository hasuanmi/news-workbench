"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Loader2 } from "lucide-react";
import { LoadingButton } from "@/components/common/loading-button";
import { toast } from "sonner";

interface Category {
  id: string;
  code: string;
  category_name: string;
  color: string;
  sort_order: number;
  enabled: boolean;
}

export function AdminCategories() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("var(--muted-foreground)");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/calendar/categories")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setCode("");
    setColor("var(--muted-foreground)");
    setDialogOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setName(c.category_name);
    setCode(c.code);
    setColor(c.color);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("分类名称必填");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, category_name: name, color } : { category_name: name, color, code }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "保存失败");
        return;
      }
      toast.success("已保存");
      setDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(c: Category, enabled: boolean) {
    const res = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, enabled }),
    });
    if (res.ok) {
      toast.success(enabled ? "已启用" : "已停用");
      load();
    } else {
      toast.error("操作失败");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">日历分类管理</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            分类可新增、改名、停用；停用后前台筛选不再展示该分类。
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> 新增分类
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--muted-foreground)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead className="w-24">编码</TableHead>
                  <TableHead>分类名称</TableHead>
                  <TableHead className="w-24">标识色</TableHead>
                  <TableHead className="w-28">启用</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{c.sort_order}</TableCell>
                    <TableCell className="text-sm font-mono">{c.code}</TableCell>
                    <TableCell>
                      <span className="font-medium" style={{ color: c.color }}>
                        {c.category_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded border border-[var(--border)]" style={{ background: c.color }} />
                        <span className="text-xs font-mono">{c.color}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch checked={c.enabled} onCheckedChange={(v) => toggleEnabled(c, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEdit(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">{editing ? "编辑分类" : "新增分类"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <div className="space-y-1.5">
                <Label>编码（留空自动生成）</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 C09" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>分类名称 *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：生态环保" />
            </div>
            <div className="space-y-1.5">
              <Label>标识色</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-10 rounded border border-[var(--border)] cursor-pointer"
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <LoadingButton onClick={handleSave} loading={saving} loadingText="保存中...">
              保存
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
