/**
 * Website 抓取适配器
 * 抓取媒体官网文章列表页
 */

import { BaseCrawler, CrawlResult } from "./base";

export class WebsiteCrawler extends BaseCrawler {
  constructor(sourceId: string, sourceUrl: string) {
    super(sourceId, sourceUrl, "website");
  }

  async crawl(): Promise<CrawlResult> {
    try {
      // 使用 fetch 抓取页面
      const response = await fetch(this.sourceUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsWorkbench/1.0)",
        },
        signal: AbortSignal.timeout(15000), // 15 秒超时
      });

      if (!response.ok) {
        return {
          success: false,
          articles: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const html = await response.text();

      // 简易解析：提取 <a> 标签（实际需要根据媒体定制）
      const articles = this.parseArticles(html);

      return {
        success: true,
        articles,
      };
    } catch (err: any) {
      return {
        success: false,
        articles: [],
        error: err.message || "Unknown error",
      };
    }
  }

  /**
   * 解析文章列表（简易版，实际需要根据媒体定制）
   */
  private parseArticles(html: string): CrawlResult["articles"] {
    const articles: CrawlResult["articles"] = [];

    // 简易正则提取 <a href="...">标题</a>
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].trim();

      // 过滤：只要绝对 URL、标题长度合理
      if (url.startsWith("http") && title.length > 5 && title.length < 200) {
        articles.push({
          title,
          url,
        });
      }
    }

    return articles.slice(0, 50); // 最多 50 篇
  }
}
