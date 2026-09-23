"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { LoadingButton } from "@/components/common/loading-button";
import { SupabaseConfigCard } from "@/components/admin/supabase-config-card";

interface ConfigItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

/** 第一层：系统运行配置 —— 影响系统本身如何运行（数据库连接、定时任务…） */
const systemGroups: { title: string; keys: string[] }[] = [
  {
    title: "定时任务（cron，5 字段：分 时 日 月 周）",
    keys: ["cron.news_lead", "cron.weekly_briefing", "cron.dynamic_node_discover", "cron.daily_review"],
  },
];

/** 第二层：业务配置 —— 各业务的判断阈值，不影响系统运行 */
const businessGroups: { title: string; keys: string[] }[] = [
  {
    title: "新闻日历",
    keys: ["calendar.window_days"],
  },
  {
    title: "新闻线索 · AI 置信度路由",
    keys: ["clue.auto_approve_threshold", "clue.review_threshold"],
  },
  {
    title: "每日评报",
    keys: ["review.word_count_threshold", "review.auto_approve_threshold", "review.review_threshold"],
  },
];

export function AdminConfig() {
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        const v: Record<string, string> = {};
        for (const it of d.items ?? []) v[it.key] = it.value;
        setValues(v);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const updates = Object.entries(values).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "保存失败");
        return;
      }
      toast.success("配置已保存，工作流下一次执行生效");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--muted-foreground)]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
      </div>
    );
  }

  const desc = (key: string) => items.find((i) => i.key === key)?.description;

  const renderGroup = (g: { title: string; keys: string[] }) => (
    <Card key={g.title}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{g.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {g.keys.map((key) => (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs font-mono">{key}</Label>
            <Input
              value={values[key] ?? ""}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              className="font-mono text-sm"
            />
            {desc(key) && (
              <p className="text-xs text-[var(--muted-foreground)]">{desc(key)}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">系统配置</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            工作流只读取配置执行，调整规则无需修改代码。修改后下一次定时/手动任务生效。
          </p>
        </div>
        <LoadingButton onClick={handleSave} loading={saving} loadingText="保存中...">
          <Save className="w-4 h-4 mr-2" /> 保存全部
        </LoadingButton>
      </header>

      {/* ===== 第一层：系统运行配置 ===== */}
      <section className="space-y-3">
        <div className="brand-section-title">系统运行配置</div>
        <p className="-mt-1 text-xs text-[var(--muted-foreground)]">
          数据库连接、定时任务等决定系统本身如何运行的设置，修改前请确认影响范围。
        </p>
        <SupabaseConfigCard />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {systemGroups.map((g) => renderGroup(g))}
        </div>
      </section>

      {/* ===== 第二层：业务配置 ===== */}
      <section className="space-y-3">
        <div className="brand-section-title">业务配置</div>
        <p className="-mt-1 text-xs text-[var(--muted-foreground)]">
          新闻日历 / 新闻线索 / 每日评报的判断阈值，保存后下一次任务执行生效。
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {businessGroups.map((g) => renderGroup(g))}
        </div>
      </section>
    </div>
  );
}
