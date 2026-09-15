/**
 * 一次性数据迁移：规范化日历节点名称与周年字段
 *
 * 背景：历史导入时 event_name 保留了标题里的"X周年"文本（如"毛泽东诞辰131周年"），
 * 同时系统又按目标年份用 anniversary_base_year 重新计算周年（2026-1893=133），
 * 导致"名称里的131周年"与"徽章里的133周年"重复且不一致。
 *
 * 目标（与展示层 normalizeEventName 一致）：
 *   - event_name 只保存事件主体名称（剥离"X周年"）
 *   - event_year 保存事件原始发生年份（= anniversary_base_year）
 *   - 周年展示统一由 targetYear - eventYear 动态计算
 *
 * 用法：pnpm tsx scripts/migrate-calendar-anniversary.ts
 * 幂等：重复执行无害
 */
import { getSupabaseClient } from "../src/storage/database/supabase-client";
import { normalizeEventName } from "../src/lib/calendar-engine";

interface Row {
  id: string;
  event_name: string;
  event_year: number | null;
  anniversary_base_year: number | null;
}

const sb = getSupabaseClient();
const CHUNK = 500;

async function main(): Promise<void> {
  let total = 0;
  let updated = 0;
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("calendar_event")
      .select("id,event_name,event_year,anniversary_base_year,event_type")
      .order("event_date", { ascending: true })
      .range(offset, offset + CHUNK - 1);
    if (error) throw new Error(`查询失败: ${error.message}`);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    for (const r of rows) {
      total++;
      const cleanName = normalizeEventName(r.event_name);
      const hasAnniversary = /[第]?\d{1,4}\s*周年/.test(r.event_name);
      // event_year 未回填时，从 anniversary_base_year 取
      let newYear = r.event_year ?? r.anniversary_base_year ?? null;
      let changed = false;
      const patch: Record<string, unknown> = {};
      if (cleanName !== r.event_name) {
        patch.event_name = cleanName;
        changed = true;
      }
      if (newYear != null && r.event_year == null) {
        patch.event_year = newYear;
        changed = true;
      }
      if (Object.keys(patch).length === 0) continue;
      const { error: upErr } = await sb
        .from("calendar_event")
        .update(patch)
        .eq("id", r.id);
      if (upErr) throw new Error(`更新失败 ${r.id}: ${upErr.message}`);
      updated++;
      void hasAnniversary;
    }
    offset += CHUNK;
    console.log(`已扫描 ${total} 行`);
  }
  console.log(`迁移完成：共 ${total} 行，更新 ${updated} 行。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});