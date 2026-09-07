import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "缺少 key 参数" }, { status: 400 });
  }

  const { data, error } = await supabase()
    .from("app_config")
    .select("key, value, description")
    .eq("key", key)
    .single();

  if (error) {
    return NextResponse.json({ error: "配置不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true, key: data.key, value: data.value, description: data.description });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { key, value, description } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: "缺少 key 或 value" }, { status: 400 });
  }

  const { error } = await supabase()
    .from("app_config")
    .upsert(
      { key, value: typeof value === "string" ? value : JSON.stringify(value), description: description || "" },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
