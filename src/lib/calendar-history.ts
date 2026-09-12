/**
 * 历史日历：上传 → 解析 → AI 补字段 → 结构化预览 → 确认入库
 *
 * 设计约束：
 * - 原始文件永久保留（换解析规则可重跑）
 * - 年份动态配置，不写死
 * - 上传后必须经用户预览确认才入库
 */
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/db";
import { unifiedInvoke } from "@/lib/llm-client";

export type DateStatus = "confirmed" | "month_known" | "unknown";

export interface RawRow {
  cells: string[];
  raw: string;
}

export interface ParsedHistoryNode {
  node_name: string;
  event_date: string | null; // YYYY-MM-DD
  candidate_month: number | null; // 1-12，仅 month_known 时有值
  date_status: DateStatus;
  category_code: string | null;
  region: string;
  importance: string; // S | A | B
  description: string | null;
  raw_text: string;
}

// ---------------------------------------------------------------- 文件解析

function docxRows(buffer: Buffer): RawRow[] {
  const zip = new AdmZip(buffer);
  const xml = zip.readAsText("word/document.xml");
  const out: RawRow[] = [];
  const tblRe = /<w:tbl[\s>][\s\S]*?<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;
  while ((tblMatch = tblRe.exec(xml)) !== null) {
    const trRe = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(tblMatch[0])) !== null) {
      const cells: string[] = [];
      const tcRe = /<w:tc>([\s\S]*?)<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRe.exec(trMatch[0])) !== null) {
        const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
        const paras = tcMatch[1].split(/<\/w:p>/);
        const paraTexts: string[] = [];
        for (const p of paras) {
          let pt = "";
          let tMatch: RegExpExecArray | null;
          while ((tMatch = tRe.exec(p)) !== null) pt += tMatch[1];
          if (pt.trim()) paraTexts.push(pt.trim());
        }
        cells.push(paraTexts.join("\n"));
      }
      if (cells.length) {
        out.push({ cells, raw: cells.join(" | ") });
      }
    }
  }
  return out;
}

function xlsxRows(buffer: Buffer): RawRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const out: RawRow[] = [];
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], {
      defval: "",
      header: 1,
      blankrows: false,
    }) as unknown as unknown[][];
    for (const r of rows) {
      const cells = (r ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
      if (cells.length) out.push({ cells, raw: cells.join(" | ") });
    }
  }
  return out;
}

function csvRows(buffer: Buffer): RawRow[] {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const out: RawRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line
      .split(/[,\t]/)
      .map((c) => c.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    if (cells.length) out.push({ cells, raw: line.trim() });
  }
  return out;
}

/** 解析上传文件为原始行（不做 AI 识别） */
export function extractRows(buffer: Buffer, fileType: string): RawRow[] {
  const ft = fileType.toLowerCase();
  if (ft.includes("docx") || ft.includes("word")) return docxRows(buffer);
  if (ft.includes("xlsx") || ft.includes("xls")) return xlsxRows(buffer);
  return csvRows(buffer);
}

// ---------------------------------------------------------------- AI 补字段

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new Error("AI 未返回可解析的 JSON");
  const arrStart = cleaned.indexOf("[", start);
  const objStart = cleaned.indexOf("{", start);
  let s: number;
  let e: number;
  if (arrStart >= 0 && (objStart < 0 || arrStart < objStart)) {
    s = arrStart;
    e = cleaned.lastIndexOf("]");
  } else {
    s = objStart;
    e = cleaned.lastIndexOf("}");
  }
  if (e <= s) throw new Error("AI 返回的 JSON 不完整");
  return JSON.parse(cleaned.slice(s, e + 1));
}

const SYSTEM_PROMPT = `你是新闻日历结构化助手。把用户给出的历史新闻日历原始行，识别成结构化节点。

规则：
1. date_status 三选一：
   - confirmed：能确定具体日期（输出 event_date，格式 YYYY-MM-DD）
   - month_known：只知道月份（输出 candidate_month 数字 1-12，event_date 留空）
   - unknown：连月份都不确定（两者都留空）
2. 绝不把"时间待定"的节点虚拟设置为某月 1 日。
3. region 只能是：national（全国）/ guangdong（广东）/ guangzhou（广州）/ other
4. importance 只能是：S（国家级重大）/ A（重要）/ B（一般）
5. category_code 从给定分类里选一个最贴合的 code；无法确定就返回 null。
6. 只输出 JSON，不要任何解释文字。

输出格式（数组）：
[{"node_name":"","event_date":"2025-04-15 或 null","candidate_month":4 或 null,"date_status":"confirmed","category_code":"","region":"national","importance":"A","description":""}]`;

