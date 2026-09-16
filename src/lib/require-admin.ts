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
  // 本版本取消角色权限区别：所有登录用户统一拥有管理员权限。role 字段保留仅作未来扩展。
  return { session };
}
