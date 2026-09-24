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
import {
  Check,
  X,
  Merge,
  Plus,
  Loader2,
  Sparkles,
  ScanText,
  Eye,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isVagueName, calendarToday } from "@/lib/calendar-policy";

type CandidatePreview = Pick<Candidate, "node_name" | "candidate_date" | "candidate_month" | "date_status" | "category_id" | "region" | "importance" | "ai_reason" | "source_url"> & { source_basis?: string | null };

interface Category {
  id: string;
  code: string;
  category_name: string;
  color?: string | null;
}
interface Candidate {
  id: string;
  node_name: string;
  target_year: number;
  candidate_date: string | null;
  candidate_month: number | null;
  date_status: "confirmed" | "month_known" | "unknown";
  category_id: string | null;
  region: string;
  importance: string;
  source_type: string;
  source_detail: string | null;
  raw_text: string | null;
  description: string | null;
  ai_reason: string | null;
  source_url: string | null;
  dedup_status: string;
  merged_into_id: string | null;
  merged_sources: string[] | null;
  review_status: "pending" | "confirmed" | "rejected" | "merged";
  rejection_reason: string | null;
  category?: Category | null;
}

const SOURCE_LABEL: Record<string, string> = {
  historical_migration: "历史迁移",
  ai_supplement: "AI推荐",
  pasted_text: "用户粘贴识别",
  manual: "用户新增",
};
const SOURCE_COLOR: Record<string, { fg: string; bg: string }> = {
  historical_migration: { fg: "#5F5E5A", bg: "#F1EFE8" },
  ai_supplement: { fg: "#0C447C", bg: "#E6F1FB" },
  pasted_text: { fg: "#0F6E56", bg: "#E1F5EE" },
  manual: { fg: "#854F0B", bg: "#FAEEDA" },
};
const REGION_LABEL: Record<string, string> = {
  national: "国内/国际",
  guangdong: "广东",
  guangzhou: "广州",
  other: "其他",
};
const REVIEW_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "待审", cls: "border-[#b8860b] text-[#b8860b]" },
  confirmed: { label: "已加入", cls: "bg-[#3f7d5c] text-white" },
  rejected: { label: "已驳回", cls: "bg-[var(--brand)] text-white" },
  merged: { label: "已合并", cls: "bg-[#5b6b8c] text-white" },
  kept: { label: "已保留", cls: "border-[#5b6b8c] text-[#5b6b8c]" },
};
const REJECT_REASONS = ["重复已存在", "非新闻节点", "信息不实", "时间已过期", "其他"];

function dateLabel(c: Candidate): string {
  if (c.date_status === "confirmed" && c.candidate_date) return c.candidate_date;
  if (c.date_status === "month_known" && c.candidate_month) return `${c.target_year}年${c.candidate_month}月`;
  return "—";
}

