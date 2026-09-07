/**
 * 【沙箱 PoC，主流程不依赖】
 * 抓取适配器基类 —— M2 阶段用于在沙箱内直连媒体站点做可行性验证。
 * 已确认沙箱出口网络无法稳定访问外部媒体（反爬/超时），正式抓取已解耦为
 * 独立部署的外部抓取服务，通过 /api/ingest/queue 拉队列、
 * /api/ingest/articles 回推文章。主系统入库链路见 src/lib/ingest.ts。
 * 本目录代码仅保留用于后台「沙箱直连测试」按钮，不参与每日工作流。
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
