"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pencil, Power, Trash2, Sparkles, RefreshCw, ExternalLink, Clock } from "lucide-react";
import { normalizeEventName } from "@/lib/calendar-engine";
import type { CalDetail } from "./calendar-types";

const regionLabel = (r?: string) => (r === "local" ? "广东/广州" : "国内/国际");

const SOURCE_LABEL: Record<string, string> = {
  ai_recommend: "AI 推荐",
  history_migrate: "历史迁移",
  user_add: "用户新增",
  user_paste: "用户粘贴",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  fixed: "固定节点",
  dynamic: "动态节点",
};

// 详情字段名：数据库列 description 承载背景信息
type DetailEntry = {
  id: string;
  event_name: string;
  event_type: string;
  original_date: string | null;
  event_date: string | null;
  description: string | null;
  enabled: boolean;
  source?: string | null;
  source_name?: string | null;
  category?: ({ id?: string } & NonNullable<Partial<CalDetail>["category"]>) | null;
  enrich?: {
    status: string;
    background: string | null;
    why: string | null;
    topics: string[];
    sources: { title: string; url: string; snippet?: string; authority?: string }[];
    error?: string | null;
    enriched_at?: string | null;
  } | null;
} & Omit<
  Partial<CalDetail>,
  "category"
>;

interface Props {
  eventId: string | null;
  onEdit: (e: DetailEntry) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onRequestDelete: (e: DetailEntry) => void;
  onSaved?: () => void;
}

