import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ProxyAgent } from "undici";
import { getSupabaseClient } from "@/storage/database/supabase-client";

let proxy: { url: string; agent: ProxyAgent } | undefined;

/** 服务端统一使用 service role 客户端（内部工作台，权限由中间件控制） */
export function supabase() {
  // 保留工厂的环境加载和校验。代理仅用于此客户端，不影响 AI / 本地 ingest。
  const direct = getSupabaseClient();
  const proxyUrl = process.env.SUPABASE_PROXY_URL?.trim();
  if (!proxyUrl) return direct;
  if (proxy?.url !== proxyUrl) {
    void proxy?.agent.close();
    proxy = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) };
  }
  const dispatcher = proxy.agent;
  const url = process.env.SUPABASE_URL || process.env.COZE_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    global: {
      fetch: (input, init) => {
        const options = { ...init, dispatcher };
        return fetch(input, options);
      },
    },
    db: { timeout: 60000 },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
