import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { runEnrich } from "@/lib/calendar-enrich";

/**
 * 后台管理操作：强制重新生成某个新闻节点的信息补全结果。
 * 普通用户日常无需调用——详情页直接展示补全后内容；此处用于异常恢复。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { taskId, status } = await runEnrich(id, { force: true, skipDedup: true });
  return NextResponse.json({ taskId, status });
}