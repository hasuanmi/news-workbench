"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  last_seen_at: string;
}

const CLUE_TYPE_LABELS: Record<string, string> = {
  new_column: "新栏目",
  series: "系列报道",
  special_topic: "专题",
  feature_plan: "特色策划",
};

const CLUE_TYPE_COLORS: Record<string, string> = {
  new_column: "bg-[var(--brand)] text-white",
  series: "bg-[var(--gold)] text-white",
  special_topic: "bg-[var(--muted-foreground)] text-white",
  feature_plan: "bg-[#3f7d5c] text-white",
};

export function LeadsBoard() {
  const [clues, setClues] = useState<Clue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [mediaFilter, setMediaFilter] = useState("");

  const fetchClues = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    if (dateFilter) params.set("date", dateFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (mediaFilter) params.set("mediaId", mediaFilter);

    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      setClues(data.clues);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, dateFilter, typeFilter, mediaFilter]);

  useEffect(() => {
    fetchClues();
  }, [fetchClues]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 sticky top-0 bg-[var(--background)] z-10 py-3 border-b border-[var(--border)]">
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          className="w-40 h-9"
          placeholder="按日期筛选"
        />
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue placeholder="线索类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="new_column">新栏目</SelectItem>
            <SelectItem value="series">系列报道</SelectItem>
            <SelectItem value="special_topic">专题</SelectItem>
            <SelectItem value="feature_plan">特色策划</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-[var(--muted-foreground)]">
          共 {total} 条线索
        </div>
      </div>

      {/* 线索卡片列表 */}
      {loading ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">加载中...</div>
      ) : clues.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p className="text-lg mb-2">暂无线索</p>
          <p className="text-sm">管理员可在后台触发「AI 线索识别」从已入库文章中生成线索</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {clues.map((clue) => (
            <Card key={clue.id} className="border-[var(--border)] shadow-none">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* 类型徽章 */}
                  <Badge className={CLUE_TYPE_COLORS[clue.clue_type ?? ""] ?? "bg-[var(--muted-foreground)] text-white shrink-0"}>
                    {CLUE_TYPE_LABELS[clue.clue_type ?? ""] ?? "未分类"}
                  </Badge>

                  <div className="flex-1 min-w-0">
                    {/* 标题行 */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-[var(--foreground)]">
                        {clue.clue_name || clue.topic || clue.summary}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)] shrink-0">
                        {clue.media_name}
                      </span>
                    </div>

                    {/* 摘要 */}
                    {clue.summary && (
                      <p className="text-sm text-[var(--muted-foreground)] mb-2 line-clamp-2">
                        {clue.summary}
                      </p>
                    )}

                    {/* 底部信息 */}
                    <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                      <span>首次发现: {new Date(clue.first_found_at).toLocaleDateString("zh-CN")}</span>
                      {clue.article_count > 1 && (
                        <span>追踪 {clue.article_count} 篇</span>
                      )}
                      {clue.confidence > 0 && (
                        <span className="flex items-center gap-1">
                          置信度
                          <span className="inline-block w-12 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                            <span
                              className="block h-full bg-[#3f7d5c] rounded-full"
                              style={{ width: `${clue.confidence * 100}%` }}
                            />
                          </span>
                          {Math.round(clue.confidence * 100)}%
                        </span>
                      )}
                    </div>

                    {/* 标签 */}
                    {clue.tags && clue.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {clue.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-xs bg-[#f5f0e8] text-[var(--muted-foreground)] rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-[var(--muted-foreground)]">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
