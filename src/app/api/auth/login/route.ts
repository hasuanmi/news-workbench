import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
  }

  const { data: user, error } = await supabase()
    .schema("public")
    .from("app_user")
    .select("*")
    .eq("username", username)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !user) {
    return NextResponse.json({ error: "账号不存在或已停用" }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const token = await createSessionToken({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
  });

  const res = NextResponse.json({
    success: true,
    user: { username: user.username, display_name: user.display_name, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
