"use client";

import * as React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface LoadingButtonProps
  extends React.ComponentProps<"button">,
    ButtonVariantProps {
  /** 是否处于加载中 */
  loading?: boolean;
  /** loading 时替换的文案，默认 "处理中…" */
  loadingText?: string;
  /** 加载态图标（默认旋转 spinner） */
  loadingIcon?: React.ReactNode;
  /** 成功后短暂展示的对勾反馈（默认 1800ms） */
  showSuccess?: boolean;
  /** 失败后展示的图标（可选，配合 statusError） */
  statusError?: boolean;
  /** 成功后 auto 清除的毫秒数 */
  successDuration?: number;
}

/**
 * 统一异步按钮：
 * - loading 时展示 spinner + 替换文案 + disabled（禁止重复点击）
 * - 可短暂展示成功对勾 / 失败叉
 */
export const LoadingButton = React.forwardRef<
  HTMLButtonElement,
  LoadingButtonProps
>(function LoadingButton(
  {
    loading = false,
    loadingText = "处理中…",
    loadingIcon,
    showSuccess = false,
    statusError = false,
    successDuration = 1800,
    children,
    disabled,
    className,
    ...props
  },
  ref
) {
  const [tick, setTick] = React.useState(false);

  React.useEffect(() => {
    if (showSuccess) {
      setTick(true);
      const t = setTimeout(() => setTick(false), successDuration);
      return () => clearTimeout(t);
    }
    setTick(false);
  }, [showSuccess, successDuration]);

  const icon = tick ? (
    <CheckCircle2 className="size-4" />
  ) : statusError ? (
    <XCircle className="size-4" />
  ) : loading ? (
    loadingIcon ?? <Loader2 className="size-4 animate-spin" />
  ) : null;

  return (
    <Button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "transition-colors duration-200",
        tick && "text-emerald-600",
        statusError && "text-destructive",
        className
      )}
      {...props}
    >
      {icon && <span className={cn("shrink-0", loading && "animate-pulse")}>{icon}</span>}
      {loading ? loadingText : children}
    </Button>
  );
});