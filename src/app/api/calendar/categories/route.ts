import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function GET() {
  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_category")
    .select("id, code, category_name, color, sort_order, enabled")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
