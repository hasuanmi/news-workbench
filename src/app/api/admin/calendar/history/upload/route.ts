import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/require-admin";
import { supabase } from "@/lib/db";

/** POST /api/admin/calendar/history/upload — 上传历史日历原始文件（不解析、不入库节点） */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const yearRaw = form.get("year");
  if (!file) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!["docx", "xlsx", "xls", "csv"].includes(ext)) {
    return NextResponse.json({ error: "只支持 docx / xlsx / csv" }, { status: 400 });
  }

  const year = Number(yearRaw) || new Date().getFullYear();

  // 原始文件永久保留，换解析规则可重跑
  const dir = path.join(process.cwd(), "assets", "history");
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${Date.now()}-${file.name.replace(/[\\/]/g, "_")}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, storedName), buffer);

  const { data, error } = await supabase()
    .from("calendar_history_file")
    .insert({
      file_name: file.name,
      file_type: ext === "xls" ? "xlsx" : ext,
      file_size: buffer.length,
      storage_path: `assets/history/${storedName}`,
      year,
      parse_status: "uploaded",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: `文件记录写入失败: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    fileId: data.id,
    year,
    fileName: file.name,
    fileType: ext === "xls" ? "xlsx" : ext,
    size: buffer.length,
  });
}
