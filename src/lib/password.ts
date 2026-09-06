import "server-only";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// 密码哈希（仅 Node Runtime 使用，不被 Edge middleware 引入）
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const hashBuf = Buffer.from(hash, "hex");
  const calcBuf = scryptSync(password, salt, 64);
  if (hashBuf.length !== calcBuf.length) return false;
  return timingSafeEqual(hashBuf, calcBuf);
}
