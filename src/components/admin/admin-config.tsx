"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface ConfigItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

const groups: { title: string; keys: string[] }[] = [
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
  {
    title: "定时任务（cron，5 字段：分 时 日 月 周）",
    keys: ["cron.news_lead", "cron.weekly_briefing", "cron.dynamic_node_discover", "cron.daily_review"],
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

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">系统配置</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            工作流只读取配置执行，调整规则无需修改代码。修改后下一次定时/手动任务生效。
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          保存全部
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map((g) => (
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
        ))}
      </div>
    </div>
  );
}
