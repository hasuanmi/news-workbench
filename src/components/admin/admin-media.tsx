"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Settings2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Source {
  id: string;
  source_type: string;
  source_url: string | null;
  enabled: boolean;
  crawl_status: string;
  failure_count: number;
  error_message: string | null;
  last_crawl_at: string | null;
  last_error: string | null;
}
interface Media {
  id: string;
  media_name: string;
  level: string;
  region: string | null;
  enabled: boolean;
  notes: string | null;
  sources: Source[];
}

const levelLabel: Record<string, string> = {
  central: "央媒",
  provincial: "省媒",
  city: "地市级",
};

const crawlStatusLabel: Record<string, { text: string; cls: string }> = {
  untested: { text: "待 PoC", cls: "bg-[#e8e2d8] text-[#6b6257]" },
  ok: { text: "正常", cls: "bg-[#e6f0ea] text-[#3f7d5c]" },
  warning: { text: "警告", cls: "bg-[#faf0da] text-[#b8860b]" },
  error: { text: "失败", cls: "bg-[#f6e3e1] text-[#b3392f]" },
};

export function AdminMedia() {
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [sourceDialog, setSourceDialog] = useState<Media | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (level !== "all") params.set("level", level);
    if (keyword) params.set("keyword", keyword);
    fetch(`/api/admin/media?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [level, keyword]);

  useEffect(() => {
    const t = setTimeout(load, keyword ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, keyword]);

  async function toggleMedia(m: Media, enabled: boolean) {
    const res = await fetch("/api/admin/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, enabled }),
    });
    if (res.ok) {
      toast.success(enabled ? "已启用" : "已停用");
      load();
    } else {
      toast.error("操作失败");
    }
  }

  async function updateSource(sourceId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success("数据源已更新");
      load();
      setSourceDialog(null);
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "更新失败");
    }
  }

  // 计算汇总统计
  const stats = items.reduce(
    (acc, m) => {
      m.sources.forEach((s) => {
        acc.total++;
        if (s.crawl_status === "ok") acc.ok++;
        else if (s.crawl_status === "warning") acc.warning++;
        else if (s.crawl_status === "error") acc.error++;
        else acc.untested++;
      });
      return acc;
    },
    { total: 0, ok: 0, warning: 0, error: 0, untested: 0 }
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl font-bold">媒体与数据源</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          媒体池可配置；电子报/官网地址、抓取开关、PoC 状态均在此维护。M2 阶段逐家做数据源 PoC。
        </p>
      </header>

      {/* 汇总统计条 */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-[var(--foreground)]">{stats.total}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">总计</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#3f7d5c]">{stats.ok}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">✅ 正常</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#b8860b]">{stats.warning}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">⚠️ 警告</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#b3392f]">{stats.error}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">❌ 失败</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#6b6257]">{stats.untested}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">️ 待测</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部层级</SelectItem>
            <SelectItem value="central">央媒</SelectItem>
            <SelectItem value="provincial">省媒</SelectItem>
            <SelectItem value="city">地市级</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="max-w-sm"
          placeholder="搜索媒体名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

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
                  <TableHead className="w-20">层级</TableHead>
                  <TableHead>媒体名称</TableHead>
                  <TableHead className="w-24">地区</TableHead>
                  <TableHead>数据源状态</TableHead>
                  <TableHead className="w-20">启用</TableHead>
                  <TableHead className="w-28 text-right">数据源配置</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {levelLabel[m.level] ?? m.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.media_name}</TableCell>
                    <TableCell className="text-sm text-[var(--muted-foreground)]">
                      {m.region ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.sources.map((s) => {
                          const st = crawlStatusLabel[s.crawl_status] ?? crawlStatusLabel.untested;
                          return (
                            <Badge key={s.id} className={`text-[10px] ${st.cls}`}>
                              {s.source_type === "epaper" ? "电子报" : "官网"}·{st.text}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch checked={m.enabled} onCheckedChange={(v) => toggleMedia(m, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setSourceDialog(m)}>
                        <Settings2 className="w-4 h-4 mr-1" /> 配置
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SourceConfigDialog
        media={sourceDialog}
        onClose={() => setSourceDialog(null)}
        onSave={updateSource}
      />
    </div>
  );
}

function SourceConfigDialog({
  media,
  onClose,
  onSave,
}: {
  media: Media | null;
  onClose: () => void;
  onSave: (sourceId: string, body: Record<string, unknown>) => void;
}) {
  const [edits, setEdits] = useState<Record<string, { url: string; enabled: boolean; status: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>({});

  const testCrawl = async (sourceId: string) => {
    setTesting(sourceId);
    setTestResult({ ...testResult, [sourceId]: { success: false, message: "测试中..." } });
    try {
      const res = await fetch(`/api/admin/sources/${sourceId}/test`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          ...testResult,
          [sourceId]: {
            success: true,
            message: `成功抓取 ${data.articlesInserted} 篇（跳过 ${data.articlesSkipped} 篇重复）`,
          },
        });
      } else {
        setTestResult({
          ...testResult,
          [sourceId]: { success: false, message: data.error || "测试失败" },
        });
      }
    } catch (err: any) {
      setTestResult({
        ...testResult,
        [sourceId]: { success: false, message: err.message },
      });
    } finally {
      setTesting(null);
    }
  };

  useEffect(() => {
    if (!media) return;
    const map: Record<string, { url: string; enabled: boolean; status: string }> = {};
    for (const s of media.sources) {
      map[s.id] = { url: s.source_url ?? "", enabled: s.enabled, status: s.crawl_status };
    }
    setEdits(map);
  }, [media]);

  return (
    <Dialog open={!!media} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif">数据源配置 — {media?.media_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {media?.sources.map((s) => {
            const edit = edits[s.id];
            if (!edit) return null;
            return (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {s.source_type === "epaper" ? "电子报/数字版" : "官方网站"}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--muted-foreground)]">参与监测</span>
                      <Switch
                        checked={edit.enabled}
                        onCheckedChange={(v) => setEdits({ ...edits, [s.id]: { ...edit, enabled: v } })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">数据源 URL</Label>
                    <Input
                      value={edit.url}
                      onChange={(e) => setEdits({ ...edits, [s.id]: { ...edit, url: e.target.value } })}
                      placeholder="https://..."
                    />
                    {!s.source_url && (
                      <p className="text-xs text-[#b8860b]">
                        原始清单中该地址为文字描述，PoC 阶段补全实际 URL
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">PoC 状态</Label>
                      <Select
                        value={edit.status}
                        onValueChange={(v) => setEdits({ ...edits, [s.id]: { ...edit, status: v } })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="untested">待 PoC</SelectItem>
                          <SelectItem value="active">正常可抓</SelectItem>
                          <SelectItem value="failed">抓取失败</SelectItem>
                          <SelectItem value="blocked">反爬受限</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      {s.source_url && (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[var(--primary)] flex items-center gap-1 hover:underline"
                        >
                          访问当前地址 <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testCrawl(s.id)}
                      disabled={!edit.url || testing === s.id}
                    >
                      {testing === s.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3 h-3 mr-1" />
                      )}
                      {testing === s.id ? "测试中..." : "测试抓取"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        onSave(s.id, {
                          source_url: edit.url || null,
                          enabled: edit.enabled,
                          crawl_status: edit.status,
                        })
                      }
                    >
                      保存此数据源
                    </Button>
                  </div>
                  {testResult[s.id] && (
                    <div
                      className={`text-xs p-2 rounded ${
                        testResult[s.id].success
                          ? "bg-[#e6f0ea] text-[#3f7d5c]"
                          : "bg-[#f6e3e1] text-[#b3392f]"
                      }`}
                    >
                      {testResult[s.id].message}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
