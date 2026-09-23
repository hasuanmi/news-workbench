"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/common/loading-button";
import { toast } from "sonner";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Clue {
  id: string;
  media_name: string;
  clue_type: string | null;
  clue_name: string | null;
  topic: string | null;
  summary: string;
  tags: string[];
  confidence: number;
  review_status: string;
  article_count: number;
  first_found_at: string;
  reason: string;
}

interface Stats {
  pending_review: number;
  auto_approved: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: "待审核", color: "bg-[#b8860b] text-white" },
  auto_approved: { label: "自动通过", color: "bg-[#3f7d5c] text-white" },
  approved: { label: "已通过", color: "bg-[#3f7d5c] text-white" },
  rejected: { label: "已驳回", color: "bg-[#9a948a] text-white" },
};

const CLUE_TYPE_LABELS: Record<string, string> = {
  new_column: "新栏目",
  series: "系列报道",
  special_topic: "专题",
  feature_plan: "特色策划",
};

export function AdminLeadsBoard() {
  const [clues, setClues] = useState<Clue[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ pending_review: 0, auto_approved: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [identifying, setIdentifying] = useState(false);
  const [reviewClue, setReviewClue] = useState<Clue | null>(null);
  const [editType, setEditType] = useState("");
  const [editSummary, setEditSummary] = useState("");

  const fetchClues = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    if (statusFilter) params.set("status", statusFilter);

    const res = await fetch(`/api/admin/leads?${params.toString()}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setClues(data.clues);
      setTotal(data.total);
      setStats(data.stats);
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    fetchClues();
  }, [fetchClues]);

  const handleIdentify = async () => {
    setIdentifying(true);
    try {
      const res = await fetch("/api/admin/leads/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit: 20 }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`线索识别完成：处理 ${data.processed} 篇，发现 ${data.cluesFound} 条线索`);
        fetchClues();
      } else {
        toast.error("识别失败: " + (data.error || "未知错误"));
      }
    } catch {
      toast.error("识别失败：网络异常");
    } finally {
      setIdentifying(false);
    }
  };

  const handleReview = async (action: "approve" | "reject" | "modify") => {
    if (!reviewClue) return;
    const body: Record<string, unknown> = { action };
    if (action === "modify") {
      body.clue_type = editType || reviewClue.clue_type;
      body.summary = editSummary || reviewClue.summary;
    }
    const res = await fetch(`/api/admin/leads/${reviewClue.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      setReviewClue(null);
      fetchClues();
    }
  };

  const openReview = (clue: Clue) => {
    setReviewClue(clue);
    setEditType(clue.clue_type ?? "");
    setEditSummary(clue.summary);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center gap-3 sticky top-0 bg-[var(--background)] z-10 py-3 border-b border-[var(--border)]">
        <LoadingButton
          onClick={handleIdentify}
          loading={identifying}
          loadingText="识别中…"
          className="bg-[var(--brand)] hover:bg-[#9a2f26] text-white"
        >
          AI 线索识别
        </LoadingButton>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">待审核</SelectItem>
            <SelectItem value="auto_approved">自动通过</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
          <span>待审核: <strong className="text-[#b8860b]">{stats.pending_review}</strong></span>
          <span>自动通过: <strong className="text-[#3f7d5c]">{stats.auto_approved}</strong></span>
          <span>共 {total} 条</span>
        </div>
      </div>

      {/* 线索列表 */}
      {loading ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">加载中...</div>
      ) : clues.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p className="text-lg mb-2">暂无线索</p>
          <p className="text-sm">点击「AI 线索识别」从已入库文章中生成线索</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {clues.map((clue) => {
            const statusInfo = STATUS_LABELS[clue.review_status] ?? STATUS_LABELS.rejected;
            return (
              <Card key={clue.id} className="border-[var(--border)] shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1 shrink-0">
                      <Badge className={statusInfo.color}>
                        {statusInfo.label}
                      </Badge>
                      {clue.clue_type && (
                        <Badge variant="outline" className="text-xs">
                          {CLUE_TYPE_LABELS[clue.clue_type]}
                        </Badge>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[var(--foreground)] mb-1">
                        {clue.clue_name || clue.topic || clue.summary || "(无标题)"}
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)] mb-2 line-clamp-2">
                        {clue.summary}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                        <span>{clue.media_name}</span>
                        <span>{new Date(clue.first_found_at).toLocaleDateString("zh-CN")}</span>
                        <span>置信度 {Math.round(clue.confidence * 100)}%</span>
                        {clue.reason && <span className="italic">「{clue.reason}」</span>}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openReview(clue)}
                    >
                      审核
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <span className="text-sm text-[var(--muted-foreground)]">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      )}

      {/* 审核弹窗 */}
      <Dialog open={!!reviewClue} onOpenChange={() => setReviewClue(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>审核线索</DialogTitle>
          </DialogHeader>
          {reviewClue && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[var(--foreground)]">线索类型</label>
                <Select value={editType} onValueChange={setEditType}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_column">新栏目</SelectItem>
                    <SelectItem value="series">系列报道</SelectItem>
                    <SelectItem value="special_topic">专题</SelectItem>
                    <SelectItem value="feature_plan">特色策划</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--foreground)]">摘要</label>
                <Textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="text-xs text-[var(--muted-foreground)] space-y-1">
                <p>媒体: {reviewClue.media_name}</p>
                <p>置信度: {Math.round(reviewClue.confidence * 100)}%</p>
                <p>理由: {reviewClue.reason}</p>
                <p>首次发现: {new Date(reviewClue.first_found_at).toLocaleString("zh-CN")}</p>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setReviewClue(null)}>取消</Button>
                <Button variant="destructive" size="sm" onClick={() => handleReview("reject")}>
                  驳回
                </Button>
                <Button size="sm" onClick={() => handleReview("approve")} className="bg-[#3f7d5c] hover:bg-[#2f6a4a]">
                  通过
                </Button>
                <Button size="sm" onClick={() => handleReview("modify")} className="bg-[var(--brand)] hover:bg-[#9a2f26]">
                  修改并通过
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
