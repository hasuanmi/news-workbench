/**
 * 抓取适配器基类
 * 所有媒体抓取器继承此类，实现 crawl() 方法
 */

export interface CrawlResult {
  success: boolean;
  articles: Array<{
    title: string;
    url: string;
    publishedAt?: string;
    content?: string;
    wordCount?: number;
  }>;
  error?: string;
}

export interface CrawlHealth {
  status: "ok" | "warning" | "error";
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastError?: string;
}

export abstract class BaseCrawler {
  protected sourceId: string;
  protected sourceUrl: string;
  protected sourceType: "website" | "epaper";

  constructor(sourceId: string, sourceUrl: string, sourceType: "website" | "epaper") {
    this.sourceId = sourceId;
    this.sourceUrl = sourceUrl;
    this.sourceType = sourceType;
  }

  /**
   * 子类实现：执行抓取
   */
  abstract crawl(): Promise<CrawlResult>;

  /**
   * 计算内容哈希（用于去重）
   */
  protected hashContent(content: string): string {
    // 简单哈希：取前 100 字符的 SHA-256
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(content.slice(0, 100)).digest("hex");
  }

  /**
   * 清理 HTML 标签（简易版）
   */
  protected stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }
}
