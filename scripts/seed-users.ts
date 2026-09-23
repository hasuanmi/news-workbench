/**
 * 初始化默认内部账号（幂等）
 * 密码必须通过 SEED_USER_PASSWORD 提供，没有固定默认密码；重跑会重置已有账号密码。
 */
import "dotenv/config";
import { getSupabaseClient } from "../src/storage/database/supabase-client";
import { hashPassword } from "../src/lib/password";

const USERS = [
  { username: "admin", display_name: "系统管理员", role: "admin" as const },
  { username: "editor", display_name: "值班编辑", role: "editor" as const },
];

async function main() {
  const db = getSupabaseClient();
  const password=process.env.SEED_USER_PASSWORD;
  if(!password)throw new Error('Set SEED_USER_PASSWORD before initializing accounts');
  const passwordHash = hashPassword(password);

  for (const u of USERS) {
    const { data: existing } = await db
      .schema("public")
      .from("app_user")
      .select("id")
      .eq("username", u.username)
      .maybeSingle();

    if (existing) {
      await db
        .schema("public")
        .from("app_user")
        .update({ display_name: u.display_name, role: u.role, enabled: true, password_hash: passwordHash })
        .eq("id", existing.id);
      console.log(`已更新用户: ${u.username} (${u.role})`);
    } else {
      const { error } = await db
        .schema("public")
        .from("app_user")
        .insert({
          username: u.username,
          password_hash: passwordHash,
          display_name: u.display_name,
          role: u.role,
          enabled: true,
        });
      if (error) {
        console.error(`创建用户失败 ${u.username}:`, error.message);
      } else {
        console.log(`已创建用户: ${u.username} (${u.role})`);
      }
    }
  }
  console.log("账号密码来自 SEED_USER_PASSWORD，不输出真实值");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
