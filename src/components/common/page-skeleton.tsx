"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface PageSkeletonProps {
  /** 行骨架数量（默认 4 行） */
  lines?: number;
  /** 首屏是否带标题条 */
  withHeader?: boolean;
  /** 卡片骨架数（默认 3 张） */
  cards?: number;
  className?: string;
}

/**
 * 页面首屏骨架。
 * 用法：<PageSkeleton /> 为通用结构；<PageSkeleton lines={0} cards={4} /> 纯卡片列表。
 */
export function PageSkeleton({
  lines = 4,
  withHeader = true,
  cards = 3,
  className,
}: PageSkeletonProps) {
  return (
    <div className={cn("w-full space-y-4", className)} aria-busy="true" aria-label="页面加载中">
      {withHeader && (
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-2/5" />
          <Skeleton className="h-9 w-28" />
        </div>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={`l-${i}`} className="h-4 w-full" />
      ))}
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton
          key={`c-${i}`}
          className="h-24 w-full rounded-lg border border-[var(--border)]"
        />
      ))}
    </div>
  );
}