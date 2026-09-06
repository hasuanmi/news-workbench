/**
 * 初始化默认内部账号（幂等）
 * 默认密码：newsdesk2026，首次登录后建议在系统管理中修改（M2 补改密功能）
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
  const passwordHash = hashPassword("newsdesk2026");

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
  console.log("默认密码: newsdesk2026");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
