"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import type { CalCategory } from "./calendar-types";

interface Props {
  categories: CalCategory[];
  /** null = 新增；对象 = 编辑已有 */
  editing: {
    id?: string;
    event_name?: string;
    event_type?: string;
    importance?: string;
    region?: string;
    category_id?: string | null;
    description?: string | null;
    original_date?: string | null;
    event_date?: string | null;
    enabled?: boolean;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CalendarEditPanel({ categories, editing, onClose, onSaved }: Props) {
  const isEdit = Boolean(editing && editing.id);

  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState<string>("fixed");
  const [importance, setImportance] = useState<string>("B");
  const [region, setRegion] = useState<string>("national");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState("");
  const [background, setBackground] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setEventName(editing.event_name ?? "");
    setEventType(editing.event_type ?? "fixed");
    setImportance(editing.importance ?? "B");
    setRegion(editing.region ?? "national");
    setCategoryId(editing.category_id ?? "");
    setBackground(editing.description ?? "");
    setDate(
      editing.event_type === "dynamic"
        ? editing.event_date ?? ""
        : editing.original_date ?? "",
    );
  }, [editing]);

  const save = async () => {
    setError(null);
    if (!eventName.trim()) {
      setError("节点名称必填");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("请提供有效日期 (YYYY-MM-DD)");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        event_name: eventName.trim(),
        event_type: eventType,
        importance,
        region,
        category_id: categoryId || null,
        background,
        enabled: true,
      };
      if (eventType === "fixed") payload.original_date = date;
      else payload.event_date = date;

      const url = isEdit
        ? `/api/admin/calendar/${editing!.id}`
        : "/api/admin/calendar";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-3">
        <h3 className="font-serif text-base">
          {isEdit ? "编辑节点" : "新增节点"}
        </h3>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label>节点名称</Label>
          <Input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="如：中国农民丰收节"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>节点类型</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">固定节点</SelectItem>
                <SelectItem value="dynamic">动态节点</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>日期</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>重要度</Label>
            <Select value={importance} onValueChange={setImportance}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="S">S</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>地区</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="national">国内/国际</SelectItem>
                <SelectItem value="local">广东/广州</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>分类</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="选择分类（可选）" />
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
          <Label>背景信息</Label>
          <Textarea
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="说明该节点的背景、意义等（可选）"
            rows={5}
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
        <Button size="sm" className="flex-1" onClick={save} disabled={saving}>
          {saving ? "保存中…" : isEdit ? "保存修改" : "创建节点"}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          取消
        </Button>
      </div>
    </div>
  );
}