export function CalendarDetailPanel({
  eventId,
  onEdit,
  onToggleEnabled,
  onRequestDelete,
  onSaved,
}: Props) {
  const [detail, setDetail] = useState<DetailEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const d = await fetch(`/api/calendar/${eventId}`).then(async (r) => {
        const j = await r.json();
        return r.ok ? (j.item ?? null) : null;
      });
      setDetail(d);
      if (!d) setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    setDetail(null);
    void loadDetail();
    // 补全进行中（pending）时定时刷新，完成后自动呈现已生成内容
    const timer = window.setInterval(() => {
      setDetail((prev) => {
        if (prev && prev.enrich?.status === "pending") void loadDetail();
        return prev;
      });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [eventId, loadDetail]);

  // 后台管理操作：异常时强制重新生成补全结果
  const regenerate = async () => {
    if (!detail || regenerating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/admin/calendar/${detail.id}/enrich`, { method: "POST" });
      if (!res.ok) {
        setRegenError("重新生成失败，请稍后重试");
        return;
      }
      await loadDetail();
    } catch {
      setRegenError("重新生成失败，请稍后重试");
    } finally {
      setRegenerating(false);
    }
  };

  const tags: string[] = detail?.tags ?? [];
  const source = detail?.source ?? null;
  const sourceLabel = source ? SOURCE_LABEL[source] ?? source : null;

  const enrich = detail?.enrich ?? null;
  const enrichStatus = enrich?.status ?? "none";
  const isEnrichPending = enrichStatus === "pending";
  const isEnrichDone = enrichStatus === "done";
  const isEnrichNoSource = enrichStatus === "no_source";
  const displayBackground = enrich?.background || detail?.description || "";

  return (
    <div className="flex h-full flex-col">
      {!eventId ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
          选择一个新闻节点查看详情
        </div>
      ) : loading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : notFound || !detail ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted-foreground)]">
          未找到节点详情
        </div>
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-4">
              {/* 标题 */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-serif text-lg leading-snug">
                    {normalizeEventName(detail.event_name)}
                  </h2>
                  <Badge variant="outline" className="shrink-0">
                    {EVENT_TYPE_LABEL[detail.event_type] ?? detail.event_type}
                  </Badge>
                </div>
              </div>

              {/* 元信息 */}
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">重要度 {detail.importance} 级</Badge>
                <Badge variant="secondary">{regionLabel(detail.region)}</Badge>
                {detail.category && (
                  <Badge variant="secondary" style={{ color: detail.category.color }}>
                    {detail.category.category_name}
                  </Badge>
                )}
                {detail.anniversary != null && (
                  <Badge variant="secondary">
                    今年 {detail.anniversary} 周年
                    {detail.event_year
                      ? `（${detail.event_year} 年起）`
                      : detail.anniversary_base_year
                        ? `（${detail.anniversary_base_year} 年起）`
                        : ""}
                  </Badge>
                )}
                {!detail.enabled && (
                  <Badge variant="outline" className="text-amber-700 border-amber-600">
                    已停用
                  </Badge>
                )}
              </div>

              {/* 来源 */}
              {(sourceLabel || detail.source_name) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {sourceLabel && (
                    <Badge variant="outline">来源：{sourceLabel}</Badge>
                  )}
                  {detail.source_name && (
                    <span className="text-[var(--muted-foreground)]">
                      {detail.source_name}
                    </span>
                  )}
                </div>
              )}

              {/* 标签 */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              {/* 背景信息（优先展示 AI 自动补全，回退到人工备注） */}
              <section>
                <h3 className="text-sm font-semibold mb-1.5 flex items-center gap-1.5">
                  背景信息
                  {isEnrichPending && (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-[var(--muted-foreground)]">
                      <Clock className="h-3 w-3 animate-pulse" /> AI 补全中…
                    </span>
                  )}
                </h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {isEnrichDone
                    ? displayBackground || "待补充"
                    : isEnrichNoSource
                      ? "待补充"
                      : displayBackground || "待补充"}
                  {!displayBackground && !isEnrichPending && (
                    <span className="text-[var(--muted-foreground)]">
                      {enrichStatus === "none"
                        ? "系统正在检索权威来源并生成背景，请稍候或稍后刷新。"
                        : "暂未检索到可靠来源。"}
                    </span>
                  )}
                </p>
              </section>

              {/* AI 自动补全：为什么值得关注 + 选题方向 + 参考来源 */}
              <section className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> AI 节点信息补全
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={regenerate}
                    disabled={regenerating || isEnrichPending}
                    title="异常情况下管理后台可重新生成"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${regenerating ? "animate-spin" : ""}`} />
                    {regenerating ? "重新生成中…" : "重新生成"}
                  </Button>
                </div>

                {isEnrichPending && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    系统正在联网检索权威来源并生成以下内容，完成后将自动呈现…
                  </p>
                )}

                {isEnrichDone && (
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-0.5">
                        为什么值得关注
                      </h4>
                      <p className="text-sm leading-relaxed">{enrich?.why || "待补充"}</p>
                    </div>
                    {enrich?.topics && enrich.topics.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">
                          可参考的选题方向
                        </h4>
                        <ul className="space-y-1">
                          {enrich.topics.map((t, i) => (
                            <li key={i} className="text-sm flex gap-1.5">
                              <span className="text-[var(--primary)] shrink-0">·</span>
                              <span className="leading-relaxed">{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {isEnrichNoSource && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    暂未检索到可靠来源。参考来源：暂未检索到可靠来源。
                  </p>
                )}

                {regenError && <p className="text-sm text-red-700">{regenError}</p>}
              </section>

              {/* 参考来源 */}
              {enrich?.sources && enrich.sources.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-1.5">参考来源</h3>
                  <ul className="space-y-1.5">
                    {enrich.sources.map((s, i) => (
                      <li key={i} className="text-sm">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-start gap-1 text-[var(--primary)] hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="leading-snug">{s.title || s.url}</span>
                        </a>
                        {s.snippet && (
                          <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-2">
                            {s.snippet}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </ScrollArea>

          {/* 操作条 */}
          <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
            <Button size="sm" variant="outline" onClick={() => onEdit(detail)}>
              <Pencil className="h-4 w-4 mr-1" /> 编辑
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleEnabled(detail.id, !detail.enabled)}
            >
              <Power className="h-4 w-4 mr-1" />
              {detail.enabled ? "停用" : "启用"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-700 border-red-300 hover:bg-red-50"
              onClick={() => onRequestDelete(detail)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> 删除
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export type { DetailEntry };