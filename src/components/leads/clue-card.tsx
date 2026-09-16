"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type ClueType = "new_column" | "series" | "special_topic" | "feature_plan";

export interface Clue {
  id: string;
  clue_type: ClueType;
  clue_name: string;
  summary: string;
  reason: string;
  tags: string[];
  article_count: number;
  confidence: number;
  review_status: string;
  first_found_at: string;
  last_seen_at: string;
  recent_article_at?: string | null;
  freshness_days?: number | null;
  media_name: string;
  articles?: {
    id: string;
    title: string;
    url: string | null;
    published_at: string;
    media_id?: string;
    media_name?: string;
  }[];
  total_articles?: number;
  display_rules?: {
    fields: {
      show_clue_type: boolean;
      show_clue_name: boolean;
      show_summary: boolean;
      show_reason: boolean;
      show_tags: boolean;
      show_article_count: boolean;
      show_first_found: boolean;
      show_last_seen: boolean;
      show_confidence: boolean;
      show_articles: boolean;
      show_freshness: boolean;
    };
    sort_by: string;
    group_by: string;
    summary_max_length: number;
    reason_max_length: number;
    enable_actions: boolean;
  } | null;
}

interface ClueCardProps {
  clue: Clue;
  onConfirm?: (id: string) => void;
  onIgnore?: (id: string, reason?: string) => void;
  onView?: (id: string) => void;
}

const CLUE_TYPE_LABELS: Record<ClueType, string> = {
  new_column: "新栏目",
  series: "系列报道",
  special_topic: "专题",
  feature_plan: "特色策划",
};

