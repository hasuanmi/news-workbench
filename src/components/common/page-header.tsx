"use client";

import type { ReactNode } from "react";

/**
 * 全站统一页面标题（顶部距离由 AppShell 内容区 padding 提供，本组件不额外加 pt）。
 * 所有一级页面的标题区必须复用本组件，保证标题距顶、标题样式、副标题间距一致。
 */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  /** 标题行右侧可选操作（如按钮），布局与左侧标题 flex 排布 */
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-[var(--foreground)]">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}