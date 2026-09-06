import type { NextRequest } from "next/server";

// 会话 token：Edge Runtime 兼容（Web Crypto HMAC），middleware 与 API 共用
// 密码哈希(scrypt)在 Node 侧 ./password 中，不被 middleware 引入

export type Role = "admin" | "editor";
export const SESSION_COOKIE = "nwb_session";

export interface SessionPayload {
  sub: string;
  username: string;
  display_name: string;
  role: Role;
  exp: number;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 天

function getSecret(): string {
  return process.env.SESSION_SECRET || "nwb-dev-internal-secret-change-me";
}

async function hmacSign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Buffer.from(sig).toString("base64url");
}

export async function createSessionToken(user: {
  id: string;
  username: string;
  display_name: string;
  role: string;
}): Promise<string> {
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    display_name: user.display_name || user.username,
    role: user.role as Role,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = await hmacSign(body);
  return `${body}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmacSign(body);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.sub || !payload.username) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}
