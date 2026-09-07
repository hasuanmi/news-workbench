/**
 * POST /api/admin/sources/[id]/test
 * 手动触发测试抓取
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { WebsiteCrawler } from "@/lib/crawler/website";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  // 查询数据源
  const { data: source, error: sourceError } = await supabase()
    .schema("public")
    .from("media_source")
    .select("*")
    .eq("id", id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: "数据源不存在" }, { status: 404 });
  }

  if (!source.source_url) {
    return Response.json({ error: "数据源 URL 未配置" }, { status: 400 });
  }

  // 创建对应抓取器
  let crawler;
  if (source.source_type === "website") {
    crawler = new WebsiteCrawler(source.id, source.source_url);
  } else {
    return Response.json({ error: "暂不支持 epaper 类型" }, { status: 400 });
  }

  // 执行抓取
  const result = await crawler.crawl();

  // 更新健康状态
  const now = new Date().toISOString();
  let newFailureCount = source.failure_count || 0;
  let newStatus = source.crawl_status || "untested";
  let newErrorMessage = source.error_message || null;

  if (result.success) {
    newFailureCount = 0;
    newStatus = "ok";
    newErrorMessage = null;

    // 写入 article 表（去重）
    const inserted: string[] = [];
    const skipped: string[] = [];

    for (const art of result.articles) {
      const contentHash = crawler["hashContent"](art.title + art.url);

      const { error: insertError } = await supabase()
        .schema("public")
        .from("article")
        .upsert(
          {
            media_id: source.media_id,
            source_id: source.id,
            title: art.title,
            url: art.url,
            publish_time: art.publishedAt || now,
            crawl_time: now,
            content_hash: contentHash,
            word_count: art.wordCount,
            content: art.content,
            parse_status: "parsed",
            is_key_report: false,
          },
          { onConflict: "content_hash", ignoreDuplicates: true }
        );

      if (insertError) {
        skipped.push(art.title);
      } else {
        inserted.push(art.title);
      }
    }

    return Response.json({
      success: true,
      status: newStatus,
      articlesFound: result.articles.length,
      articlesInserted: inserted.length,
      articlesSkipped: skipped.length,
      sampleTitles: inserted.slice(0, 5),
    });
  } else {
    newFailureCount += 1;
    newStatus = newFailureCount >= 3 ? "error" : "warning";
    newErrorMessage = result.error || "Unknown error";

    // 更新失败状态
    await supabase()
      .schema("public")
      .from("media_source")
      .update({
        crawl_status: newStatus,
        failure_count: newFailureCount,
        error_message: newErrorMessage,
      })
      .eq("id", id);

    return Response.json({
      success: false,
      status: newStatus,
      error: result.error,
      failureCount: newFailureCount,
    });
  }

  // 更新成功状态
  await supabase()
    .schema("public")
    .from("media_source")
    .update({
      crawl_status: newStatus,
      failure_count: newFailureCount,
      error_message: null,
    })
    .eq("id", id);
}
