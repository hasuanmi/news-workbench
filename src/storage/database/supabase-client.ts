/**
 * Supabase 客户端工厂
 *
 * 独立部署：通过标准环境变量配置（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。
 * 向后兼容：也读取 COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY / COZE_SUPABASE_SERVICE_ROLE_KEY。
 *
 * 必需项（正常运行只需要这两项，可在「系统管理 → 系统配置 → 数据库连接」中填写）：
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 可选项：
 *   SUPABASE_ANON_KEY —— 仅当按登录用户身份访问（受行级权限约束）时才需要；
 *                        当前版本所有服务端调用均使用 service role key，故可不填。
 *
 * 不依赖任何扣子专属运行时。
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let envLoaded = false;

interface SupabaseCredentials {
  url: string;
  /** service role key：服务端读写主要使用 */
  serviceRoleKey?: string;
  /** anon key：可选，仅在按用户身份访问时需要 */
  anonKey?: string;
}

function loadEnv(): void {
  if (envLoaded) return;
  const url = resolveEnv("SUPABASE_URL");
  const anyKey = resolveEnv("SUPABASE_SERVICE_ROLE_KEY") || resolveEnv("SUPABASE_ANON_KEY");
  if (url && anyKey) {
    envLoaded = true;
    return;
  }
  try {
    require("dotenv").config();
  } catch {
    // dotenv not installed — env vars must be set externally
  }
  envLoaded = true;
}

/** 优先读标准名，回退 COZE_ 前缀（向后兼容沙箱环境） */
function resolveEnv(standardKey: string): string | undefined {
  return process.env[standardKey] || process.env[`COZE_${standardKey}`];
}

function getSupabaseCredentials(): SupabaseCredentials {
  loadEnv();
  const url = resolveEnv("SUPABASE_URL");
  if (!url) {
    throw new Error(
      "Supabase 未配置：请在「系统管理 → 系统配置」的数据库连接中填写 Project URL 与 Service Role Key。"
    );
  }
  return {
    url,
    serviceRoleKey: resolveEnv("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: resolveEnv("SUPABASE_ANON_KEY"),
  };
}

export function getSupabaseClient(token?: string): SupabaseClient {
  const { url, serviceRoleKey, anonKey } = getSupabaseCredentials();

  let key: string;
  if (token) {
    // 按登录用户身份访问（受行级权限约束）需要 anon key
    if (!anonKey) {
      throw new Error("缺少 SUPABASE_ANON_KEY：按用户身份访问需要 anon key。");
    }
    key = anonKey;
  } else {
    key = serviceRoleKey ?? anonKey ?? "";
    if (!key) {
      throw new Error(
        "Supabase 未配置密钥：请在「系统管理 → 系统配置」的数据库连接中填写 Service Role Key。"
      );
    }
  }

  const globalOptions: Record<string, unknown> = {};
  if (token) {
    globalOptions.headers = { Authorization: `Bearer ${token}` };
  }

  return createClient(url, key, {
    global: globalOptions,
    db: {
      timeout: 60000,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
