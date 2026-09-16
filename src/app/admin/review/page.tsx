"use client";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface GenerationRules {
  max_words: number;
  modules: {
    today_highlights: boolean;
    same_topic_comparison: boolean;
    peer_highlights: boolean;
    gz_daily_observation: boolean;
  };
  same_topic_max: number;
  peer_highlights_max: number;
  topic_summary_max_length: number;
  language_style: string;
}

interface DisplayRules {
  show_media_name: boolean;
  show_article_title: boolean;
  show_article_url: boolean;
  show_evidence: boolean;
  show_same_topic_table: boolean;
}

const MODULE_LABELS: Record<keyof GenerationRules["modules"], string> = {
  today_highlights: "今日重点",
  same_topic_comparison: "同题观察",
  peer_highlights: "同行亮点",
  gz_daily_observation: "广州日报观察",
};

const HIGHLIGHT_FLAG_LABELS: Record<string, string> = {
  front_page: "头版重点",
  full_page: "整版报道",
  cross_page: "跨版报道",
  series: "系列报道",
  special: "专题策划",
};

const DIMENSION_LABELS: Record<string, string> = {
  topic: "选题",
  timeliness: "时效性",
  angle: "报道角度",
  depth: "内容深度",
  richness: "信息丰富度",
  presentation: "表现形式",
  local: "广州本地性",
  exclusive: "独家性",
  headline: "标题质量",
  service: "服务性",
};

interface SelectionRules {
  min_word_count: number;
  highlight_flags: string[];
  dimensions: string[];
  scan_missing: boolean;
  exclude_xinhua_reprint: boolean;
}

