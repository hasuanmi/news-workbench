import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";
import { aiFillNodes, extractRows } from "@/lib/calendar-history";

/**
 * POST /api/admin/calendar/history/parse
 * 解析已上传文件 + AI 补字段，返回结构化预览（不入库）
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const fileId = String(body.fileId || "");
  if (!fileId) {
    return NextResponse.json({ error: "缺少 fileId" }, { status: 400 });
  }

  const db = supabase();
  const { data: file, error: fErr } = await db
    .from("calendar_history_file")
    .select("id, file_name, file_type, storage_path, year")
    .eq("id", fileId)
    .single();
  if (fErr || !file) {
    return NextResponse.json({ error: "文件记录不存在" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(path.join(process.cwd(), file.storage_path));
  } catch {
    return NextResponse.json({ error: "原始文件已丢失，请重新上传" }, { status: 410 });
  }

  const rows = extractRows(buffer, file.file_type);
  if (rows.length === 0) {
    return NextResponse.json({ error: "未能从文件中解析出任何内容" }, { status: 422 });
  }

  const { data: cats } = await db.from("calendar_category").select("code, category_name");
  const categories = (cats ?? []) as Array<{ code: string; category_name: string }>;

  const nodes = await aiFillNodes(rows, file.year, categories);

  await db.from("calendar_history_file").update({ parse_status: "parsed" }).eq("id", fileId);

  return NextResponse.json({
    success: true,
    fileId,
    year: file.year,
    fileName: file.file_name,
    rawRowCount: rows.length,
    categories,
    nodes,
  });
}
