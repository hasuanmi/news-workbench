"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pencil, Power, Trash2, RefreshCw, ExternalLink, Clock } from "lucide-react";
import { normalizeEventName } from "@/lib/calendar-engine";
import type { CalDetail } from "./calendar-types";

const regionLabel = (r?: string) => (r === "local" ? "广东/广州" : "国内/国际");

const SOURCE_LABEL: Record<string, string> = {
  historical_migration: "历史迁移",
  ai_supplement: "AI 推荐",
  manual: "用户新增",
  pasted_text: "用户粘贴",
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
    failCount?: number;
    canManualRegen?: boolean;
    maxRetries?: number;
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
    // 补全未完成（pending/processing）或失败待自动重试（failed 未达上限）时定时刷新，完成后自动呈现
    const timer = window.setInterval(() => {
      setDetail((prev) => {
        const s = prev?.enrich?.status;
        if (prev && (s === "pending" || s === "processing" || s === "failed")) {
          void loadDetail();
        }
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
  const source = detail?.source_type ?? detail?.source ?? null;
  const sourceLabel = source ? SOURCE_LABEL[source] ?? source : null;

  const enrich = detail?.enrich ?? null;
  const enrichStatus = enrich?.status ?? "none";
  // 状态机：none(未处理) / pending(已入队) / processing(处理中) / completed(已完成) / failed(失败)
  const isEnrichBusy =
    enrichStatus === "pending" || enrichStatus === "processing";
  const isEnrichDone = enrichStatus === "completed";
  const isEnrichFailed = enrichStatus === "failed";
  // 成功但无可靠来源（ai_sources 为空）+ 已完成 → 显示「暂未检索到可靠来源」
  const isEnrichNoSource = isEnrichDone && (enrich?.sources?.length ?? 0) === 0;
  // 仅当失败且已达自动重试上限时，才允许次级「重新生成」（后台异常恢复）
  const showManualRegen = isEnrichFailed && enrich?.canManualRegen === true;
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

              {/* 自动补全：后台生成，前台直接展示（无需人工点击） */}
              <section className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                {/* 状态条 */}
                {isEnrichBusy && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mb-2">
                    <Clock className="h-3.5 w-3.5 animate-pulse" />
                    正在自动补全…系统将自动呈现实时结果
                  </div>
                )}
                {isEnrichFailed && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-2">
                    <Clock className="h-3.5 w-3.5 animate-pulse" />
                    自动补全失败，系统将自动重试
                    {showManualRegen && "（已用尽重试次数，可手动重新生成）"}
                  </div>
                )}

                {/* 背景信息 */}
                <div className="mb-3">
                  <h3 className="text-sm font-semibold mb-1">背景信息</h3>
                  {isEnrichBusy ? (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {displayBackground || "正在自动补全…"}
                    </p>
                  ) : isEnrichNoSource ? (
                    <p className="text-sm text-[var(--muted-foreground)]">待补充</p>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {displayBackground || "待补充"}
                    </p>
                  )}
                </div>

                {/* 为什么值得关注 */}
                {(isEnrichDone || enrichStatus === "none") && !isEnrichBusy && !isEnrichFailed && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-0.5">
                      为什么值得关注
                    </h4>
                    <p className="text-sm leading-relaxed">
                      {isEnrichNoSource ? (
                        <span className="text-[var(--muted-foreground)]">待补充</span>
                      ) : (
                        enrich?.why || "待补充"
                      )}
                    </p>
                  </div>
                )}

                {/* 可参考的选题方向 */}
                {(isEnrichDone || enrichStatus === "none") && !isEnrichBusy && !isEnrichFailed &&
                  (enrich?.topics?.length ?? 0) > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">
                        可参考的选题方向
                      </h4>
                      <ul className="space-y-1">
                        {enrich!.topics!.map((t, i) => (
                          <li key={i} className="text-sm flex gap-1.5">
                            <span className="text-[var(--primary)] shrink-0">·</span>
                            <span className="leading-relaxed">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* 无可靠来源提示 */}
                {isEnrichNoSource && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    参考来源：暂未检索到可靠来源
                  </p>
                )}

                {/* 已达到自动重试上限 → 仅此时提供次级「重新生成」管理操作 */}
                {showManualRegen && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={regenerate}
                      disabled={regenerating}
                      title="自动重试已用尽，可在后台手动重新生成"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${regenerating ? "animate-spin" : ""}`} />
                      {regenerating ? "重新生成中…" : "重新生成"}
                    </Button>
                    {regenError && <span className="text-xs text-red-700">{regenError}</span>}
                  </div>
                )}
              </section>

              {/* 参考来源（已生成时展示） */}
              {(enrich?.sources?.length ?? 0) > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-1.5">参考来源</h3>
                  <ul className="space-y-1.5">
                    {enrich!.sources!.map((s, i) => (
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
