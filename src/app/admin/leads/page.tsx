"use client";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface DisplayRules {
  fields: {
    clue_type: boolean;
    clue_name: boolean;
    ai_summary: boolean;
    why_noteworthy: boolean;
    article_count: boolean;
    confidence: boolean;
    first_found_at: boolean;
    last_seen_at: boolean;
  };
  sort_by: "first_found_at" | "last_seen_at" | "article_count";
  group_by: "clue_type" | "media" | "none";
  summary_max_length: number;
  reason_max_length: number;
  enable_actions: boolean;
}

const FIELD_LABELS: Record<keyof DisplayRules["fields"], string> = {
  clue_type: "线索类型",
  clue_name: "线索名称",
  ai_summary: "AI 摘要",
  why_noteworthy: "为什么值得关注",
  article_count: "关联文章数",
  confidence: "置信度",
  first_found_at: "首次发现时间",
  last_seen_at: "最近更新时间",
};

const SORT_OPTIONS = [
  { value: "first_found_at", label: "最新发现" },
  { value: "last_seen_at", label: "最近更新" },
  { value: "article_count", label: "关联文章数" },
];

const GROUP_OPTIONS = [
  { value: "clue_type", label: "按类型" },
  { value: "media", label: "按媒体" },
  { value: "none", label: "不分组" },
];

export default function AdminLeadsConfigPage() {
  const [rules, setRules] = useState<DisplayRules>({
    fields: {
      clue_type: true,
      clue_name: true,
      ai_summary: true,
      why_noteworthy: true,
      article_count: true,
      confidence: true,
      first_found_at: true,
      last_seen_at: true,
    },
    sort_by: "first_found_at",
    group_by: "clue_type",
    summary_max_length: 150,
    reason_max_length: 100,
    enable_actions: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      const res = await fetch("/api/admin/config?key=clue.display_rules");
      const data = await res.json();
      if (data.success && data.value) {
        const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        setRules((prev) => ({ ...prev, ...parsed }));
      }
    } catch (err) {
      console.error("加载配置失败", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveRules() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "clue.display_rules", value: rules, description: "新闻线索卡片展示规则" }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("保存成功");
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch (err) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  function toggleField(field: keyof DisplayRules["fields"]) {
    setRules((prev) => ({
      ...prev,
      fields: { ...prev.fields, [field]: !prev.fields[field] },
    }));
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-6 text-center text-[var(--muted-foreground)]">加载中...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[var(--foreground)]">新闻线索管理</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            配置线索卡片的展示字段、排序、分组、长度限制等呈现规则。媒体和数据源请在「媒体与数据源」中管理。
          </p>
        </div>

        <div className="space-y-6">
          {/* 字段显示开关 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">卡片显示字段</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(FIELD_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label htmlFor={`field-${key}`} className="text-sm">
                      {label}
                    </Label>
                    <Switch
                      id={`field-${key}`}
                      checked={rules.fields[key as keyof DisplayRules["fields"]]}
                      onCheckedChange={() => toggleField(key as keyof DisplayRules["fields"])}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 排序和分组 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">排序与分组</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">默认排序</Label>
                <Select
                  value={rules.sort_by}
                  onValueChange={(v) => setRules((prev) => ({ ...prev, sort_by: v as DisplayRules["sort_by"] }))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">默认分组</Label>
                <Select
                  value={rules.group_by}
                  onValueChange={(v) => setRules((prev) => ({ ...prev, group_by: v as DisplayRules["group_by"] }))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 长度限制 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">长度限制</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">摘要长度</Label>
                <Input
                  type="number"
                  value={rules.summary_max_length}
                  onChange={(e) => setRules((prev) => ({ ...prev, summary_max_length: Number(e.target.value) }))}
                  className="w-[100px]"
                />
                <span className="text-sm text-[var(--muted-foreground)]">字</span>
              </div>
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">推荐理由长度</Label>
                <Input
                  type="number"
                  value={rules.reason_max_length}
                  onChange={(e) => setRules((prev) => ({ ...prev, reason_max_length: Number(e.target.value) }))}
                  className="w-[100px]"
                />
                <span className="text-sm text-[var(--muted-foreground)]">字</span>
              </div>
            </CardContent>
          </Card>

          {/* 操作开关 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">人工操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="enable-actions" className="text-sm">
                  保留「查看 / 确认 / 忽略」等人工操作按钮
                </Label>
                <Switch
                  id="enable-actions"
                  checked={rules.enable_actions}
                  onCheckedChange={(v) => setRules((prev) => ({ ...prev, enable_actions: v }))}
                />
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="flex justify-end">
            <Button onClick={saveRules} disabled={saving}>
              {saving ? "保存中..." : "保存配置"}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
