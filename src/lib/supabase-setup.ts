import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Supabase 连接探测与数据库初始化辅助。
 *
 * 面向非技术用户：这里只回答三个问题——
 *   1. 连得上吗？（地址/密钥/网络）
 *   2. 数据库结构准备好了吗？（核心表是否存在）
 *   3. 没准备好的话，去哪里初始化？（SQL Editor 地址 + 初始化脚本）
 *
 * 注意：Supabase 的 REST 接口不能执行建表语句，所以系统不会（也无法）替用户自动建表，
 * 只提供「复制初始化 SQL → 粘贴 → Run」的引导。
 */

/** 判定数据库是否已就绪所探测的核心表 */
export const CORE_TABLES = ["media", "article", "app_config"] as const;

/** 从 Project URL 推导项目标识（https://abcdefgh.supabase.co → abcdefgh） */
export function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname;
    const first = host.split(".")[0];
    if (!first || first === "supabase" || first === "www") return null;
    return first;
  } catch {
    return null;
  }
}

/** Supabase SQL Editor 地址（新查询页） */
export function sqlEditorUrl(url: string): string | null {
  const ref = projectRefFromUrl(url);
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : null;
}

export type ProbeReason = "ok" | "not_initialized" | "bad_url" | "bad_key" | "network" | "unknown";

export interface ProbeResult {
  /** 连接是否成功（不含结构判断） */
  ok: boolean;
  /** 数据库结构是否已就绪 */
  initialized: boolean;
  reason: ProbeReason;
  message: string;
  projectRef: string | null;
  missingTables: string[];
  sqlEditorUrl: string | null;
}

interface TableProbe {
  status: "ok" | "missing" | "bad_key" | "network" | "error";
  statusCode?: number;
  message?: string;
}

async function probeTable(baseUrl: string, key: string, table: string, timeoutMs: number): Promise<TableProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.ok) return { status: "ok" };

    const text = await res.text().catch(() => "");
    let code = "";
    let message = "";
    try {
      const parsed = JSON.parse(text) as { code?: string; message?: string; error?: string; hint?: string };
      code = String(parsed.code ?? "");
      message = String(parsed.message ?? parsed.error ?? parsed.hint ?? "");
    } catch {
      message = text.slice(0, 200);
    }

    if (res.status === 401 || res.status === 403 || /jwt|api key|invalid api|permission denied/i.test(message)) {
      return { status: "bad_key", statusCode: res.status, message: message || "密钥无效" };
    }
    if (code === "PGRST205" || code === "42P01" ||
        /does not exist|could not find the table|relation .* does not exist/i.test(message)) {
      return { status: "missing", statusCode: res.status, message };
    }
    return { status: "error", statusCode: res.status, message: message || `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) return { status: "network", message: "连接超时" };
    return { status: "network", message: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** 用给定的地址与密钥探测连接与数据库结构（不写入任何配置、不记录密钥） */
export async function probeSupabase(url: string, serviceRoleKey: string, timeoutMs = 12000): Promise<ProbeResult> {
  const base = url.trim().replace(/\/+$/, "");
  const key = serviceRoleKey.trim();
  const ref = projectRefFromUrl(base);
  const editor = sqlEditorUrl(base);

  const results = await Promise.all(CORE_TABLES.map((t) => probeTable(base, key, t, timeoutMs)));
  const missing = CORE_TABLES.filter((_, i) => results[i].status === "missing");

  if (results.some((r) => r.status === "bad_key")) {
    return {
      ok: false, initialized: false, reason: "bad_key",
      message: "Service Role Key 不正确或已失效，请重新复制。",
      projectRef: ref, missingTables: [], sqlEditorUrl: editor,
    };
  }
  if (results.every((r) => r.status === "network")) {
    return {
      ok: false, initialized: false, reason: "network",
      message: "无法连接，请检查 Project URL 是否正确、网络是否可用。",
      projectRef: ref, missingTables: [], sqlEditorUrl: editor,
    };
  }
  if (results.every((r) => r.status === "error" && r.statusCode === 404)) {
    return {
      ok: false, initialized: false, reason: "bad_url",
      message: "Project URL 可能不正确（接口返回 404）。",
      projectRef: ref, missingTables: [], sqlEditorUrl: editor,
    };
  }
  if (missing.length > 0) {
    return {
      ok: true, initialized: false, reason: "not_initialized",
      message: "数据库尚未初始化",
      projectRef: ref, missingTables: [...missing], sqlEditorUrl: editor,
    };
  }
  if (results.every((r) => r.status === "ok")) {
    return {
      ok: true, initialized: true, reason: "ok",
      message: "连接正常，数据库结构已就绪。",
      projectRef: ref, missingTables: [], sqlEditorUrl: editor,
    };
  }
  const firstError = results.find((r) => r.status === "error");
  return {
    ok: false, initialized: false, reason: "unknown",
    message: firstError?.message || "未能确认数据库状态",
    projectRef: ref, missingTables: [], sqlEditorUrl: editor,
  };
}

/**
 * 初始化脚本：按文件名顺序拼接 sql/ 下的脚本，用于在空库上一次建好全部结构。
 * 仅用于「复制初始化 SQL」，系统不会自动执行（REST 接口不支持建表语句）。
 */
export function readInitSql(): string {
  const dir = path.join(process.cwd(), "sql");
  if (!fs.existsSync(dir)) return "";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return files
    .map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), "utf8").trim()}`)
    .join("\n\n");
}
