/**
 * 初始化数据导入脚本：媒体列表(xlsx) + 2024新闻日历(docx)
 * 用法：pnpm tsx scripts/import-data.ts
 * 幂等：媒体按 media_name upsert；日历节点按 event_name+event_date 去重
 */
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";
import * as crypto from "crypto";
import { getSupabaseClient } from "../src/storage/database/supabase-client";

// ---------- docx 表格解析 ----------
function parseDocxTables(buffer: Buffer): string[][][] {
  const zip = new AdmZip(buffer);
  const xml = zip.readAsText("word/document.xml");
  const tables: string[][][] = [];
  const tblRe = /<w:tbl[\s>][\s\S]*?<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;
  while ((tblMatch = tblRe.exec(xml)) !== null) {
    const tblXml = tblMatch[0];
    const rows: string[][] = [];
    const trRe = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(tblXml)) !== null) {
      const trXml = trMatch[0];
      const cells: string[] = [];
      const tcRe = /<w:tc>([\s\S]*?)<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRe.exec(trXml)) !== null) {
        const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
        let text = "";
        let tMatch: RegExpExecArray | null;
        const paras = tcMatch[1].split(/<\/w:p>/);
        const paraTexts: string[] = [];
        for (const p of paras) {
          let pt = "";
          while ((tMatch = tRe.exec(p)) !== null) {
            pt += tMatch[1];
          }
          if (pt.trim()) paraTexts.push(pt.trim());
        }
        text = paraTexts.join("\n");
        cells.push(text);
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

// ---------- 日历事件分类规则（关键词预分类，低置信标 needs_review） ----------
function classifyEvent(name: string, sourceCol: number): { code: string; needsReview: boolean } {
  // sourceCol: 2=国内国际 3=广东广州 4=其他
  if (sourceCol === 3) return { code: "C07", needsReview: false };
  const rules: Array<{ code: string; kws: string[] }> = [
    { code: "C08", kws: ["广交会", "服贸会", "进博会", "航展", "展会", "博览会", "亚运会", "奥运会", "世界杯", "锦标赛", "赛事", "开幕", "峰会", "论坛"] },
    { code: "C03", kws: ["习近平", "总书记", "重要讲话", "考察广州", "考察广东", "训词", "授旗"] },
    { code: "C02", kws: ["建党", "长征", "三中全会", "回归", "抗美援朝", "新中国成立", "革命", "起义", "会师", "宪法", "辛亥革命", "五四运动", "抗战", "烈士", "南京大屠杀", "告台湾同胞书"] },
    { code: "C05", kws: ["大湾区", "南沙", "横琴", "前海", "自贸区", "自贸港", "一带一路", "京津冀", "长三角", "区域协调", "海南"] },
    { code: "C04", kws: ["两会", "全会", "人大", "政协", "会议", "条例", "法》", "法律", "政策", "规划", "纲要", "一号文件", "普查", "选举", "论坛"] },
    { code: "C01", kws: ["元旦", "春节", "清明", "劳动节", "国庆", "中秋", "端午", "元宵", "重阳", "纪念日", "节日", "教师节", "儿童节", "青年节", "妇女节", "建党节", "建军节", "国家安全教育日", "宪法日", "雷锋日", "植树节", "读书日", "航天日", "生态日"] },
    { code: "C06", kws: ["生态", "环境", "科技", "教育", "医疗", "卫生", "健康", "农业", "农民", "网络安全", "文化", "体育", "国防", "航天", "太空", "月球", "火星", "探测器", "卫星", "高铁", "经济普查", "流感", "挂号", "营商环境", "消费者权益", "气象", "海洋"] },
  ];
  for (const r of rules) {
    if (r.kws.some((k) => name.includes(k))) return { code: r.code, needsReview: false };
  }
  return { code: "C06", needsReview: true };
}

// 周年基准年提取
function extractAnniversary(name: string, eventYear: number): { baseYear: number | null } {
  // "X周年" → baseYear = eventYear - X
  const m = name.match(/(\d{1,3})\s*周年/);
  if (m) {
    const n = parseInt(m[1], 10);
    return { baseYear: eventYear - n };
  }
  // 名称内含 19xx/20xx 年份
  const ym = name.match(/(19\d{2}|20\d{2})\s*年/);
  if (ym && /周年|纪念|诞辰|逝世|发表|提出|成立|回归|开幕|着陆|开业|讲话|考察/.test(name)) {
    return { baseYear: parseInt(ym[1], 10) };
  }
  return { baseYear: null };
}

function md5(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

async function importMedia(client: ReturnType<typeof getSupabaseClient>) {
  const wb = XLSX.readFile("assets/媒体列表.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const levelMap: Record<string, string> = { 央媒: "central", 省媒: "provincial", 地市级: "city" };
  let mediaCount = 0;
  let sourceCount = 0;

  for (const r of rows) {
    const level = levelMap[String(r["层级"])] || "city";
    const region = String(r["所属地区"] || "").trim();
    const name = String(r["媒体名称"] || "").trim();
    const website = String(r["官网"] || "").trim();
    const epaperRaw = String(r["电子报/数字版"] || "").trim();
    const notes = String(r["备注"] || "").trim();
    if (!name) continue;

    const { data: mediaRow, error: mErr } = await client
      .from("media")
      .upsert(
        {
          media_name: name,
          media_level: level,
          region,
          notes: notes || null,
          enabled: true,
          // 新闻线索的媒体池就是整份清单，导入即纳入线索监控（可在后台单独关闭）
          monitor_clue: true,
        },
        { onConflict: "media_name" },
      )
      .select("id")
      .single();
    if (mErr || !mediaRow) throw new Error(`媒体写入失败 ${name}: ${mErr?.message}`);
    mediaCount++;

    // 官网源
    if (/^https?:\/\//.test(website)) {
      const { error } = await client.from("media_source").upsert(
        { media_id: mediaRow.id, source_type: "website", source_url: website, crawl_method: "html", crawl_status: "untested" },
        { onConflict: "id" }
      );
      if (error) throw new Error(`官网源写入失败 ${name}: ${error.message}`);
      sourceCount++;
    }
    // 电子报源：是 URL 才存；文字描述（客户端/同源/数字报名）只记状态待 PoC
    if (epaperRaw && /^https?:\/\//.test(epaperRaw)) {
      const { error } = await client.from("media_source").upsert(
        { media_id: mediaRow.id, source_type: "epaper", source_url: epaperRaw, crawl_method: "epaper", crawl_status: "untested" },
        { onConflict: "id" }
      );
      if (error) throw new Error(`电子报源写入失败 ${name}: ${error.message}`);
      sourceCount++;
    } else if (epaperRaw) {
      // 占位源，URL 待 PoC 补全
      const { data: exist } = await client.from("media_source").select("id").eq("media_id", mediaRow.id).eq("source_type", "epaper").maybeSingle();
      if (!exist) {
        const { error } = await client.from("media_source").insert({
          media_id: mediaRow.id, source_type: "epaper", source_url: null, crawl_method: "manual",
          crawl_status: "untested",
        });
        if (error) throw new Error(`电子报占位写入失败 ${name}: ${error.message}`);
        sourceCount++;
      }
    }
  }

  // 补录 PRD 评报必需但 xlsx 缺失的 3 家
  const extra = [
    { media_name: "南方都市报", media_level: "provincial", region: "广东", website: "https://www.oeeee.com", epaper: "" },
    { media_name: "新快报", media_level: "city", region: "广东·广州", website: "https://www.xkb.com.cn", epaper: "" },
    { media_name: "信息时报", media_level: "city", region: "广东·广州", website: "https://www.infotimes.com.cn", epaper: "" },
  ];
  for (const e of extra) {
    const { data: mediaRow, error: mErr } = await client
      .from("media")
      .upsert({ media_name: e.media_name, media_level: e.media_level, region: e.region, enabled: true }, { onConflict: "media_name" })
      .select("id")
      .single();
    if (mErr || !mediaRow) throw new Error(`补录媒体失败 ${e.media_name}: ${mErr?.message}`);
    mediaCount++;
    if (e.website) {
      const { data: exist } = await client.from("media_source").select("id").eq("media_id", mediaRow.id).eq("source_type", "website").maybeSingle();
      if (!exist) {
        await client.from("media_source").insert({ media_id: mediaRow.id, source_type: "website", source_url: e.website, crawl_method: "html", crawl_status: "untested" });
        sourceCount++;
      }
    }
  }

  console.log(`✓ 媒体 ${mediaCount} 条，数据源 ${sourceCount} 条`);

  // 标记评报 6 家
  const reviewNames = ["广州日报报业集团", "南方日报", "南方都市报", "新快报", "羊城晚报", "信息时报"];
  const { error: rErr } = await client.from("media").update({ monitor_review: true }).in("media_name", reviewNames);
  if (rErr) throw new Error(`评报标记失败: ${rErr.message}`);
  console.log("✓ 评报媒体标记:", reviewNames.join("、"));
}

async function importCalendar(client: ReturnType<typeof getSupabaseClient>) {
  const fs = require("fs");
  const file = fs.readdirSync("assets").find((f: string) => f.includes("新闻日历") && f.endsWith(".docx"));
  if (!file) throw new Error("未找到新闻日历 docx");
  const buffer = fs.readFileSync(`assets/${file}`) as Buffer;
  const tables = parseDocxTables(buffer);

  const { data: cats } = await client.from("calendar_category").select("id, code");
  const catMap = new Map((cats || []).map((c: { id: string; code: string }) => [c.code, c.id]));

  const events: Array<Record<string, unknown>> = [];
  let eventCount = 0;

  tables.forEach((rows, tableIdx) => {
    // 每月表：第0行是 [year, 月]，第1行表头，第2行起是日期
    let year = 2024;
    rows.slice(0, 1).forEach((r) => {
      const ym = r.join(" ").match(/(20\d{2})/);
      if (ym) year = parseInt(ym[1], 10);
    });
    const dataRows = rows.slice(2);
    for (const row of dataRows) {
      if (row.length < 5) continue;
      const dateCell = row[0] || "";
      const dm = dateCell.match(/(\d{1,2})\.(\d{1,2})/);
      if (!dm) continue;
      const month = parseInt(dm[1], 10);
      const day = parseInt(dm[2], 10);
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      for (let col = 2; col <= 4; col++) {
        const cell = row[col] || "";
        if (!cell.trim()) continue;
        // 按 · 或换行拆分条目
        const items = cell
          .split(/[\n]|·/)
          .map((s) => s.replace(/^[·\s]+|[\s]+$/g, "").trim())
          .filter((s) => s.length >= 2);
        for (const rawName of items) {
          const name = rawName.replace(/[（(]注[：:][\s\S]*$/, "").trim();
          if (!name || name.length < 3) continue;
          const isPending = /待确认|待定/.test(name);
          const cleanName = name.replace(/[（(]待确认[)）]|，?待确认/g, "").trim();
          const { baseYear } = extractAnniversary(cleanName, year);
          const isFixed = baseYear !== null;
          const { code, needsReview } = classifyEvent(cleanName, col);
          const region = col === 3 ? "guangdong" : col === 4 ? "other" : "national";

          events.push({
            event_name: cleanName.replace(/[第]?\d{1,4}\s*周年/g, "").slice(0, 255) || cleanName.slice(0, 255),
            event_type: isFixed ? "fixed" : "dynamic",
            original_date: isFixed && baseYear ? `${baseYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null,
            event_date: dateStr,
            event_year: baseYear,
            anniversary_base_year: null,
            category_id: catMap.get(code) || null,
            region,
            importance: "B",
            source_name: "2024年新闻日历",
            source_authority: "manual",
            review_status: isFixed
              ? "approved"
              : isPending
                ? "pending"
                : "rejected",
            enabled: isFixed ? true : false,
            needs_review: isPending || (needsReview && isFixed),
            tags: isPending ? ["待确认"] : [],
            dedup_key: md5(`${cleanName}|${dateStr}`),
          });
          eventCount++;
        }
      }
    }
    void tableIdx;
  });

  // 去重（同名同日）
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    const k = e.dedup_key as string;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 分批插入（先查已存在，跳过）
  let inserted = 0;
  const batchSize = 100;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize).map(({ dedup_key, ...rest }) => rest);
    const { error } = await client.from("calendar_event").insert(batch);
    if (error) {
      // 若整批因重复失败，逐条尝试
      for (const ev of batch) {
        const { data: exist } = await client
          .from("calendar_event")
          .select("id")
          .eq("event_name", ev.event_name as string)
          .eq("event_date", ev.event_date as string)
          .maybeSingle();
        if (!exist) {
          const { error: e2 } = await client.from("calendar_event").insert(ev);
          if (!e2) inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }
  console.log(`✓ 日历事件解析 ${eventCount} 条，去重后 ${unique.length} 条，入库 ${inserted} 条`);
}

async function main() {
  const client = getSupabaseClient();
  await importMedia(client);
  await importCalendar(client);
  console.log("初始化数据导入完成");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