const CLUE_TYPE_STYLES: Record<ClueType, string> = {
  new_column: "bg-blue-50 text-blue-700 border-blue-200",
  series: "bg-purple-50 text-purple-700 border-purple-200",
  special_topic: "bg-amber-50 text-amber-700 border-amber-200",
  feature_plan: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_LABELS: Record<string, { label: string; style: string }> = {
  pending: { label: "待确认", style: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmed: { label: "已确认", style: "bg-green-50 text-green-700 border-green-200" },
  ignored: { label: "已忽略", style: "bg-gray-50 text-gray-500 border-gray-200" },
};

function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 单条可核验原文：标题 + 媒体名 + 完整发布时间 + 原文链接 */
function EvidenceRow({
  article,
}: {
  article: NonNullable<Clue["articles"]>[number];
}) {
  const time = article.published_at ? formatDateTime(article.published_at) : "";
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#1f1b16] hover:text-[#b3392f] hover:underline leading-snug break-words"
          >
            {article.title}
          </a>
        ) : (
          <p className="text-sm text-[#1f1b16] leading-snug break-words">{article.title}</p>
        )}
        <p className="mt-0.5 text-xs text-[#6b6257]">
          {article.media_name || "未知媒体"}
          {time ? ` · ${time}` : ""}
        </p>
      </div>
      {article.url && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 shrink-0 text-[#6b6257] hover:text-[#b3392f]"
          title="查看原文"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export function ClueCard({ clue, onConfirm, onIgnore, onView }: ClueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_LABELS[clue.review_status] || STATUS_LABELS.pending;

  // 使用 display_rules 或默认值
  const rules = clue.display_rules || {
    fields: {
      show_clue_type: true,
      show_clue_name: true,
      show_summary: true,
      show_reason: true,
      show_tags: true,
      show_article_count: true,
      show_first_found: true,
      show_last_seen: true,
      show_confidence: true,
      show_articles: true,
      show_freshness: true,
    },
    sort_by: "first_found_desc",
    group_by: "none",
    summary_max_length: 200,
    reason_max_length: 150,
    enable_actions: true,
  };

  const { fields, summary_max_length, reason_max_length, enable_actions } = rules;

  return (
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {/* 媒体名称 */}
              <span className="text-sm font-medium text-foreground">
                {clue.media_name}
              </span>
              {/* 线索类型 */}
              {fields.show_clue_type && (
                <Badge
                  variant="outline"
                  className={`text-xs ${CLUE_TYPE_STYLES[clue.clue_type]}`}
                >
                  {CLUE_TYPE_LABELS[clue.clue_type]}
                </Badge>
              )}
              {/* 状态 */}
              <Badge variant="outline" className={`text-xs ${status.style}`}>
                {status.label}
              </Badge>
            </div>
            {/* 线索名称 */}
            {fields.show_clue_name && clue.clue_name && (
              <h3 className="text-base font-semibold text-foreground leading-tight">
                {clue.clue_name}
              </h3>
            )}
          </div>
          {/* 置信度 */}
          {fields.show_confidence && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs text-muted-foreground">置信度</span>
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      clue.confidence >= 0.85
                        ? "bg-green-500"
                        : clue.confidence >= 0.6
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${clue.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {(clue.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* AI 摘要 */}
        {fields.show_summary && clue.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {truncateText(clue.summary, summary_max_length)}
          </p>
        )}

        {/* 标签 */}
        {fields.show_tags && Array.isArray(clue.tags) && clue.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clue.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs font-normal"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* 元信息行 */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {fields.show_article_count && (
            <span>已追踪 {clue.article_count} 篇</span>
          )}
          {fields.show_first_found && (
            <span>
              首次发现 {new Date(clue.first_found_at).toLocaleDateString("zh-CN")}
            </span>
          )}
          {fields.show_last_seen && (
            <span>
              最近更新 {new Date(clue.last_seen_at).toLocaleDateString("zh-CN")}
            </span>
          )}
          {/* 新鲜度徽章 */}
          {fields.show_freshness && typeof clue.freshness_days === "number" && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                clue.freshness_days <= 1
                  ? "bg-green-50 text-green-700"
                  : clue.freshness_days <= 3
                    ? "bg-amber-50 text-amber-700"
                    : "bg-gray-50 text-gray-500"
              }`}
              title={clue.recent_article_at ? `最新原文 ${new Date(clue.recent_article_at).toLocaleString("zh-CN")}` : ""}
            >
              {clue.freshness_days === 0
                ? "今天更新"
                : `${clue.freshness_days} 天前更新`}
            </span>
          )}
        </div>

        {/* 为什么值得关注 */}
        {fields.show_reason && clue.reason && (
          <div className="bg-muted/30 rounded-md px-3 py-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">值得关注：</span>
              {truncateText(clue.reason, reason_max_length)}
            </p>
          </div>
        )}

        {/* 关联原文（可核验依据） */}
        {fields.show_articles && clue.articles && clue.articles.length > 0 && (
          <div className="rounded-md border border-[#e8e2d8] bg-[#faf7f2]/60">
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="text-xs font-medium text-[#1f1b16]/70">
                关联原文 · 可核验依据
              </span>
              <span className="text-xs text-[#6b6257]">共 {clue.articles.length} 篇</span>
            </div>

            {/* 最近一篇始终可见 */}
            <div className="px-3 py-2">
              <EvidenceRow article={clue.articles[0]} />
            </div>

            {/* 其余：查看全部 */}
            {clue.articles.length > 1 && (
              <>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex w-full items-center gap-1 border-t border-[#e8e2d8] px-3 py-1.5 text-xs text-[#b3392f] hover:bg-[#faf7f2]"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      收起关联文章
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      查看全部 {clue.articles.length} 篇关联文章
                    </>
                  )}
                </button>
                {expanded && (
                  <div className="space-y-2 border-t border-[#e8e2d8] px-3 py-2">
                    {clue.articles.slice(1).map((article) => (
                      <EvidenceRow key={article.id} article={article} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 待确认但缺少原文依据时给出明确提示（正常情况下后端已过滤，双保险） */}
        {fields.show_articles &&
          clue.review_status === "pending" &&
          (!clue.articles || clue.articles.length === 0) && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              暂无可核验原文，已移出今日待确认；待抓取到相关报道后再进入。
            </p>
          )}

        {/* 操作按钮 */}
        {enable_actions && clue.review_status === "pending" && (onConfirm || onIgnore) && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/40">
            {onConfirm && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={() => onConfirm(clue.id)}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                确认新栏目
              </Button>
            )}
            {onIgnore && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const reason = window.prompt("记录判定该条‘不是新栏目’的原因（供后续 AI 识别参考）：", "");
                  onIgnore(clue.id, reason ?? undefined);
                }}
              >
                <XCircle className="h-3 w-3 mr-1" />
                不是新栏目
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
