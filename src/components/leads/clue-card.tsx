"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Check, Eye, X } from "lucide-react";

export interface Clue {
  id: string;
  media_name: string;
  clue_type: string;
  series_name: string;
  summary: string;
  tags: string[];
  reason: string;
  confidence: number;
  article_count: number;
  first_found_at: string;
  last_seen_at: string;
  review_status: "pending" | "confirmed" | "ignored";
  articles?: Array<{ title: string; url: string; published_at: string }>;
}

interface ClueCardProps {
  clue: Clue;
  onConfirm?: (id: string) => void;
  onIgnore?: (id: string) => void;
  onView?: (id: string) => void;
}

const CLUE_TYPE_LABELS: Record<string, string> = {
  new_column: "新栏目",
  series: "系列报道",
  special_topic: "专题",
  feature_plan: "特色策划",
};

const CLUE_TYPE_COLORS: Record<string, string> = {
  new_column: "bg-blue-100 text-blue-800",
  series: "bg-purple-100 text-purple-800",
  special_topic: "bg-amber-100 text-amber-800",
  feature_plan: "bg-green-100 text-green-800",
};

export function ClueCard({ clue, onConfirm, onIgnore, onView }: ClueCardProps) {
  return (
    <Card className="border border-[#e8e2d8] hover:border-[#b3392f]/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-[#1f1b16]">{clue.media_name}</span>
              <Badge className={`text-xs ${CLUE_TYPE_COLORS[clue.clue_type] || "bg-gray-100 text-gray-800"}`}>
                {CLUE_TYPE_LABELS[clue.clue_type] || clue.clue_type}
              </Badge>
            </div>
            <h3 className="text-base font-serif font-bold text-[#1f1b16] truncate">{clue.series_name}</h3>
          </div>
          <div className="text-right text-xs text-[#6b6257] whitespace-nowrap">
            <div>追踪 {clue.article_count} 篇</div>
            <div>置信度 {Math.round(clue.confidence * 100)}%</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* AI 摘要 */}
        <div>
          <div className="text-xs text-[#6b6257] mb-1">AI 摘要</div>
          <p className="text-sm text-[#1f1b16] leading-relaxed">{clue.summary}</p>
        </div>

        {/* 标签 */}
        {Array.isArray(clue.tags) && clue.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {clue.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-xs bg-[#faf7f2] text-[#6b6257] rounded border border-[#e8e2d8]">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 为什么值得关注 */}
        <div>
          <div className="text-xs text-[#6b6257] mb-1">为什么值得关注</div>
          <p className="text-sm text-[#1f1b16] leading-relaxed">{clue.reason}</p>
        </div>

        {/* 时间信息 */}
        <div className="flex gap-4 text-xs text-[#6b6257]">
          <span>首次发现：{new Date(clue.first_found_at).toLocaleString("zh-CN")}</span>
          <span>最近更新：{new Date(clue.last_seen_at).toLocaleString("zh-CN")}</span>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2 border-t border-[#e8e2d8]">
          <Button variant="outline" size="sm" onClick={() => onView?.(clue.id)}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            查看
          </Button>
          {clue.review_status === "pending" && (
            <>
              <Button size="sm" onClick={() => onConfirm?.(clue.id)} className="bg-[#3f7d5c] hover:bg-[#2f5f46] text-white">
                <Check className="h-3.5 w-3.5 mr-1" />
                确认
              </Button>
              <Button variant="outline" size="sm" onClick={() => onIgnore?.(clue.id)}>
                <X className="h-3.5 w-3.5 mr-1" />
                忽略
              </Button>
            </>
          )}
          {clue.review_status === "confirmed" && (
            <Badge className="bg-[#3f7d5c] text-white">已确认</Badge>
          )}
          {clue.review_status === "ignored" && (
            <Badge variant="outline" className="text-[#6b6257]">
              已忽略
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