export function CandidatePool() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Candidate[]>([]);
  const [targetYear, setTargetYear] = useState<number>(calendarToday().getUTCFullYear());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [reviewFilter, setReviewFilter] = useState("pending");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [dupOnly, setDupOnly] = useState(false);

  // AI 推荐完成后：本次新生成候选 id（用于高亮/“本次生成”标签）+ 顶部提示条
  const [justIds, setJustIds] = useState<string[]>([]);
  const [recoBanner, setRecoBanner] = useState<number | null>(null);

  // 确认加入（修改后入正式日历）
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [form, setForm] = useState({
    node_name: "",
    date_status: "confirmed" as Candidate["date_status"],
    candidate_date: "",
    candidate_month: "",
    category_id: "",
    region: "national",
    importance: "B",
    description: "",
  });

  // 不采纳
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejecting, setRejecting] = useState<Candidate | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // 新增候选（手动 / 粘贴识别 合并入口）
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"paste" | "fill">("paste");
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<CandidatePreview | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [fill, setFill] = useState({
    node_name: "",
    date_status: "confirmed" as Candidate["date_status"],
    candidate_date: "",
    candidate_month: "",
    category_id: "",
    region: "national",
    importance: "B",
    description: "",
  });

  // AI 推荐候选
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recoYear, setRecoYear] = useState<number>(targetYear);
  const [recoFocus, setRecoFocus] = useState<string[]>([]);
  const [recoRegion, setRecoRegion] = useState<string>("all");
  const [recoMonths, setRecoMonths] = useState<number[]>([]);
  const [recoIndustry, setRecoIndustry] = useState<string>("");
  const [recoKeywords, setRecoKeywords] = useState<string>("");
  const [recoExtra, setRecoExtra] = useState<string>("");
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoList, setRecoList] = useState<CandidatePreview[]>([]);
  const [recoSel, setRecoSel] = useState<boolean[]>([]);

  // 查看对比
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareItem, setCompareItem] = useState<Candidate | null>(null);

  const catMap = (id: string | null) => categories.find((c) => c.id === id) ?? null;

  const load = useCallback(
    (
      overrides: Partial<{
        targetYear: number;
        reviewFilter: string;
        sourceFilter: string;
        keyword: string;
        dupOnly: boolean;
      }> = {},
    ) => {
      setLoading(true);
      const yr = overrides.targetYear ?? targetYear;
      const rf = overrides.reviewFilter ?? reviewFilter;
      const sf = overrides.sourceFilter ?? sourceFilter;
      const kw = overrides.keyword ?? keyword;
      const dp = overrides.dupOnly ?? dupOnly;
      const params = new URLSearchParams({ targetYear: String(yr) });
      if (rf !== "all") params.set("reviewStatus", rf);
      if (sf !== "all") params.set("sourceType", sf);
      if (kw) params.set("keyword", kw);
      if (dp) params.set("dedupStatus", "duplicate");
      fetch(`/api/admin/calendar/candidates?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => setItems(d.items ?? []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    },
    [targetYear, reviewFilter, sourceFilter, keyword, dupOnly],
  );

  useEffect(() => {
    fetch("/api/calendar/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, keyword ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, keyword]);

  async function generateFromHistory() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/calendar/candidates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetYear, sourceType: "historical_migration" }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "生成失败");
        return;
      }
      toast.success(
        `已生成 ${d.inserted} 条候选${d.skipped ? `（跳过已存在 ${d.skipped} 条）` : ""}`,
      );
      load();
    } finally {
      setBusy(false);
    }
  }

  function openConfirm(c: Candidate) {
    setEditing(c);
    setForm({
      node_name: c.node_name,
      date_status: c.date_status,
      candidate_date: c.candidate_date ?? "",
      candidate_month: c.candidate_month ? String(c.candidate_month) : "",
      category_id: c.category_id ?? "",
      region: c.region ?? "national",
      importance: c.importance ?? "B",
      description: c.description ?? "",
    });
    setConfirmOpen(true);
  }

  async function submitConfirm() {
    if (!editing) return;
    if (!form.node_name.trim()) return toast.error("名称必填");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/candidates/${editing.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          node_name: form.node_name.trim(),
          date_status: form.date_status,
          candidate_date: form.date_status === "confirmed" ? form.candidate_date : null,
          candidate_month: form.date_status === "month_known" ? Number(form.candidate_month) : null,
          category_id: form.category_id || null,
          region: form.region,
          importance: form.importance,
          description: form.description || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "确认失败");
        return;
      }
      toast.success("已加入正式日历");
      setConfirmOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitReject() {
    if (!rejecting) return;
    if (!rejectReason) return toast.error("请选择不采纳原因");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/candidates/${rejecting.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "操作失败");
        return;
      }
      toast.success("已标记为不采纳");
      setRejectOpen(false);
      setRejecting(null);
      setRejectReason("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function runRecognize() {
    if (!pasteText.trim()) return toast.error("请先粘贴文本");
    setPasteLoading(true);
    setPastePreview(null);
    try {
      const res = await fetch("/api/admin/calendar/candidates/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: pasteText, targetYear }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "识别失败");
        return;
      }
      setPastePreview(d.candidate);
    } finally {
      setPasteLoading(false);
    }
  }

  async function submitPasteAdd() {
    if (!pastePreview) return;
    setBusy(true);
    try {
      const p = pastePreview;
      const res = await fetch("/api/admin/calendar/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_name: p.node_name,
          target_year: targetYear,
          date_status: p.date_status,
          candidate_date: p.date_status === "confirmed" ? p.candidate_date : null,
          candidate_month: p.date_status === "month_known" ? p.candidate_month : null,
          category_id: p.category_id || null,
          region: p.region,
          importance: p.importance,
          source_type: "pasted_text",
          raw_text: pasteText,
          ai_reason: p.ai_reason || null,
          source_url: p.source_url || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "添加失败");
        return;
      }
      toast.success(d.duplicateOfId ? "已入池（疑似重复，待你确认）" : "已入池");
      setAddOpen(false);
      setPasteText("");
      setPastePreview(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitFill() {
    if (!fill.node_name.trim()) return toast.error("名称必填");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/calendar/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fill,
          target_year: targetYear,
          candidate_date: fill.date_status === "confirmed" ? fill.candidate_date : null,
          candidate_month: fill.date_status === "month_known" ? Number(fill.candidate_month) : null,
          category_id: fill.category_id || null,
          source_type: "manual",
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "新增失败");
        return;
      }
      toast.success(d.duplicateOfId ? "已入池（疑似重复，待你确认）" : "已新增候选");
      setAddOpen(false);
      setFill({
        node_name: "",
        date_status: "confirmed",
        candidate_date: "",
        candidate_month: "",
        category_id: "",
        region: "national",
        importance: "B",
        description: "",
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function runRecommend() {
    if (!recoYear || recoYear < 2000) return toast.error("目标年份无效");
    setRecoLoading(true);
    setRecoList([]);
    try {
      const res = await fetch("/api/admin/calendar/candidates/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetYear: recoYear,
          focusCategories: recoFocus,
          region: recoRegion,
          months: recoMonths,
          industries: recoIndustry,
          keywords: recoKeywords,
          extraRequirements: recoExtra,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "推荐失败");
        return;
      }
      if (!d.candidates || d.candidates.length === 0) {
        toast.info("未检索到可确认来源的具体事件，未生成候选");
        return;
      }
      setRecoList(d.candidates);
      setRecoSel(d.candidates.map(() => true));
    } finally {
      setRecoLoading(false);
    }
  }

  async function submitRecommendAdd() {
    const sel = recoList.filter((_, i) => recoSel[i]);
    if (sel.length === 0) return toast.error("请至少选择一条");
    setBusy(true);
    let added = 0;
    let dup = 0;
    const newIds: string[] = [];
    try {
      for (const c of sel) {
        const res = await fetch("/api/admin/calendar/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_name: c.node_name,
            target_year: recoYear,
            date_status: c.date_status,
            candidate_date: c.date_status === "confirmed" ? c.candidate_date : null,
            candidate_month: c.date_status === "month_known" ? c.candidate_month : null,
            category_id: c.category_id || null,
            region: c.region,
            importance: c.importance,
            source_type: "ai_supplement",
            ai_reason: c.ai_reason,
            source_detail: c.source_basis || null,
            source_url: c.source_url,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast.error(d.error || "添加失败");
          continue;
        }
        added++;
        newIds.push(d.item?.id);
        if (d.duplicateOfId) dup++;
      }
      toast.success(`已入池 ${added} 条${dup ? `（${dup} 条疑似重复）` : ""}`);
      setRecommendOpen(false);
      setRecoList([]);
      // AI 推荐完成后：自动切到“AI推荐”筛选 + 顶部提示 + 本次生成高亮
      // 关键修复：直接以新的筛选条件拉取，避免 load 闭包读到旧的 sourceFilter
      setJustIds(newIds);
      setRecoBanner(added);
      setSourceFilter("ai_supplement");
      if (recoYear !== targetYear) setTargetYear(recoYear);
      load({ targetYear: recoYear, sourceFilter: "ai_supplement" });
    } finally {
      setBusy(false);
    }
  }

  function openCompare(c: Candidate) {
    setCompareItem(c);
    setCompareOpen(true);
  }

  async function mergeCandidate(c: Candidate, primaryId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/candidates/${c.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", mergedIntoId: primaryId }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "合并失败");
        return;
      }
      toast.success("已合并到主候选");
      setCompareOpen(false);
      setCompareItem(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function keepCandidate(c: Candidate) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/calendar/candidates/${c.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "keep" }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "操作失败");
        return;
      }
      toast.success("已保留两条（不再判为重复）");
      setCompareOpen(false);
      setCompareItem(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  const primaryOf = (c: Candidate) =>
    c.merged_into_id ? items.find((i) => i.id === c.merged_into_id) ?? null : null;

  return (
    <div className="space-y-4">
      {/* 来源入口 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">目标年度</Label>
          <Select value={String(targetYear)} onValueChange={(v) => setTargetYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[targetYear - 1, targetYear, targetYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} 年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setRecoYear(calendarToday().getUTCFullYear());
            setRecoList([]);
            setRecoSel([]);
            setRecommendOpen(true);
          }}
          disabled={busy}
        >
          <Bot className="w-3.5 h-3.5 mr-1" /> AI推荐候选
        </Button>
        <Button size="sm" variant="outline" onClick={generateFromHistory} disabled={busy}>
          <Sparkles className="w-3.5 h-3.5 mr-1" /> 从历史日历生成
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 新增候选
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={reviewFilter} onValueChange={setReviewFilter}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待审</SelectItem>
            <SelectItem value="confirmed">已加入</SelectItem>
            <SelectItem value="merged">已合并</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
            <SelectItem value="kept">已保留</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            <SelectItem value="historical_migration">历史迁移</SelectItem>
            <SelectItem value="ai_supplement">AI推荐</SelectItem>
            <SelectItem value="pasted_text">粘贴识别</SelectItem>
            <SelectItem value="manual">手动新增</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs"
          placeholder="搜索节点名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button
          size="sm"
          variant={dupOnly ? "default" : "ghost"}
          className={dupOnly ? "bg-[#b8860b] text-white" : ""}
          onClick={() => setDupOnly((v) => !v)}
        >
          仅看疑似重复
        </Button>
      </div>

      {recoBanner !== null && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#0C447C]/30 bg-[#E6F1FB] px-3 py-2 text-sm">
          <span className="text-[#0C447C]">
            本次 AI 推荐生成 <b>{recoBanner}</b> 条候选，已自动筛选为「AI推荐」。
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[#0C447C]" onClick={() => setSourceFilter("all")}>
              切回全部来源
            </Button>
            <button
              className="text-[#0C447C] text-lg leading-none px-1"
              onClick={() => setRecoBanner(null)}
              aria-label="关闭提示"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--muted-foreground)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-[var(--muted-foreground)]">
              暂无候选。可点击「AI推荐候选」「从历史日历生成」或「新增候选」。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">时间</TableHead>
                  <TableHead>节点名称</TableHead>
                  <TableHead className="w-20">分类</TableHead>
                  <TableHead className="w-14">重要度</TableHead>
                  <TableHead className="w-20">来源</TableHead>
                  <TableHead className="w-48 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => {
                  const isDup = c.dedup_status === "duplicate";
                  const primary = isDup ? primaryOf(c) : null;
                  const src = SOURCE_COLOR[c.source_type] ?? { fg: "#444", bg: "#eee" };
                  const isFresh = justIds.includes(c.id);
                  return (
                    <TableRow key={c.id} className={cn(isFresh && "bg-[#E6F1FB]/50")}>
                      <TableCell className="align-top pt-3">
                        <TimeCell c={c} />
                      </TableCell>
                      <TableCell className="align-top pt-3">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          {c.node_name}
                          {(isVagueName(c.node_name) || c.ai_reason?.startsWith("信息待补全")) && <Badge variant="outline">信息待补全</Badge>}
                          {isDup && (
                            <span className="text-[10px] text-[#854F0B] bg-[#FAEEDA] px-1.5 py-0.5 rounded">
                              疑似重复
                            </span>
                          )}
                          {c.dedup_status === "kept" && (
                            <span className="text-[10px] text-[#5b6b8c] border border-[#5b6b8c] px-1.5 py-0.5 rounded">
                              已保留
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--muted-foreground)]">
                          {REGION_LABEL[c.region] ?? c.region}
                          {isDup && primary && (
                            <span>· 与「{primary.node_name}」相似</span>
                          )}
                          {c.merged_sources && Array.isArray(c.merged_sources) && c.merged_sources.length > 0 && (
                            <span>· 合并来源：{c.merged_sources.join("/")}</span>
                          )}
                        </div>
                        {c.ai_reason && (
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            推荐理由：{c.ai_reason}
                          </div>
                        )}
                        {c.source_detail && c.source_type === "ai_supplement" && (
                          <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                            来源依据：{c.source_detail}
                          </div>
                        )}
                        {c.source_url && (
                          <div className="mt-0.5 text-xs">
                            <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[#0C447C] underline break-all">
                              来源链接 ↗
                            </a>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top pt-3">
                        {c.category ? (
                          <span className="text-xs" style={{ color: c.category.color || "var(--muted-foreground)" }}>
                            {c.category.category_name}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">未分类</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top pt-3">
                        <Badge
                          className={cn(
                            "text-[10px]",
                            c.importance === "S" && "bg-[var(--brand)] text-white",
                            c.importance === "A" && "bg-[var(--gold)] text-white",
                            c.importance === "B" && "bg-[var(--muted-foreground)] text-white",
                          )}
                        >
                          {c.importance}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top pt-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ color: src.fg, background: src.bg }}
                          >
                            {SOURCE_LABEL[c.source_type] ?? c.source_type}
                          </span>
                          {isFresh && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0C447C] text-white">
                              本次生成
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top pt-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {isDup ? (
                            <>
                              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openCompare(c)}>
                                <Eye className="w-3.5 h-3.5" /> 查看对比
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                disabled={!primary}
                                onClick={() => primary && mergeCandidate(c, primary.id)}
                              >
                                <Merge className="w-3.5 h-3.5" /> 合并
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={() => keepCandidate(c)}
                              >
                                保留两条
                              </Button>
                            </>
                          ) : c.review_status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-[#3f7d5c]"
                                onClick={() => openConfirm(c)}
                              >
                                <Check className="w-3.5 h-3.5" /> 确认加入
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-[var(--destructive)]"
                                onClick={() => {
                                  setRejecting(c);
                                  setRejectReason("");
                                  setRejectOpen(true);
                                }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Badge className={cn("text-[10px]", REVIEW_BADGE[c.review_status].cls)}>
                              {REVIEW_BADGE[c.review_status].label}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 确认加入（修改后入正式日历） */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif">确认加入正式日历</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="space-y-1.5">
              <Label>节点名称 *</Label>
              <Input value={form.node_name} onChange={(e) => setForm({ ...form, node_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>时间状态</Label>
                <Select value={form.date_status} onValueChange={(v) => setForm({ ...form, date_status: v as Candidate["date_status"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">已定日期</SelectItem>
                    <SelectItem value="month_known">仅知月份</SelectItem>
                    <SelectItem value="unknown">待定</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                {form.date_status === "confirmed" ? (
                  <>
                    <Label>日期 (YYYY-MM-DD)</Label>
                    <Input type="date" value={form.candidate_date} onChange={(e) => setForm({ ...form, candidate_date: e.target.value })} />
                  </>
                ) : form.date_status === "month_known" ? (
                  <>
                    <Label>月份</Label>
                    <Input type="number" min={1} max={12} value={form.candidate_month} onChange={(e) => setForm({ ...form, candidate_month: e.target.value })} />
                  </>
                ) : (
                  <Label className="block pt-6 text-[var(--muted-foreground)]">时间待定，无需填日期</Label>
                )}
              </div>
            </div>
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
                    <SelectItem value="guangdong">广东</SelectItem>
                    <SelectItem value="guangzhou">广州</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
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
              <Label>背景 / 说明</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button onClick={submitConfirm} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 确认加入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 不采纳 */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">不采纳候选</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              节点：<span className="font-medium text-[var(--foreground)]">{rejecting?.node_name}</span>
            </p>
            <div className="space-y-1.5">
              <Label>不采纳原因 *（必选）</Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger>
                  <SelectValue placeholder="选择原因" />
                </SelectTrigger>
                <SelectContent>
                  {REJECT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={submitReject} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 确认不采纳
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增候选（粘贴识别 / 直接填写） */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif">新增候选</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border-tertiary)] p-1">
              <button
                type="button"
                onClick={() => setAddMode("paste")}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-md",
                  addMode === "paste" ? "bg-[var(--color-background-secondary)] font-medium" : "text-[var(--muted-foreground)]",
                )}
              >
                粘贴信息智能识别
              </button>
              <button
                type="button"
                onClick={() => setAddMode("fill")}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-md",
                  addMode === "fill" ? "bg-[var(--color-background-secondary)] font-medium" : "text-[var(--muted-foreground)]",
                )}
              >
                直接填写
              </button>
            </div>

            {addMode === "paste" ? (
              <div className="space-y-3">
                <Textarea
                  rows={5}
                  placeholder="粘贴会议通知 / 政策说明 / 公众号内容等，AI 自动识别节点名称、时间、分类、地区、重要度与来源…"
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    setPastePreview(null);
                  }}
                />
                <Button size="sm" onClick={runRecognize} disabled={pasteLoading || !pasteText.trim()}>
                  {pasteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanText className="w-4 h-4 mr-2" />}
                  智能识别
                </Button>
                {pastePreview && (
                  <div className="rounded-lg border border-[var(--border-tertiary)] p-3 space-y-1.5 text-sm">
                    <div className="font-medium">{pastePreview.node_name}</div>
                    <div className="text-xs text-[var(--muted-foreground)] flex flex-wrap gap-2">
                      <span>{dateLabel(pastePreview as Candidate)}</span>
                      <span>· {catMap(pastePreview.category_id)?.category_name ?? "未分类"}</span>
                      <span>· {REGION_LABEL[pastePreview.region] ?? pastePreview.region}</span>
                      <span>· {pastePreview.importance}</span>
                    </div>
                    {pastePreview.source_url && (
                      <div className="text-xs">
                        <a href={pastePreview.source_url} target="_blank" rel="noreferrer" className="text-[#0C447C] underline break-all">
                          来源：{pastePreview.source_url} ↗
                        </a>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={submitPasteAdd} disabled={busy}>
                        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 确认入池
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPastePreview(null)}>重新识别</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>节点名称 *</Label>
                  <Input value={fill.node_name} onChange={(e) => setFill({ ...fill, node_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>时间状态</Label>
                    <Select value={fill.date_status} onValueChange={(v) => setFill({ ...fill, date_status: v as Candidate["date_status"] })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmed">已定日期</SelectItem>
                        <SelectItem value="month_known">仅知月份</SelectItem>
                        <SelectItem value="unknown">待定</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    {fill.date_status === "confirmed" ? (
                      <>
                        <Label>日期 (YYYY-MM-DD)</Label>
                        <Input type="date" value={fill.candidate_date} onChange={(e) => setFill({ ...fill, candidate_date: e.target.value })} />
                      </>
                    ) : fill.date_status === "month_known" ? (
                      <>
                        <Label>月份</Label>
                        <Input type="number" min={1} max={12} value={fill.candidate_month} onChange={(e) => setFill({ ...fill, candidate_month: e.target.value })} />
                      </>
                    ) : (
                      <Label className="block pt-6 text-[var(--muted-foreground)]">时间待定</Label>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>分类</Label>
                    <Select value={fill.category_id} onValueChange={(v) => setFill({ ...fill, category_id: v })}>
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
                    <Select value={fill.region} onValueChange={(v) => setFill({ ...fill, region: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="national">国内/国际</SelectItem>
                        <SelectItem value="guangdong">广东</SelectItem>
                        <SelectItem value="guangzhou">广州</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>重要度</Label>
                    <Select value={fill.importance} onValueChange={(v) => setFill({ ...fill, importance: v })}>
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
                  <Label>背景 / 说明</Label>
                  <Textarea rows={3} value={fill.description} onChange={(e) => setFill({ ...fill, description: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
                  <Button onClick={submitFill} disabled={busy}>
                    {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 新增
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI 推荐候选 */}
      <Dialog open={recommendOpen} onOpenChange={setRecommendOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">AI推荐候选</DialogTitle>
          </DialogHeader>
          {recoList.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--muted-foreground)]">
                结合历史日历的关注类型与当年联网公开信息，补充当前年度的动态会议 / 活动 / 政策 / 行业事件。每条均带来源依据、推荐理由与官方来源链接，模糊无来源的节点不会进入候选池。
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>目标年份</Label>
                  <Select value={String(recoYear)} onValueChange={(v) => setRecoYear(Number(v))} disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[targetYear - 1, targetYear, targetYear + 1].map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y} 年
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>重点地区（主要筛选）</Label>
                  <Select value={recoRegion} onValueChange={setRecoRegion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">广东及全国</SelectItem>
                      <SelectItem value="guangdong">广东</SelectItem>
                      <SelectItem value="guangzhou">广州</SelectItem>
                      <SelectItem value="national">国内/国际</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>关注类型（主要筛选，可多选，留空=全部）</Label>
                <Select
                  value=""
                  onValueChange={(v) =>
                    setRecoFocus((prev) => (prev.includes(v) ? prev : [...prev, v]))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="添加关注类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.code}>
                        {c.category_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recoFocus.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {recoFocus.map((f) => (
                      <span key={f} className="text-xs px-2 py-0.5 rounded bg-[var(--color-background-secondary)]">
                        {categories.find((c) => c.code === f)?.category_name ?? f}
                        <button className="ml-1 text-[var(--muted-foreground)]" onClick={() => setRecoFocus(recoFocus.filter((x) => x !== f))}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>关注月份（主要筛选，可多选，留空=不限）</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setRecoMonths((prev) =>
                          prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                        )
                      }
                      className={cn(
                        "text-xs px-2 py-1 rounded border",
                        recoMonths.includes(m)
                          ? "bg-[#0C447C] text-white border-[#0C447C]"
                          : "border-[var(--border-tertiary)] text-[var(--muted-foreground)]",
                      )}
                    >
                      {m}月
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>行业领域（主要筛选，可选）</Label>
                <Input
                  placeholder="如：科技 / 医疗健康 / 教育 / 金融 / 文旅…"
                  value={recoIndustry}
                  onChange={(e) => setRecoIndustry(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>关键词（可选）</Label>
                  <Input
                    placeholder="如：博览會 / 论坛 / 周年"
                    value={recoKeywords}
                    onChange={(e) => setRecoKeywords(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>自定义补充要求（可选）</Label>
                <Textarea
                  rows={2}
                  placeholder="如：优先补充与广州相关、且适合做专题策划的节点"
                  value={recoExtra}
                  onChange={(e) => setRecoExtra(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRecommendOpen(false)}>取消</Button>
                <Button onClick={runRecommend} disabled={recoLoading}>
                  {recoLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 开始推荐
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <p className="text-sm text-[var(--muted-foreground)]">共 {recoList.length} 条建议，勾选需要入池的候选：</p>
              {recoList.map((c, i) => (
                <label key={i} className="flex gap-3 rounded-lg border border-[var(--border-tertiary)] p-3 cursor-pointer">
                  <input type="checkbox" checked={recoSel[i]} onChange={() => setRecoSel(recoSel.map((s, j) => (j === i ? !s : s)))} className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">{c.node_name}</div>
                    <div className="text-xs text-[var(--muted-foreground)] flex flex-wrap gap-2">
                      <span>{dateLabel(c as Candidate)}</span>
                      <span>· {catMap(c.category_id)?.category_name ?? "未分类"}</span>
                      <span>· {REGION_LABEL[c.region] ?? c.region}</span>
                      <span>· {c.importance}</span>
                    </div>
                    <div className="text-xs">推荐理由：{c.ai_reason}</div>
                    {c.source_basis && (
                      <div className="text-xs text-[var(--muted-foreground)]">
                        来源依据：{c.source_basis}
                      </div>
                    )}
                    {c.source_url && (
                      <div className="text-xs">
                        <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[#0C447C] underline break-all">
                          来源链接：{c.source_url} ↗
                        </a>
                      </div>
                    )}
                  </div>
                </label>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => { setRecoList([]); setRecoSel([]); }}>返回</Button>
                <Button onClick={submitRecommendAdd} disabled={busy}>
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 确认入池选中项
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 查看对比 */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif">查看对比 · 疑似重复</DialogTitle>
          </DialogHeader>
          {compareItem && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted-foreground)]">
                「{compareItem.node_name}」与「{primaryOf(compareItem)?.node_name}」被判定为疑似重复（名称/时间/地区/分类相近）。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[var(--border-tertiary)] p-3 space-y-1.5 text-sm">
                  <div className="font-medium">当前候选</div>
                  <CompareRows c={compareItem} catName={catMap(compareItem.category_id)?.category_name} />
                </div>
                <div className="rounded-lg border border-[var(--border-tertiary)] p-3 space-y-1.5 text-sm">
                  <div className="font-medium">主候选</div>
                  {primaryOf(compareItem) ? (
                    <CompareRows c={primaryOf(compareItem)!} catName={catMap(primaryOf(compareItem)!.category_id)?.category_name} />
                  ) : (
                    <div className="text-[var(--muted-foreground)]">（主候选已不存在）</div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCompareOpen(false)}>取消</Button>
                {primaryOf(compareItem) && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => keepCandidate(compareItem)}
                      disabled={busy}
                    >
                      保留两条
                    </Button>
                    <Button
                      onClick={() => mergeCandidate(compareItem, primaryOf(compareItem)!.id)}
                      disabled={busy}
                    >
                      {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 合并
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimeCell({ c }: { c: Candidate }) {
  const line1 =
    c.date_status === "confirmed" && c.candidate_date
      ? c.candidate_date
      : c.date_status === "month_known" && c.candidate_month
        ? `${c.target_year}年${c.candidate_month}月`
        : "—";
  const badge =
    c.date_status === "confirmed"
      ? { label: "已确定", cls: "bg-[#3f7d5c] text-white" }
      : c.date_status === "month_known"
        ? { label: "仅知月份", cls: "bg-[var(--gold)] text-white" }
        : { label: "时间待定", cls: "bg-[var(--muted-foreground)] text-white" };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] leading-5 font-mono tabular-nums">{line1}</span>
      <span className={cn("text-[10px] px-1.5 py-0.5 rounded self-start", badge.cls)}>
        {badge.label}
      </span>
    </div>
  );
}

function CompareRows({ c, catName }: { c: Candidate; catName?: string | null }) {
  return (
    <>
      <Row label="名称" value={c.node_name} />
      <Row label="日期" value={dateLabel(c)} />
      <Row label="地区" value={REGION_LABEL[c.region] ?? c.region} />
      <Row label="分类" value={catName ?? "未分类"} />
      <Row label="来源" value={SOURCE_LABEL[c.source_type] ?? c.source_type} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
