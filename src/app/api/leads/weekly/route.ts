import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

/**
 * GET /api/leads/weekly — 获取历史周报列表
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));

  const db = supabase();
  const { data, error } = await db
    .from("weekly_brief")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    briefings: (data ?? []).map((b) => ({
      ...b,
      sections: typeof b.sections === "string" ? safeJsonParse(b.sections, {}) : b.sections,
    })),
  });
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
