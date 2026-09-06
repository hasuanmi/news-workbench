import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .select("*, category:calendar_category(code, category_name, color)")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "节点不存在" }, { status: 404 });
  return NextResponse.json({ item: data });
}
