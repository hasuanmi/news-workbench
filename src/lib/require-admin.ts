import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, type SessionPayload } from "@/lib/session";

type AdminResult = { session: SessionPayload } | { error: NextResponse };

/** 管理员接口统一鉴权 */
export async function requireAdmin(req: NextRequest): Promise<AdminResult> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  }
  if (session.role !== "admin") {
    return { error: NextResponse.json({ error: "需要管理员权限" }, { status: 403 }) };
  }
  return { session };
}
