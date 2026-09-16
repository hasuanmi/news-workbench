"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskStage {
  /** 阶段标识（与后端/SSE 事件名对应） */
  id: string;
  label: string;
}

export interface TaskProgressProps {
  /** 全部分阶段（按顺序） */
  stages: TaskStage[];
  /** 当前已到达的阶段 id；为 null 时"处理中"，不伪造具体步骤 */
  currentId?: string | null;
  /** 任务是否仍在进行（未结束） */
  running: boolean;
  /** 是否整体失败 */
  failed?: boolean;
  className?: string;
}

/**
 * AI 任务步骤条。
 * 重要：仅在后端/SSE 真实返回阶段事件时才展示具体步骤（currentId 有值）；
 * 没有真实阶段事件时 currentId 为 null，只显示统一的"处理中"，决不按时间伪造阶段。
 */
export function TaskProgress({
  stages,
  currentId,
  running,
  failed = false,
  className,
}: TaskProgressProps) {
  if (!running && !currentId && !failed) return null;

  const doneSet = new Set<string>();
  if (currentId && !failed) {
    const idx = stages.findIndex((s) => s.id === currentId);
    if (idx >= 0) {
      for (let i = 0; i < idx; i++) doneSet.add(stages[i].id);
    }
  }

  return (
    <div
      className={cn(
        "w-full rounded-lg border border-[#e8e2d8] bg-[#faf8f4] p-4",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#1f1b16]">
        <span className={cn("flex items-center gap-1.5", failed && "text-destructive")}>
          {failed ? (
            "处理失败"
          ) : currentId ? (
            "正在处理"
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" />
              处理中…
            </>
          )}
        </span>
      </div>
      <ol className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {stages.map((s, i) => {
          const done = failed ? doneSet.has(s.id) : doneSet.has(s.id);
          const active = currentId === s.id && !failed;
          const reached = done || active;
          return (
            <li key={s.id} className="flex items-center gap-1.5 text-sm">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-xs transition-colors duration-200",
                  done
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-[#1f1b16] text-white"
                      : "bg-[#e5ded2] text-[#8a8275]"
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "transition-colors duration-200",
                  active ? "font-medium text-[#1f1b16]" : reached ? "text-[#1f1b16]" : "text-[#a89f8f]"
                )}
              >
                {s.label}
              </span>
              {active && <Loader2 className="size-3 animate-spin text-[#1f1b16]" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}