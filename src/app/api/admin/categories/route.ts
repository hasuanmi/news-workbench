import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const categoryName = String(body.category_name ?? "").trim();
  if (!categoryName) return NextResponse.json({ error: "分类名称必填" }, { status: 400 });

  const { data: maxSort } = await supabase()
    .schema("public")
    .from("calendar_category")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_category")
    .insert({
      code: String(body.code ?? "").trim() || `C${Date.now()}`,
      category_name: categoryName,
      color: body.color || "#6b6257",
      sort_order: (maxSort?.sort_order ?? 0) + 1,
      enabled: body.enabled !== false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const allowed = ["category_name", "color", "sort_order", "enabled", "code"] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_category")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
