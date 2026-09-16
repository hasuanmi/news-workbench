"use client";

import * as React from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** 标题（如"今天暂未发现新栏目"） */
  title: string;
  /** 次要说明 */
  description?: string;
  /** 可选按钮文案 */
  actionText?: string;
  onAction?: () => void;
  /** 图标（默认 Inbox） */
  icon?: React.ReactNode;
  className?: string;
}

/** 统一空状态：图标 + 标题 + 说明 + 可选操作按钮 */
export function EmptyState({
  title,
  description,
  actionText,
  onAction,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#e0d7c8] bg-[#faf8f4]/50 px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-[#efe9dd] text-[#8a8275]">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <p className="text-base font-medium text-[#1f1b16]">{title}</p>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-[#8a8275]">{description}</p>
      )}
      {actionText && onAction && (
        <Button variant="outline" className="mt-2" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}