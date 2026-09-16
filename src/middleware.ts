import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

// /api/ingest/* 由外部抓取服务用 ingest token 鉴权（不带登录 cookie），在此放行，
// 具体鉴权逻辑在各 route 内通过 verifyIngestToken 完成
// /api/cron/* 由外部定时器用 CRON_SECRET 鉴权（也可带管理员 cookie），在 route 内鉴权
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/ingest", "/api/cron", "/api/leads"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // 静态资源放行
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/assets") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    // API 返回 401，页面跳登录
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // 本版本取消角色权限区别：登录用户即可访问 /admin 与 /api/admin（role 字段保留仅作未来扩展）
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
