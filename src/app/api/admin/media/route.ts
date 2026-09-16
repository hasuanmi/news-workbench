import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const level = sp.get("level");
  const enabled = sp.get("enabled");
  const keyword = sp.get("keyword")?.trim();

  let query = supabase()
    .schema("public")
    .from("media")
    .select("*")
    .order("created_at", { ascending: true });
  if (level) query = query.eq("media_level", level);
  if (enabled === "1") query = query.eq("enabled", true);
  if (enabled === "0") query = query.eq("enabled", false);
  if (keyword) query = query.ilike("media_name", `%${keyword}%`);

  const { data: mediaList, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mediaIds = (mediaList ?? []).map((m) => m.id as string);
  const { data: sources } = await supabase()
    .schema("public")
    .from("media_source")
    .select("id, media_id, source_type, source_url, enabled, crawl_status, last_success_at, last_ingest_at, last_ingest_count, last_error, fail_count")
    .in("media_id", mediaIds.length ? mediaIds : ["__none__"]);

  const sourceMap = new Map<string, typeof sources>();
  for (const s of sources ?? []) {
    const list = sourceMap.get(s.media_id) ?? [];
    list.push(s);
    sourceMap.set(s.media_id, list);
  }

  const items = (mediaList ?? []).map((m) => ({
    ...m,
    level: m.media_level,
    sources: (sourceMap.get(m.id) ?? []).map((s) => ({
      id: s.id,
      source_type: s.source_type,
      source_url: s.source_url,
      enabled: s.enabled,
      crawl_status: s.crawl_status,
      last_crawl_at: s.last_success_at,
      last_ingest_at: s.last_ingest_at,
      last_ingest_count: s.last_ingest_count,
      fail_count: s.fail_count,
      last_error: s.last_error,
    })),
  }));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const mediaName = String(body.media_name ?? "").trim();
  if (!mediaName) return NextResponse.json({ error: "媒体名称必填" }, { status: 400 });

  const { data, error } = await supabase()
    .schema("public")
    .from("media")
    .insert({
      media_name: mediaName,
      media_level: ["central", "provincial", "city"].includes(body.level) ? body.level : "city",
      region: body.region || null,
      notes: body.notes || null,
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
  const allowed = ["media_name", "media_level", "region", "notes", "enabled", "sort_order"] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  const { data, error } = await supabase()
    .schema("public")
    .from("media")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
