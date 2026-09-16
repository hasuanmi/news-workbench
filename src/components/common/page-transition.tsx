"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 页面切换过渡 —— 「仅新页面单向淡入」。
 *
 * 原则：
 * - 旧页面完全静止（不透明、不位移、不缩放、不修改外部尺寸）。
 * - 切换时在顶层叠加一个透明度从 0 → 1 的新内容层淡入出现。
 * - 动画结束后把新内容设为基底，移除叠加层。
 * - 仅使用 opacity，不引入 transform/translate/scale，杜绝任何抖动。
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
  // 当前稳定的基底内容（旧页面，不动）
  const [base, setBase] = useState<ReactNode>(children);
  // 正在淡入进入的新内容层
  const [overlay, setOverlay] = useState<ReactNode | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const prevKey = useRef(contentKey);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (contentKey === prevKey.current) return;
    prevKey.current = contentKey;

    if (timerRef.current) clearTimeout(timerRef.current);

    // 旧内容不动，顶层放一个透明的新内容层，下一帧开始淡入
    setOverlay(children);
    setOverlayVisible(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOverlayVisible(true));
    });

    // 动画结束后把新内容设为基底，移除叠加层
    timerRef.current = setTimeout(() => {
      setBase(children);
      setOverlay(null);
      setOverlayVisible(false);
    }, 200);

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [contentKey, children]);

  return (
    <div className={cn("relative", className)}>
      <div className="m-0 p-0">{base}</div>
      {overlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-[180ms] ease-out"
          style={{ opacity: overlayVisible ? 1 : 0 }}
          aria-hidden="true"
        >
          {overlay}
        </div>
      ) : null}
    </div>
  );
}