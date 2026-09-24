"use client";

import { sourceStatusLabels, type SourceStatus } from "@/lib/source-policy";
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
import { Loader2, Settings2, ExternalLink, FlaskConical, Inbox } from "lucide-react";
import { toast } from "sonner";
import { LoadingButton } from "@/components/common/loading-button";

interface Source {
  source_status: SourceStatus;
  status_reason: string | null;
  duplicate_of: string | null;
  verified_at: string | null;
  id: string;
  source_type: string;
  source_url: string | null;
  enabled: boolean;
  crawl_status: string;
  failure_count: number;
  error_message: string | null;
  last_crawl_at: string | null;
  last_ingest_at: string | null;
  last_ingest_count: number | null;
  fail_count: number;
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
  untested: { text: "待 PoC", cls: "bg-[var(--border)] text-[var(--muted-foreground)]" },
  ok: { text: "正常", cls: "bg-[#e6f0ea] text-[#3f7d5c]" },
  warning: { text: "警告", cls: "bg-[#faf0da] text-[#b8860b]" },
  error: { text: "失败", cls: "bg-[#f6e3e1] text-[var(--brand)]" },
};

export function AdminMedia() {
  const [dailyActivity, setDailyActivity] = useState<{ date: string; actualSources: number }[] | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [sourceDialog, setSourceDialog] = useState<Media | null>(null);
  const [mockLoading, setMockLoading] = useState(false);
  const [articlesOpen, setArticlesOpen] = useState(false);

  /** 模拟外部抓取服务推送（走真实 ingest 入库链路，仅数据为仿真） */
  async function mockIngest(sourceId?: string) {
    setMockLoading(true);
    try {
      const res = await fetch("/api/admin/ingest/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId, perSource: 3 } : { perSource: 2 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`模拟推送完成：${data.sources} 个源，新入库 ${data.inserted} 篇（重复自动跳过）`);
        load();
      } else {
        toast.error(data.error || "模拟推送失败");
      }
    } catch {
      toast.error("模拟推送失败");
    } finally {
      setMockLoading(false);
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (level !== "all") params.set("level", level);
    if (keyword) params.set("keyword", keyword);
    fetch(`/api/admin/media?${params.toString()}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "加载失败"); return d; })
      .then((d) => { setItems(d.items ?? []); setDailyActivity(d.dailyActivity); setLoadError(null); })
      .catch((e: Error) => setLoadError(e.message))
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

  const stats = items.flatMap(m => m.sources).reduce((acc, s) => {
    acc.total++; acc[s.source_status]++; return acc;
  }, { total: 0, active: 0, needs_fix: 0, duplicate: 0, manual_disabled: 0 });
  const visibleItems = items.map(m => ({ ...m, sources: m.sources.filter(s => sourceFilter === "all" || s.source_status === sourceFilter) }))
    .filter(m => sourceFilter === "all" || m.sources.length);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl font-bold">媒体与数据源</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          媒体池可配置；电子报/官网地址、抓取开关在此维护。真实抓取由独立部署的外部抓取服务负责，
          通过接入 API 回推文章；沙箱内可用「模拟推送」走通完整入库链路。
        </p>
      </header>

      {/* 外部抓取接入说明 + Mock 联调操作条 */}
      <Card>
        <CardContent className="pt-5 pb-4 flex flex-wrap items-center gap-3">
          <div className="text-sm text-[var(--muted-foreground)] mr-auto">
            外部抓取服务：<code className="px-1.5 py-0.5 bg-[#f3efe7] rounded text-[13px]">GET /api/ingest/queue</code> 拉取队列、
            <code className="px-1.5 py-0.5 bg-[#f3efe7] rounded text-[13px] ml-1">POST /api/ingest/articles</code> 回推文章，
            鉴权令牌在「系统配置」中维护。
          </div>
          <Button variant="outline" size="sm" onClick={() => setArticlesOpen(true)}>
            <Inbox className="w-4 h-4 mr-1" /> 查看已入库文章
          </Button>
          <Button size="sm" disabled={mockLoading} onClick={() => mockIngest()}>
            {mockLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1" />}
            模拟外部推送（全部源）
          </Button>
        </CardContent>
      </Card>

      {loadError && <p role="alert" className="text-sm text-[var(--brand)]">{loadError}</p>}
      <Card><CardContent className="pt-5 text-sm space-y-2">
        <p>当前筛选范围内，每日任务可用 active source：<strong>{loading ? "加载中" : stats.active}</strong> 个。仅启用中数据源参与自动抓取。</p>
        <p className="text-[var(--muted-foreground)]">每日实际参与抓取（北京时间、按 source_id 去重；全局统计，包含手动启动的每日任务）：</p>
        {loading ? <p>加载执行记录…</p> : dailyActivity ? dailyActivity.map(d => <p key={d.date}>{d.date}：<strong>{d.actualSources}</strong> 个</p>) : <p>实际抓取日志暂时无法读取</p>}
        <p className="text-xs text-[var(--muted-foreground)]">从本次状态治理生效后开始统计，旧 284 源运行不追认为 active 运行。可用数量不等于当天已执行数量。</p>
      </CardContent></Card>
      {/* 汇总统计条 */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-[var(--foreground)]">{stats.total}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">总计</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#3f7d5c]">{stats.active}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">启用中</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#b8860b]">{stats.needs_fix}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">待修复</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--brand)]">{stats.duplicate}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">重复停用</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--muted-foreground)]">{stats.manual_disabled}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-1">人工停用</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">全部源状态</SelectItem>
            {Object.entries(sourceStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
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
                  <TableHead className="w-20">媒体启用</TableHead>
                  <TableHead className="w-28 text-right">数据源配置</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((m) => (
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
                          const st = s.source_status === "active" ? crawlStatusLabel.ok : s.source_status === "needs_fix" ? crawlStatusLabel.warning : crawlStatusLabel.untested;
                          return (
                            <Badge key={s.id} className={`text-[10px] ${st.cls}`}>
                              {s.source_type === "epaper" ? "电子报" : "官网"}·{sourceStatusLabels[s.source_status]}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch checked={m.enabled} onCheckedChange={(v) => toggleMedia(m, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setSourceDialog(items.find(item => item.id === m.id) ?? m)}>
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
        onMock={(sid) => mockIngest(sid)}
        mockBusy={mockLoading}
      />

      <ArticlesDialog open={articlesOpen} onOpenChange={setArticlesOpen} />
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 已入库文章预览（联调验证用） */
function ArticlesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [articles, setArticles] = useState<
    Array<{ id: string; title: string; mediaName: string; publishedAt: string | null; wordCount: number | null }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/admin/articles?limit=100")
      .then((r) => r.json())
      .then((d) => setArticles(d.articles ?? []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif">已入库文章（最近 100 篇）</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--muted-foreground)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
            </div>
          ) : articles.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-8 text-center">
              暂无文章，点击「模拟外部推送」生成联调数据
            </p>
          ) : (
            <div className="space-y-2">
              {articles.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-3">
                    <div className="text-sm font-medium leading-snug">{a.title}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-1 flex gap-3">
                      <span>{a.mediaName}</span>
                      <span>{a.publishedAt ? fmtTime(a.publishedAt) : "—"}</span>
                      <span>{a.wordCount ? `${a.wordCount} 字` : ""}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceConfigDialog({
  media,
  onClose,
  onSave,
  onMock,
  mockBusy,
}: {
  media: Media | null;
  onClose: () => void;
  onSave: (sourceId: string, body: Record<string, unknown>) => void;
  onMock: (sourceId: string) => void;
  mockBusy: boolean;
}) {
  const [edits, setEdits] = useState<Record<string, { url: string; status: SourceStatus }>>({});
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
    } catch (err: unknown) {
      setTestResult({
        ...testResult,
        [sourceId]: { success: false, message: err instanceof Error ? err.message : "测试失败" },
      });
    } finally {
      setTesting(null);
    }
  };

  useEffect(() => {
    if (!media) return;
    const map: Record<string, { url: string; status: SourceStatus }> = {};
    for (const s of media.sources) {
      map[s.id] = { url: s.source_url ?? "", status: s.source_status };
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
                      {s.last_ingest_at && (
                        <span className="ml-2 text-xs font-normal text-[#3f7d5c]">
                          最近入库 {fmtTime(s.last_ingest_at)}
                          {typeof s.last_ingest_count === "number" && s.last_ingest_count > 0 && (
                            <> · 入库 {s.last_ingest_count} 篇</>
                          )}
                        </span>
                      )}
                      {s.fail_count > 0 && (
                        <span className="ml-2 text-xs font-normal text-[var(--brand)]">
                          连续失败 {s.fail_count} 次
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary">{sourceStatusLabels[s.source_status]}</Badge>
                  </div>
                  <p className="text-xs break-all text-[var(--muted-foreground)]">source_id：{s.id}</p>
                  {s.status_reason && <p className="text-xs">状态原因：{s.status_reason}</p>}
                  {s.duplicate_of && <p className="text-xs break-all">保留源：{s.duplicate_of}</p>}
                  {s.last_error && (
                    <p className="text-xs text-[var(--brand)] break-all">最近错误：{s.last_error}</p>
                  )}
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
                      <Label className="text-xs">数据源状态</Label>
                      <Select
                        value={edit.status}
                        onValueChange={(v) => setEdits({ ...edits, [s.id]: { ...edit, status: v as SourceStatus } })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(sourceStatusLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value} disabled={(value === "active" && (!s.verified_at || !!s.duplicate_of)) || (value === "duplicate" && !s.duplicate_of)}>{label}</SelectItem>
                          ))}
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
                    <LoadingButton
                      size="sm"
                      variant="outline"
                      onClick={() => testCrawl(s.id)}
                      disabled={!edit.url}
                      loading={testing === s.id}
                      loadingText="测试中..."
                      title="沙箱内直连真实站点（PoC，多数站点受网络/反爬限制）"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" /> 沙箱直连测试
                    </LoadingButton>
                    <LoadingButton
                      size="sm"
                      variant="outline"
                      onClick={() => onMock(s.id)}
                      loading={mockBusy}
                      loadingText="推送中..."
                      title="模拟外部抓取服务回推 3 篇文章，走真实入库去重链路"
                    >
                      <FlaskConical className="w-3 h-3 mr-1" /> 模拟推送
                    </LoadingButton>
                    <Button
                      size="sm"
                      onClick={() =>
                        onSave(s.id, {
                          source_url: edit.url || null,
                          source_status: edit.status,
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
                          : "bg-[#f6e3e1] text-[var(--brand)]"
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
