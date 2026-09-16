"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/** 统一的异步操作状态 */
export type AsyncStatus = "idle" | "running" | "success" | "error";

export interface AsyncActionOptions {
  /** 操作成功后的 toast 文案；不传则不提示 */
  successMessage?: string;
  /** 操作失败时的 toast 文案（会与真实错误信息一起展示）；不传不提示 */
  errorMessage?: string;
  /** 是否在失败时自动 toast 真实错误信息 */
  toastError?: boolean;
}

/**
 * 封装异步操作的四态驱动：idle / running / success / error
 * - 自动防重入（running 中忽略重复触发）
 * - 统一成功/失败 toast
 * - 供 LoadingButton / AsyncArea 消费同一 status
 */
export function useAsyncAction<A extends unknown[] = []>(
  fn: (...args: A) => Promise<void>,
  options: AsyncActionOptions = {}
) {
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const run = useCallback(
    async (...args: A) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setStatus("running");
      setError(null);
      try {
        await fn(...args);
        setStatus("success");
        if (options.successMessage) toast.success(options.successMessage);
        if (options.toastError !== false) {
          // success 不做额外处理
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "操作失败";
        setError(msg);
        setStatus("error");
        if (options.toastError !== false) {
          if (options.errorMessage) toast.error(`${options.errorMessage}：${msg}`);
          else toast.error(msg);
        }
      } finally {
        busyRef.current = false;
      }
    },
    [fn, options.successMessage, options.errorMessage, options.toastError]
  );

  const reset = useCallback(() => {
    busyRef.current = false;
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, run, reset, isRunning: status === "running" };
}