export default function AdminReviewConfigPage() {
  const [genRules, setGenRules] = useState<GenerationRules>({
    max_words: 1000,
    modules: {
      today_highlights: true,
      same_topic_comparison: true,
      peer_highlights: true,
      gz_daily_observation: false,
    },
    same_topic_max: 3,
    peer_highlights_max: 5,
    topic_summary_max_length: 200,
    language_style: "专业客观，编辑部术语",
  });
  const [dispRules, setDispRules] = useState<DisplayRules>({
    show_media_name: true,
    show_article_title: true,
    show_article_url: false,
    show_evidence: true,
    show_same_topic_table: true,
  });
  const [selRules, setSelRules] = useState<SelectionRules>({
    min_word_count: 2000,
    highlight_flags: ["front_page", "full_page", "cross_page", "series", "special"],
    dimensions: ["topic", "timeliness", "angle", "depth", "presentation"],
    scan_missing: true,
    exclude_xinhua_reprint: true,
  });
  const [comparisonMedia, setComparisonMedia] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      const [genRes, dispRes, selRes, cmpRes] = await Promise.all([
        fetch("/api/admin/config?key=review.generation_rules"),
        fetch("/api/admin/config?key=review.display_rules"),
        fetch("/api/admin/config?key=review.selection_rules"),
        fetch("/api/admin/config?key=review.comparison_media"),
      ]);
      const genData = await genRes.json();
      const dispData = await dispRes.json();
      const selData = await selRes.json();
      const cmpData = await cmpRes.json();
      if (genData.success && genData.value) {
        const parsed = typeof genData.value === "string" ? JSON.parse(genData.value) : genData.value;
        setGenRules((prev) => ({ ...prev, ...parsed }));
      }
      if (dispData.success && dispData.value) {
        const parsed = typeof dispData.value === "string" ? JSON.parse(dispData.value) : dispData.value;
        setDispRules((prev) => ({ ...prev, ...parsed }));
      }
      if (selData.success && selData.value) {
        const parsed = typeof selData.value === "string" ? JSON.parse(selData.value) : selData.value;
        setSelRules((prev) => ({ ...prev, ...parsed }));
      }
      if (cmpData.success && cmpData.value) {
        const parsed = typeof cmpData.value === "string" ? JSON.parse(cmpData.value) : cmpData.value;
        setComparisonMedia(Array.isArray(parsed) ? parsed : []);
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
      const [genRes, dispRes, selRes, cmpRes] = await Promise.all([
        fetch("/api/admin/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "review.generation_rules", value: genRules, description: "每日评报生成规则" }),
        }),
        fetch("/api/admin/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "review.display_rules", value: dispRules, description: "每日评报展示规则" }),
        }),
        fetch("/api/admin/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "review.selection_rules", value: selRules, description: "每日评报选稿规则（比较门槛/重点稿/维度/同行遗漏扫描/新华社排除）" }),
        }),
        fetch("/api/admin/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "review.comparison_media", value: comparisonMedia, description: "每日评报固定比较媒体" }),
        }),
      ]);
      const genData = await genRes.json();
      const dispData = await dispRes.json();
      const selData = await selRes.json();
      const cmpData = await cmpRes.json();
      if (genData.success && dispData.success && selData.success && cmpData.success) {
        toast.success("保存成功");
      } else {
        toast.error("保存失败");
      }
    } catch (err) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  function toggleModule(module: keyof GenerationRules["modules"]) {
    setGenRules((prev) => ({
      ...prev,
      modules: { ...prev.modules, [module]: !prev.modules[module] },
    }));
  }

  function toggleSelFlag(flag: string) {
    setSelRules((prev) => ({
      ...prev,
      highlight_flags: prev.highlight_flags.includes(flag)
        ? prev.highlight_flags.filter((x) => x !== flag)
        : [...prev.highlight_flags, flag],
    }));
  }

  function toggleSelDimension(dim: string) {
    setSelRules((prev) => ({
      ...prev,
      dimensions: prev.dimensions.includes(dim)
        ? prev.dimensions.filter((x) => x !== dim)
        : [...prev.dimensions, dim],
    }));
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-6 text-center text-[#6b6257]">加载中...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1000px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">每日评报管理</h1>
          <p className="text-sm text-[#6b6257] mt-1">
            配置评报的生成规则（字数、模块、数量）和展示规则（媒体名、标题、链接、依据等）。
          </p>
        </div>

        <div className="space-y-6">
          {/* 生成规则 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">生成规则</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">最终评报字数</Label>
                <Input
                  type="number"
                  value={genRules.max_words}
                  onChange={(e) => setGenRules((prev) => ({ ...prev, max_words: Number(e.target.value) }))}
                  className="w-[100px]"
                />
                <span className="text-sm text-[#6b6257]">字以内</span>
              </div>

              <Separator />

              <div>
                <Label className="text-sm mb-2 block">输出模块</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(MODULE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label htmlFor={`module-${key}`} className="text-sm">
                        {label}
                      </Label>
                      <Switch
                        id={`module-${key}`}
                        checked={genRules.modules[key as keyof GenerationRules["modules"]]}
                        onCheckedChange={() => toggleModule(key as keyof GenerationRules["modules"])}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">同题主题数</Label>
                <Input
                  type="number"
                  value={genRules.same_topic_max}
                  onChange={(e) => setGenRules((prev) => ({ ...prev, same_topic_max: Number(e.target.value) }))}
                  className="w-[100px]"
                />
                <span className="text-sm text-[#6b6257]">个</span>
              </div>
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">同行亮点数</Label>
                <Input
                  type="number"
                  value={genRules.peer_highlights_max}
                  onChange={(e) => setGenRules((prev) => ({ ...prev, peer_highlights_max: Number(e.target.value) }))}
                  className="w-[100px]"
                />
                <span className="text-sm text-[#6b6257]">条</span>
              </div>
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">主题摘要长度</Label>
                <Input
                  type="number"
                  value={genRules.topic_summary_max_length}
                  onChange={(e) => setGenRules((prev) => ({ ...prev, topic_summary_max_length: Number(e.target.value) }))}
                  className="w-[100px]"
                />
                <span className="text-sm text-[#6b6257]">字</span>
              </div>

              <Separator />

              <div>
                <Label className="text-sm mb-2 block">语言风格</Label>
                <Textarea
                  value={genRules.language_style}
                  onChange={(e) => setGenRules((prev) => ({ ...prev, language_style: e.target.value }))}
                  className="h-20"
                  placeholder="专业客观，编辑部术语"
                />
              </div>
            </CardContent>
          </Card>

          {/* 选稿规则（前台不再逐次勾选的长期业务规则） */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">选稿规则（长业务规则，前台不再逐次选择）</CardTitle>
              <p className="text-xs text-[#6b6257]">
                这些规则作为每日评报的默认选稿条件，由后台统一维护；前台每日只选日期、关注主题、自定义要求。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="w-24 text-sm">最低字数</Label>
                <Input
                  type="number"
                  value={selRules.min_word_count}
                  onChange={(e) => setSelRules((prev) => ({ ...prev, min_word_count: Number(e.target.value) }))}
                  className="w-[100px]"
                />
                <span className="text-sm text-[#6b6257]">字</span>
              </div>

              <Separator />

              <div>
                <Label className="text-sm mb-2 block">默认比较媒体（空格分隔媒体名）</Label>
                <Textarea
                  value={comparisonMedia.join(", ")}
                  onChange={(e) =>
                    setComparisonMedia(
                      e.target.value
                        .split(/[,，、]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  className="h-16"
                  placeholder="广州日报, 南方日报, 南方都市报, 新快报, 羊城晚报, 信息时报"
                />
              </div>

              <Separator />

              <div>
                <Label className="text-sm mb-2 block">重点稿筛选条件</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(HIGHLIGHT_FLAG_LABELS).map(([value, label]) => (
                    <Button
                      key={value}
                      variant={selRules.highlight_flags.includes(value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleSelFlag(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-sm mb-2 block">默认评报维度</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DIMENSION_LABELS).map(([value, label]) => (
                    <Button
                      key={value}
                      variant={selRules.dimensions.includes(value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleSelDimension(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sel-scan-missing" className="text-sm">
                  同行遗漏扫描（查找"其他媒体重点报道、广州日报无对应"）
                </Label>
                <Switch
                  id="sel-scan-missing"
                  checked={selRules.scan_missing}
                  onCheckedChange={(v) => setSelRules((prev) => ({ ...prev, scan_missing: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sel-xinhua" className="text-sm">
                  新华社纯转载排除（多家转载新华社同一通稿不再逐家比较，作共同背景）
                </Label>
                <Switch
                  id="sel-xinhua"
                  checked={selRules.exclude_xinhua_reprint}
                  onCheckedChange={(v) => setSelRules((prev) => ({ ...prev, exclude_xinhua_reprint: v }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* 展示规则 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">展示规则</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-media" className="text-sm">
                    展示媒体名称
                  </Label>
                  <Switch
                    id="show-media"
                    checked={dispRules.show_media_name}
                    onCheckedChange={(v) => setDispRules((prev) => ({ ...prev, show_media_name: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-title" className="text-sm">
                    展示报道标题
                  </Label>
                  <Switch
                    id="show-title"
                    checked={dispRules.show_article_title}
                    onCheckedChange={(v) => setDispRules((prev) => ({ ...prev, show_article_title: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-url" className="text-sm">
                    展示原文链接
                  </Label>
                  <Switch
                    id="show-url"
                    checked={dispRules.show_article_url}
                    onCheckedChange={(v) => setDispRules((prev) => ({ ...prev, show_article_url: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-evidence" className="text-sm">
                    展示判断依据
                  </Label>
                  <Switch
                    id="show-evidence"
                    checked={dispRules.show_evidence}
                    onCheckedChange={(v) => setDispRules((prev) => ({ ...prev, show_evidence: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-table" className="text-sm">
                    展示同题对比表
                  </Label>
                  <Switch
                    id="show-table"
                    checked={dispRules.show_same_topic_table}
                    onCheckedChange={(v) => setDispRules((prev) => ({ ...prev, show_same_topic_table: v }))}
                  />
                </div>
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
