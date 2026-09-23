"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** 错误标题 */
  title?: string;
  /** 错误详情 */
  message?: string;
  /** 重试按钮文案 */
  retryText?: string;
  onRetry?: () => void;
  className?: string;
}

/** 统一错误状态：图标 + 文案 + 重试按钮 */
export function ErrorState({
  title = "加载失败",
  message,
  retryText = "重试",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-red-100 bg-red-50/50 px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-red-100 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <p className="text-base font-medium text-[var(--foreground)]">{title}</p>
      {message && (
        <p className="max-w-md break-words text-sm leading-relaxed text-[#8a8275]">{message}</p>
      )}
      {onRetry && (
        <Button
          variant="outline"
          className="mt-2"
          onClick={onRetry}
        >
          <RefreshCw className="size-4 mr-1.5" />
          {retryText}
        </Button>
      )}
    </div>
  );
}