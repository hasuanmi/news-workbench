import "server-only";
import fs from "node:fs";
import path from "node:path";
import { projectRefFromUrl } from "@/lib/supabase-setup";

/**
 * 本地配置层 —— 系统托管的环境变量读写。
 *
 * 设计目的：把「配置写在哪里」收敛成一个可替换的后端（ConfigBackend）。
 * 当前本机部署写入 .env.local（已被 .gitignore 忽略，Next 启动时自动加载，
 * 优先级高于 .env，因此会覆盖 .env 中的同名键）。
 *
 * 将来换成平台环境变量 / 密钥管理服务时，只需实现同一个 ConfigBackend 接口并
 * setConfigBackend(...) 一次，配置页与接口代码无需任何改动，避免散落修改。
 *
 * 安全约定：
 *   - 只允许写入 MANAGED_ENV_KEYS 白名单内的键；
 *   - 任何函数都不得打印、记录或返回密钥原文；
 *   - 对外只暴露 maskSecret() 的掩码结果。
 */

/** 允许通过配置页写入的环境变量白名单（新增托管项请在此登记） */
export const MANAGED_ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
export type ManagedEnvKey = (typeof MANAGED_ENV_KEYS)[number];

const LOCAL_ENV_FILE = ".env.local";

export interface ConfigBackend {
  /** 后端标识（仅用于界面回显，不含任何敏感值） */
  readonly name: string;
  /** 读取已持久化的配置 */
  read(): Record<string, string>;
  /** 合并写入：只覆盖传入的键，保留文件里其它键与注释 */
  write(patch: Record<string, string>): void;
}

function localEnvPath(): string {
  return path.join(process.cwd(), LOCAL_ENV_FILE);
}

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

/** 取一行里的键名；注释行/空行/非法行返回 null */
function keyOfLine(line: string): string | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const i = t.indexOf("=");
  if (i <= 0) return null;
  return t.slice(0, i).trim();
}

/** 值序列化：仅在含特殊字符时才加引号，避免把正常值写坏 */
function serializeValue(value: string): string {
  if (/^[A-Za-z0-9_\-./:=+@]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

class LocalEnvFileBackend implements ConfigBackend {
  readonly name = "本地配置文件（.env.local）";

  read(): Record<string, string> {
    const p = localEnvPath();
    if (!fs.existsSync(p)) return {};
    const out: Record<string, string> = {};
    for (const line of splitLines(fs.readFileSync(p, "utf8"))) {
      const key = keyOfLine(line);
      if (!key) continue;
      const i = line.indexOf("=");
      let value = line.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  }

  write(patch: Record<string, string>): void {
    const p = localEnvPath();
    const existing = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    const lines = existing ? splitLines(existing) : [];
    const index = new Map<string, number>();
    lines.forEach((line, i) => {
      const key = keyOfLine(line);
      if (key && !index.has(key)) index.set(key, i);
    });

    for (const [key, value] of Object.entries(patch)) {
      const next = `${key}=${serializeValue(value)}`;
      const at = index.get(key);
      if (at === undefined) {
        lines.push(next);
        index.set(key, lines.length - 1);
      } else {
        lines[at] = next;
      }
    }

    const content = `${lines.join("\n").replace(/\n+$/, "")}\n`;
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, p);
  }
}

let backend: ConfigBackend = new LocalEnvFileBackend();

/** 替换配置后端（部署方式变更时使用；业务代码无需改动） */
export function setConfigBackend(next: ConfigBackend): void {
  backend = next;
}

export function getConfigBackend(): ConfigBackend {
  return backend;
}

/** 密钥掩码 —— 界面与接口只允许出现这个结果，绝不返回原文 */
export function maskSecret(value?: string | null): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (v.length <= 8) return "•".repeat(8);
  return `${v.slice(0, 4)}${"•".repeat(10)}${v.slice(-4)}`;
}

export interface ManagedConfigView {
  configured: boolean;
  /** Project URL 非敏感，可完整回显 */
  url: string;
  projectRef: string | null;
  /** Service Role Key 只有掩码 */
  serviceKeyMasked: string;
  backend: string;
  source: "process" | "file" | "none";
}

/** 读取当前生效的配置（进程环境变量优先，其次落盘文件） */
export function readManagedConfig(): ManagedConfigView {
  const fileValues = backend.read();
  const url = (process.env.SUPABASE_URL ?? fileValues.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileValues.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const source: ManagedConfigView["source"] = process.env.SUPABASE_URL
    ? "process"
    : fileValues.SUPABASE_URL
      ? "file"
      : "none";
  return {
    configured: Boolean(url && key),
    url,
    projectRef: projectRefFromUrl(url),
    serviceKeyMasked: maskSecret(key),
    backend: backend.name,
    source,
  };
}

/**
 * 保存托管配置：写入配置后端，并同步当前进程环境变量。
 *
 * 之所以「无需重启」：Supabase 客户端在每次调用时都会重新读取环境变量创建实例
 * （见 src/storage/database/supabase-client.ts），因此改掉 process.env 即刻生效。
 * 落盘是为了保证服务重启后依然有效。
 */
export function saveManagedConfig(patch: Partial<Record<ManagedEnvKey, string>>): {
  requiresRestart: boolean;
  backend: string;
  updated: string[];
} {
  const clean: Record<string, string> = {};
  for (const key of MANAGED_ENV_KEYS) {
    const raw = patch[key];
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (!value) continue; // 空值视为「不修改」
    clean[key] = value;
  }
  if (Object.keys(clean).length === 0) {
    throw new Error("没有需要保存的配置项");
  }
  backend.write(clean);
  for (const [key, value] of Object.entries(clean)) {
    process.env[key] = value;
  }
  return { requiresRestart: false, backend: backend.name, updated: Object.keys(clean) };
}
