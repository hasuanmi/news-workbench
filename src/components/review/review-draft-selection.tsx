"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Globe, CheckSquare, Square, Sparkles } from "lucide-react";
import type { DraftPayload } from "@/lib/review-draft";

interface DraftSelectionProps {
  draft: DraftPayload;
  excluded: string[];
  onToggleExclude: (articleId: string) => void;
  onGenerate: () => void;
  loadingGenerate?: boolean;
  onRefresh?: () => void;
}

/**
 * 评报·阶段1 选稿面板：展示同题报道 / 同行独有报道 / 新华社共同背景，
 * 支持排除不应参与评报的文章，确认后进入阶段2 生成。
 */
export function DraftSelection({
  draft,
  excluded,
  onToggleExclude,
  onGenerate,
  loadingGenerate,
}: DraftSelectionProps) {
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const selectedCount = useMemo(() => {
    let count = 0;
    for (const g of draft.same_topic ?? []) count += (g.articles ?? []).filter((a) => !excludedSet.has(a.article_id)).length;
    for (const h of draft.peer_highlights ?? []) if (!excludedSet.has(h.article_id)) count++;
    return count;
  }, [draft, excludedSet]);

  const renderArticle = (
    a: { media: string; title: string; url?: string; publish_time?: string; article_id: string; is_xinhua_reprint?: boolean },
  ) => {
    const checked = !excludedSet.has(a.article_id);
    return (
      <div key={`${a.article_id}-${a.title}`} className="flex items-start gap-2 py-2 border-b border-[#f1ece4] last:border-0">
        <button
          type="button"
          onClick={() => onToggleExclude(a.article_id)}
          className="mt-0.5 text-[var(--muted-foreground)] hover:text-[var(--brand)] shrink-0"
          title={checked ? "点击排除这篇文章" : "点击恢复这篇文章"}
        >
          {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--background)] text-[var(--muted-foreground)]">{a.media}</span>
            {a.is_xinhua_reprint && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fdf3e3] text-[var(--gold)]">新华社通稿</span>
            )}
          </div>
          <p className={`text-sm mt-1 ${checked ? "text-[var(--foreground)]" : "text-[#9a948a] line-through"}`}>
            {a.title}
            {a.url && (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-xs text-[var(--brand)] underline underline-offset-2"
              >
                原文链接
              </a>
            )}
          </p>
          {a.publish_time && <p className="text-xs text-[#9a948a] mt-0.5">{a.publish_time.slice(0, 16).replace("T", " ")}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[var(--background)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--brand)]" />
          <h2 className="text-sm font-semibold text-[var(--foreground)]">本期选稿结果</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            （已选 {selectedCount} 篇，可点击左侧勾选框排除不应参与评报的文章）
          </span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {(draft.same_topic ?? []).length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-1.5">
              一、同题报道（{draft.same_topic.length} 组）
            </h3>
            <div className="space-y-3">
              {(draft.same_topic ?? []).map((g) => (
                <div key={g.id} className="border border-[var(--border)] rounded-md p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[var(--brand)]">{g.theme}</span>
                  </div>
                  {g.angle_note && <p className="text-xs text-[var(--muted-foreground)] mb-2">切入角度：{g.angle_note}</p>}
                  <div className="pl-5">
                    {(g.articles ?? []).map((a) => renderArticle(a))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(draft.peer_highlights ?? []).length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-1.5">
              二、同行独有报道（广州日报无明显对应的重点报道）
            </h3>
            <div className="border border-[var(--border)] rounded-md px-3">
              {(draft.peer_highlights ?? []).map((h) => (
                <div key={h.article_id} className="flex items-start gap-2 py-2 border-b border-[#f1ece4] last:border-0">
                  <button
                    type="button"
                    onClick={() => onToggleExclude(h.article_id)}
                    className="mt-0.5 text-[var(--muted-foreground)] hover:text-[var(--brand)] shrink-0"
                  >
                    {!excludedSet.has(h.article_id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--background)] text-[var(--muted-foreground)]">{h.media}</span>
                      {h.url && (
                        <a href={h.url} target="_blank" rel="noreferrer" className="text-xs text-[var(--brand)] underline underline-offset-2">
                          原文链接
                        </a>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${!excludedSet.has(h.article_id) ? "text-[var(--foreground)]" : "text-[#9a948a] line-through"}`}>
                      {h.title}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5 flex items-center gap-1">
                      <Globe className="h-3 w-3" /> {h.why_noteworthy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(draft.xinhua_background ?? []).length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">
              三、新华社共同背景（{draft.xinhua_background.length} 篇转载，作为当天共同重大新闻背景，不做各媒体原创比较）
            </h3>
            <div className="border border-[#fdf3e3] bg-[#fffdf8] rounded-md px-3">
              {(draft.xinhua_background ?? []).map((a) => renderArticle({ ...a, is_xinhua_reprint: true }))}
            </div>
          </section>
        )}

        {(draft.same_topic?.length === 0 && draft.peer_highlights?.length === 0 && draft.xinhua_background?.length === 0) && (
          <p className="text-sm text-[var(--muted-foreground)] text-center py-6">暂无选稿结果，请调整条件后重新选稿</p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-end gap-3">
        <p className="text-xs text-[#9a948a]">AI 选稿结果仅供辅助，可排除后重新生成</p>
        <Button onClick={onGenerate} disabled={loadingGenerate || selectedCount === 0} className="bg-[var(--brand)] hover:bg-[#a03028]">
          {loadingGenerate ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {loadingGenerate ? "正在生成评报…" : "基于以上稿件生成评报"}
        </Button>
      </div>
    </div>
  );
}