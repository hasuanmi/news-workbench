"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DELETE_REASONS = [
  "不属于重要新闻节点",
  "一次性事件",
  "重要性不足",
  "与广东/广州关联度低",
  "信息不准确",
  "重复节点",
  "已失效",
  "其他",
];

interface Props {
  open: boolean;
  eventName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}

export function CalendarDeleteDialog({
  open,
  eventName,
  onOpenChange,
  onConfirm,
  loading,
}: Props) {
  const [reason, setReason] = useState<string>(DELETE_REASONS[0]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif">
            删除节点「{eventName}」
          </AlertDialogTitle>
          <AlertDialogDescription>
            删除为软删除，将保留原节点信息、来源与删除时间，供后续 AI 推荐参考。请选择删除原因：
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-1.5 py-1">
          {DELETE_REASONS.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
            >
              <input
                type="radio"
                name="delete-reason"
                className="accent-[var(--primary)]"
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {r}
            </label>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              onConfirm(reason);
            }}
            className="bg-red-700 text-white hover:bg-red-800"
          >
            {loading ? "删除中…" : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}