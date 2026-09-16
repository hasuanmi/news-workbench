"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageTransitionProps {
  children: React.ReactNode;
  /** 切换键：contentKey 变化时先淡出旧内容(100ms)再淡入新内容(180ms) */
  contentKey?: string;
  className?: string;
  /**
   * 原生 View Transitions API 可用时置 true：跳过内部的淡出淡入动画（由浏览器接管全页过渡），
   * 仅稳定渲染最新内容，避免两种动画叠加。
   */
  enableStatic?: boolean;
}

/**
 * 轻量内容切换：contentKey 变化时「旧内容淡出 120ms → 新内容淡入 240ms（轻微上移）」。
 * - 用 state 缓存旧 children，待旧内容完全淡出后才换成新 children，避免整页直接替换的“硬”感。
 * - 仅 opacity + 轻微上移，不做复杂转场；不引额外路由耦合。
 */
export function PageTransition({
  children,
  contentKey,
  className,
  enableStatic,
}: PageTransitionProps) {
  const [display, setDisplay] = React.useState<React.ReactNode>(children);
  const [phase, setPhase] = React.useState<"in" | "out">("in");
  const prevKey = React.useRef(contentKey);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (prevKey.current !== contentKey) {
      prevKey.current = contentKey;
      if (timer.current) clearTimeout(timer.current);
      // 淡出旧内容（120ms）
      setPhase("out");
      timer.current = setTimeout(() => {
        // 旧内容已透明，替换为新内容并淡入（240ms）
        setDisplay(children);
        setPhase("in");
      }, 120);
    }
    // children 变化但 key 未变（数据刷新）时直接展示新内容，保持现状
  }, [contentKey, children]);

  // View Transitions 接管时不再做内部动画（避免叠加），稳定渲染最新内容
  if (enableStatic) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <div
      className={cn(
        phase === "in"
          ? "opacity-100 transition-opacity duration-[240ms] ease-out"
          : "opacity-0 transition-opacity duration-[120ms] ease-out",
        className
      )}
    >
      {display}
    </div>
  );
}