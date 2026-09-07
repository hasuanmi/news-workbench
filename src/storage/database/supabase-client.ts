/**
 * Supabase 客户端工厂
 *
 * 独立部署：通过标准环境变量配置（SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY）。
 * 向后兼容：也读取 COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY / COZE_SUPABASE_SERVICE_ROLE_KEY。
 *
 * 不依赖任何扣子专属运行时。
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let envLoaded = false;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

function loadEnv(): void {
  if (envLoaded) return;
  if (resolveEnv("SUPABASE_URL") && resolveEnv("SUPABASE_ANON_KEY")) {
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
  const anonKey = resolveEnv("SUPABASE_ANON_KEY");
  if (!url) {
    throw new Error(
      "Supabase URL 未配置。请设置环境变量 SUPABASE_URL（或 COZE_SUPABASE_URL）。"
    );
  }
  if (!anonKey) {
    throw new Error(
      "Supabase Anon Key 未配置。请设置环境变量 SUPABASE_ANON_KEY（或 COZE_SUPABASE_ANON_KEY）。"
    );
  }
  return { url, anonKey };
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadEnv();
  return resolveEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  let key: string;
  if (token) {
    key = anonKey;
  } else {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    key = serviceRoleKey ?? anonKey;
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
