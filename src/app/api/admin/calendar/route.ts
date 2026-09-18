import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueEnrich } from "@/lib/calendar-enrich";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status"); // pending / approved / disabled / deleted
  const category = sp.get("category");
  const keyword = sp.get("keyword")?.trim();
  const showDeleted = sp.get("deleted") === "1";

  let query = supabase()
    .schema("public")
    .from("calendar_event")
    .select("*")
    .order("created_at", { ascending: false });

  if (status === "deleted" || showDeleted) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
    if (status === "enabled" || status === "approved") query = query.eq("enabled", true);
    if (status === "disabled") query = query.eq("enabled", false);
  }
  if (category) query = query.eq("category_id", category);
  if (keyword) query = query.ilike("event_name", `%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const categoryIds = Array.from(
    new Set((data ?? []).map((e) => e.category_id).filter((v): v is string => Boolean(v)))
  );
  const { data: categoryRows } = await supabase()
    .schema("public")
    .from("calendar_category")
    .select("id, code, category_name, color")
    .in("id", categoryIds.length ? categoryIds : ["__none__"]);
  const categoryMap = new Map((categoryRows ?? []).map((c) => [c.id, c]));

  const items = (data ?? []).map((e) => ({
    ...e,
    category: e.category_id ? categoryMap.get(e.category_id) ?? null : null,
  }));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const eventName = String(body.event_name ?? "").trim();
  if (!eventName) return NextResponse.json({ error: "节点名称必填" }, { status: 400 });

  const eventType = body.event_type === "fixed" ? "fixed" : "dynamic";
  const baseDate = String(body.original_date ?? body.event_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) {
    return NextResponse.json({ error: "请提供有效日期 (YYYY-MM-DD)" }, { status: 400 });
  }

  const sourceAliases: Record<string, string> = { historical_migration: "history_migrate", ai_supplement: "ai_recommend", manual: "user_add", pasted_text: "user_paste" };
  const sourceType = Object.hasOwn(sourceAliases, body.source_type ?? "") ? body.source_type :
    Object.keys(sourceAliases).find(type => sourceAliases[type] === body.source) ?? "manual";
  const row: Record<string, unknown> = {
    event_name: eventName,
    event_type: eventType,
    category_id: body.category_id || null,
    region: body.region === "local" ? "local" : "national",
    importance: ["S", "A", "B"].includes(body.importance) ? body.importance : "B",
    original_date: eventType === "fixed" ? baseDate : null,
    event_date: eventType === "dynamic" ? baseDate : null,
    anniversary_base_year:
      eventType === "fixed" && body.anniversary_base_year
        ? Number(body.anniversary_base_year)
        : eventType === "fixed"
          ? Number(baseDate.slice(0, 4))
          : null,
    event_year: body.event_year ? Number(body.event_year) : null,
    description: [body.background, body.notes].filter(Boolean).join("\n") || null,
    source_name: `manual:${auth.session.username}`,
    // 来源标签：user_add（前台/后台直接添加）| user_paste（粘贴识别）| ai_recommend | history_migrate
    source: sourceAliases[sourceType],
    source_type: sourceType,
    needs_review: false,
    review_status: "approved",
    enabled: body.enabled !== false,
    created_by: auth.session.sub,
  };

  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .insert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.id) void enqueueEnrich(data.id);
  return NextResponse.json({ item: data });
}
