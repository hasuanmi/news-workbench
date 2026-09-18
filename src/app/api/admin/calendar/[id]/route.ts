import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueEnrich } from "@/lib/calendar-enrich";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return softDelete(req, id);
}

// 删除原因中文 → 枚举码（供 AI 推荐参考）
const DELETE_REASON_MAP: Record<string, string> = {
  "不属于重要新闻节点": "not_important",
  "一次性事件": "one_off",
  "重要性不足": "weak",
  "与广东/广州关联度低": "weak_local",
  "信息不准确": "inaccurate",
  "重复节点": "duplicate",
  "已失效": "expired",
  "其他": "other",
};

/**
 * 软删除：必须选择删除原因；原节点信息/来源/删除时间保留，供后续 AI 推荐参考。
 * 同时支持 DELETE 方法与 PATCH + delete_reason 两种入口。
 */
async function softDelete(req: NextRequest, id: string, parsedBody?: Record<string, unknown>) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const body = parsedBody ?? await req.json().catch(() => ({}));
  const rawReason = String(body.delete_reason ?? "").trim();
  const deleteReason = DELETE_REASON_MAP[rawReason] ??
    (Object.values(DELETE_REASON_MAP).includes(rawReason) ? rawReason : null);
  if (!deleteReason) return NextResponse.json({ error: "请选择有效删除原因" }, { status: 400 });

  const { error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .update({
      deleted_at: new Date().toISOString(),
      delete_reason: deleteReason,
      deleted_by: auth.session.sub,
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 记录 AI 审核日志供后续推荐参考
  await supabase()
    .schema("public")
    .from("ai_audit_log")
    .insert({
      module: "calendar",
      ref_id: id,
      human_decision: "deleted",
      input_summary: `删除原因: ${deleteReason}`,
      decided_by: auth.session.sub,
    })
    .then((r) => {
      if (r.error) {
        // 不阻断主流程
      }
    });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = await req.json();

  // 软删除入口：PATCH + delete_reason
  if ("delete_reason" in body) {
    return softDelete(req, id, body);
  }

  const allowed = [
    "event_name",
    "category_id",
    "region",
    "importance",
    "description",
    "enabled",
    "needs_review",
    "review_status",
    "original_date",
    "event_date",
    "anniversary_base_year",
    "source",
    "source_type",
    "event_year",
    "event_month",
    "date_status",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k] === "" ? null : body[k];
  }
  if ("background" in body) update.description = String(body.background ?? "").trim() || null;
  update.updated_at = new Date().toISOString();
  if ("source_type" in body || "source" in body) {
    const sourceAliases: Record<string, string> = { historical_migration: "history_migrate", ai_supplement: "ai_recommend", manual: "user_add", pasted_text: "user_paste" };
    const type = "source_type" in body ? body.source_type : Object.keys(sourceAliases).find(key => sourceAliases[key] === body.source);
    if (!Object.hasOwn(sourceAliases, type ?? "")) return NextResponse.json({ error: "无效来源标签" }, { status: 400 });
    update.source_type = type;
    update.source = sourceAliases[type];
  }
  if (body.event_type === "fixed" && body.original_date) {
    update.event_type = "fixed";
    update.original_date = body.original_date;
    update.event_date = null;
  }
  if (body.event_type === "dynamic" && body.event_date) {
    update.event_type = "dynamic";
    update.event_date = body.event_date;
    update.original_date = null;
  }

  const { data, error } = await supabase()
    .schema("public")
    .from("calendar_event")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 关键字段（名称/日期/地区/分类/周年基数）变化时，自动重新触发信息补全
  const HAS_KEY_CHANGE =
    "event_name" in update ||
    "original_date" in update ||
    "event_date" in update ||
    "region" in update ||
    "category_id" in update ||
    "anniversary_base_year" in update ||
    "event_year" in update ||
    "event_month" in update ||
    "date_status" in update;
  if (HAS_KEY_CHANGE && data?.id && data.enabled === true) void enqueueEnrich(data.id, { force: true });

  return NextResponse.json({ item: data });
}
