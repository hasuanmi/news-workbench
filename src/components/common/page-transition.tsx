"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageTransitionProps {
  children: React.ReactNode;
  /** 切换键：内容变化时应向后代/自身重新触发生命周期 */
  contentKey?: string;
  className?: string;
}

/**
 * 极轻量的内容切换淡入（200ms，仅 opacity + 轻微上移）。
 * 不做复杂动画；用于页面/区块数据刷新时的平滑替换。
 */
export function PageTransition({ children, contentKey, className }: PageTransitionProps) {
  // 默认已显示（避免首屏闪动）；仅当 contentKey 变化时重新做一次淡入
  const [mounted, setMounted] = React.useState(true);
  const prevKey = React.useRef(contentKey);

  React.useEffect(() => {
    if (prevKey.current !== contentKey) {
      prevKey.current = contentKey;
      setMounted(false);
      const raf = requestAnimationFrame(() => setMounted(true));
      return () => {
        cancelAnimationFrame(raf);
        setMounted(true);
      };
    }
  }, [contentKey]);

  return (
    <div
      className={cn(
        "transition-all duration-200 ease-out",
        mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}