/** AI 把原始行补成结构化节点（分批，避免单次过长） */
export async function aiFillNodes(
  rows: RawRow[],
  year: number,
  categories: Array<{ code: string; category_name: string }>,
): Promise<ParsedHistoryNode[]> {
  const BATCH = 30;
  const result: ParsedHistoryNode[] = [];
  const catHint = categories.length
    ? `可选分类 code：${categories.map((c) => `${c.code}=${c.category_name}`).join("、")}`
    : "没有预设分类，category_code 返回 null";

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const numbered = batch.map((r, idx) => `${i + idx + 1}. ${r.raw}`).join("\n");
    const user = `这是 ${year} 年的新闻日历原始内容：\n\n${numbered}\n\n${catHint}\n\n请识别成 JSON 数组。`;

    let parsed: unknown;
    try {
      const content = await unifiedInvoke(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        { temperature: 0.2 },
      );
      parsed = extractJson(content);
    } catch (err) {
      console.error("[calendar-history] AI 识别失败，该批回退为纯文本:", err);
      // 回退：至少保留原始文本，交给人工在预览页补
      for (const r of batch) {
        result.push({
          node_name: r.cells[0]?.slice(0, 255) || r.raw.slice(0, 255),
          event_date: null,
          candidate_month: null,
          date_status: "unknown",
          category_code: null,
          region: "national",
          importance: "B",
          description: null,
          raw_text: r.raw,
        });
      }
      continue;
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      const o = (item ?? {}) as Record<string, unknown>;
      const name = String(o.node_name ?? "").trim();
      if (!name) continue;
      const statusRaw = String(o.date_status ?? "unknown");
      const date_status: DateStatus =
        statusRaw === "confirmed" || statusRaw === "month_known" ? statusRaw : "unknown";
      let month: number | null = null;
      if (o.candidate_month !== null && o.candidate_month !== undefined && o.candidate_month !== "") {
        const m = Number(o.candidate_month);
        if (m >= 1 && m <= 12) month = m;
      }
      const regionRaw = String(o.region ?? "national");
      const importanceRaw = String(o.importance ?? "B").toUpperCase();
      result.push({
        node_name: name.slice(0, 255),
        event_date: date_status === "confirmed" && o.event_date ? String(o.event_date) : null,
        candidate_month: date_status === "month_known" ? month : null,
        date_status,
        category_code: o.category_code ? String(o.category_code) : null,
        region: ["national", "guangdong", "guangzhou", "other"].includes(regionRaw)
          ? regionRaw
          : "national",
        importance: ["S", "A", "B"].includes(importanceRaw) ? importanceRaw : "B",
        description: o.description ? String(o.description) : null,
        raw_text: String(o.raw_text ?? ""),
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------- 落库

/** 保存历史节点（用户确认后调用） */
export async function saveHistoryNodes(params: {
  fileId: string;
  year: number;
  nodes: ParsedHistoryNode[];
}) {
  const { fileId, year, nodes } = params;
  const db = supabase();

  const { data: cats } = await db.from("calendar_category").select("id, code");
  const catMap = new Map((cats ?? []).map((c: { id: string; code: string }) => [c.code, c.id]));

  const rows = nodes.map((n) => ({
    file_id: fileId,
    year,
    node_name: n.node_name,
    event_date: n.event_date,
    candidate_month: n.candidate_month,
    date_status: n.date_status,
    category_id: n.category_code ? catMap.get(n.category_code) ?? null : null,
    region: n.region,
    importance: n.importance,
    description: n.description,
    raw_text: n.raw_text,
    enabled: true,
  }));

  if (rows.length === 0) return { inserted: 0 };

  const { error } = await db.from("calendar_history_node").insert(rows);
  if (error) throw new Error(`历史节点写入失败: ${error.message}`);

  await db
    .from("calendar_history_file")
    .update({ parse_status: "confirmed", node_count: rows.length })
    .eq("id", fileId);

  return { inserted: rows.length };
}
