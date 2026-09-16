"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 页面切换间的「新页面单向淡入」容器。
 *
 * 原理：用 React key 在 contentKey 变化时强制重建该容器，配合纯 CSS
 * `animation`（@keyframes page-in）从 opacity:0 淡入到 1。
 * - 仅对「新进入的内容」做动画，旧内容保持静止，不做任何 exit/位移/缩放；
 * - 用 CSS animation 而非依赖时序的 transition，保证每次切换都确实触发淡入，
 *   不会出现"片刻硬切"；
 * - AppShell、左侧导航、PageHeader 均在外层，不参与此动画。
 */
export function PageTransition({
  children,
  className,
  contentKey,
}: {
  children: ReactNode;
  className?: string;
  contentKey?: string | number;
}) {
  return (
    <div
      key={String(contentKey)}
      className={cn("animate-page-in motion-reduce:animate-none", className)}
    >
      {children}
    </div>
  );
}