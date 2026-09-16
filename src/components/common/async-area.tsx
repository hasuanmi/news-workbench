"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";

export interface AsyncAreaProps {
  /** 初次是否正在加载（无旧数据，显示骨架） */
  initialLoading?: boolean;
  /** 是否正在刷新/更新（已有旧数据，显示"正在更新"徽标并保留旧内容） */
  refreshing?: boolean;
  /** 错误信息（非空则显示错误态；若已有旧内容则显示在顶部提示条） */
  error?: string | null;
  onRetry?: () => void;
  /** 空态配置（提供 title 才会在无内容且无加载/错误时展示） */
  empty?: { title: string; description?: string; actionText?: string; onAction?: () => void };
  /** 是否有内容（父级判断：hasData） */
  hasData?: boolean;
  /** 骨架行数 */
  skeletonLines?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * 局部异步容器，统一处理：
 * - initialLoading：首屏骨架（不上旧内容）
 * - refreshing：保留旧内容 + 顶部"正在更新"徽标
 * - error：有旧内容→顶部错误条；无旧内容→ErrorState
 * - empty：无内容→EmptyState
 * - 其余：渲染 children
 */
export function AsyncArea({
  initialLoading,
  refreshing,
  error,
  onRetry,
  empty,
  hasData,
  skeletonLines = 4,
  className,
  children,
}: AsyncAreaProps) {
  // 首屏
  if (initialLoading) {
    return (
      <div className={cn("py-2", className)}>
        <PageSkeleton lines={skeletonLines} cards={1} withHeader={false} />
      </div>
    );
  }

  // 有内容 / 或有旧内容（refreshing 时保留）
  if (hasData || refreshing || (error && hasData)) {
    return (
      <div className={cn("relative", className)}>
        {refreshing && (
          <div className="sticky top-0 z-10 mb-2 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1f1b16]/90 px-3 py-1 text-xs text-white shadow-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              正在更新…
            </span>
          </div>
        )}
        {error && hasData && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <span className="truncate">{error}</span>
            {onRetry && (
              <button
                className="ml-3 shrink-0 font-medium underline underline-offset-2"
                onClick={onRetry}
              >
                重试
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    );
  }

  // 错误（无旧内容）
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} className={className} />;
  }

  // 空态
  if (empty) {
    return <EmptyState {...empty} className={className} />;
  }

  // 默认兜底（无骨架、无错误、无空态配置时）
  return <div className={className}>{children}</div>;
}