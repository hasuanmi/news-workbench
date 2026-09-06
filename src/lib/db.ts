import "server-only";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/** 服务端统一使用 service role 客户端（内部工作台，权限由中间件控制） */
export function supabase() {
  return getSupabaseClient();
}
