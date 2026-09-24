import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { recognizePastedText } from "@/lib/calendar-candidate";

/**
 * POST /api/admin/calendar/candidates/recognize
 * 粘贴信息识别：把用户粘贴的原文交给 DeepSeek 抽取单条节点字段，返回结构化预览。
 * 不直接入池，用户确认后再调 POST /candidates（source_type=pasted_text）。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const rawText = String(body.rawText ?? "").trim();
  const targetYear = Number(body.targetYear) || (await (await import("@/lib/calendar-candidate")).getTargetYear());
  if (!rawText) {
    return NextResponse.json({ error: "请粘贴需要识别的文本内容" }, { status: 400 });
  }

  try {
    const { candidate } = await recognizePastedText(rawText, targetYear);
    if (!candidate) {
      return NextResponse.json(
        { information_status: "needs_completion", error: "信息待补全：原文不足以确认具体事件，请补充正式名称或来源通知；系统不会猜测名称" },
        { status: 422 },
      );
    }
    return NextResponse.json({ success: true, candidate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[candidate-recognize] 异常:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
