"""常驻 worker：拉取主项目队列 -> 按域名派发抓取器 -> 抓取 -> 回推文章。

派发逻辑：
- 命中专属 scraper（每日评报 6 家等）走高质量定制解析；
- 其余走通用解析兜底；
- crawlMethod=epaper 但本服务未启用 playwright 时，标记跳过（生产 Docker 启用后可抓）；
- crawlMethod=manual（无 URL）直接跳过。
"""
import asyncio
import re
from urllib.parse import urlparse

from app.core import settings
from app.core.logger import logger
from app.core.ingest_client import IngestClient
from app.scrapers.base import (
    Article,
    BaseScraper,
    MISSING_TIME,
    clean_text,
    collect_links,
    guess_column,
    guess_content,
    guess_time,
)
from app.scrapers.registry import get_scrapers


# ---------- 域名 -> 专属 scraper 实例 映射 ----------
def _build_custom_map():
    m = {}
    for _cfg, inst in get_scrapers():
        for eu in inst.entry_urls:
            host = urlparse(eu).netloc.lower()
            bare = host[4:] if host.startswith("www.") else host
            m[host] = inst
            m[bare] = inst
    return m


CUSTOM_MAP = _build_custom_map()


class GenericScraper(BaseScraper):
    """通用解析兜底：用主项目给的 sourceUrl 抓列表+详情。"""

    def __init__(self, source_url: str, source_type: str = "website"):
        self.media = urlparse(source_url).netloc
        self.source_type = source_type
        self.entry_urls = [source_url]
        self.list_method = None

    async def list_articles(self):
        from app.scrapers.base import fetch_list_links

        url = self.entry_urls[0]
        host = urlparse(url).netloc.lower()
        try:
            links, method = await fetch_list_links(
                url, min_cn=6, allowed_hosts=[host], media=self.media)
            self.list_method = method
        except Exception as e:
            from app.core.logger import logger

            logger.warning(f"[worker] 列表页失败 {url}: {e}")
            links = []
        return links

    async def parse_detail(self, url, html):
        soup = self._soup(html)
        art = Article(media=self.media)
        h1 = soup.find("h1") or soup.title
        title = clean_text(h1.get_text()) if h1 else ""
        # h1 常是栏目名（如「要闻动态」），而 <title> 首段常是真实标题：取更长者
        page_title = clean_text(soup.title.get_text()) if soup.title else ""
        if page_title:
            head = re.split(r"\s*[-_|]\s*", page_title)[0].strip()
            if len(head) > len(title):
                title = head
        art.title = title
        art.publish_time = guess_time(soup, url)
        art.content = guess_content(soup)
        art.column_name = guess_column(soup)
        return art


def article_to_ingest(art: Article, source_id: str, crawl_method: str, source_type: str) -> dict:
    """把内部 Article 映射成主项目 IngestArticle（camelCase 丰富字段）。"""
    return {
        "sourceId": source_id,
        "title": art.title or art.url,
        "url": art.url,
        "publishedAt": art.publish_time if art.publish_time != MISSING_TIME else None,
        "content": art.content,
        "wordCount": art.word_count,
        # ===== 丰富元数据 =====
        "columnName": art.column_name,
        "editionNo": art.edition_no,
        "editionName": art.edition_name,
        "isFrontPage": art.is_front_page,
        "isFullPage": art.is_full_page,
        "isCrossPage": art.is_cross_page,
        "seriesName": art.series_name,
        "specialName": art.special_name,
        "specialUrl": art.special_url,
        "images": art.images or None,
        "sourceType": art.source_type or source_type,
        "scrapeMethod": art.scrape_method or crawl_method,
        "firstSeenAt": art.first_seen_at,
        "business": art.business or None,
    }


def _select_scraper(source_url: str):
    host = urlparse(source_url).netloc.lower()
    bare = host[4:] if host.startswith("www.") else host
    return CUSTOM_MAP.get(bare) or CUSTOM_MAP.get(host)


def _filter_stubs(stubs: list) -> list:
    """过滤候选链接，剔除明显不是文章的项：
    - 带 # 锚点的（栏目导航锚点，如 /cbjz/#newspapers，抓下来是同一页的重复标题）
    - 非 http(s) 的（javascript:、mailto: 等）
    - 重复 URL（归一化 host/path/query 后判重）
    - 空 URL
    """
    seen = set()
    out = []
    for st in stubs:
        url = ((st.get("url") if isinstance(st, dict) else None) or "").strip()
        if not url:
            continue
        p = urlparse(url)
        if p.fragment:
            continue
        if p.scheme not in ("http", "https"):
            continue
        host = p.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        key = (host, p.path.rstrip("/"), p.query)
        if key in seen:
            continue
        seen.add(key)
        out.append(st)
    return out


async def dispatch_source(source: dict) -> dict:
    source_id = source.get("sourceId")
    source_url = (source.get("sourceUrl") or "").strip()
    crawl_method = (source.get("crawlMethod") or "html").lower()
    source_type = source.get("sourceType") or "website"

    if not source_url or crawl_method == "manual":
        return {"sourceId": source_id, "success": False,
                "error": "无可用抓取地址(manual/空)", "articles": []}
    if crawl_method == "epaper" and not settings.get_settings().playwright_fallback:
        return {"sourceId": source_id, "success": False,
                "error": "EPAPER 需 Playwright（当前服务未启用）", "articles": []}

    scraper = _select_scraper(source_url)
    if scraper is None:
        scraper = GenericScraper(source_url, source_type)

    try:
        stubs = await scraper.list_articles()
    except Exception as e:
        return {"sourceId": source_id, "success": False,
                "error": f"列表抓取失败: {str(e)[:150]}", "articles": []}

    stubs = _filter_stubs(stubs)
    if not stubs:
        return {"sourceId": source_id, "success": False,
                "error": "列表未解析到文章链接（已过滤锚点/重复后为空）", "articles": []}

    limit = settings.get_settings().worker_per_source
    stubs = stubs[:limit]
    articles = []
    for st in stubs:
        try:
            art = await scraper.fetch_detail(st["url"])
            if art.content and len(art.content) > 50:
                articles.append(article_to_ingest(art, source_id, crawl_method, source_type))
        except Exception as e:
            logger.warning(f"[worker] 详情失败 {st.get('url')}: {e}")

    logger.info(f"[worker] {source_id} 列表方式={getattr(scraper, 'list_method', None)} 抓得 {len(articles)} 篇（候选 {len(stubs)}）")
    return {"sourceId": source_id, "success": True, "articles": articles}


async def run_once():
    cfg = settings.get_settings()
    if not cfg.ingest_enabled:
        logger.info("[worker] ingest_enabled=false，跳过本轮")
        return
    client = IngestClient()
    queue = await client.get_queue()
    if not queue:
        logger.info("[worker] 队列为空或拉取失败")
        return
    logger.info(f"[worker] 队列 {len(queue)} 个数据源，开始抓取")
    results = await asyncio.gather(*[dispatch_source(s) for s in queue], return_exceptions=True)
    clean = []
    for r in results:
        if isinstance(r, Exception):
            logger.error(f"[worker] dispatch 异常: {r}")
            continue
        clean.append(r)
    if clean:
        # 主项目限制单批数据源数 <= 50，超过会返回 400 batch_too_large
        batch_size = 50
        total = (len(clean) + batch_size - 1) // batch_size
        for i in range(0, len(clean), batch_size):
            chunk = clean[i:i + batch_size]
            resp = await client.push_articles(chunk)
            logger.info(f"[worker] 推送第 {i // batch_size + 1}/{total} 批"
                        f"（{len(chunk)} 个源）: {resp}")


async def run_loop():
    cfg = settings.get_settings()
    logger.info(f"[worker] 常驻轮询启动，间隔 {cfg.poll_interval}s")
    while True:
        try:
            await run_once()
        except Exception as e:
            logger.error(f"[worker] 循环异常: {e}")
        await asyncio.sleep(cfg.poll_interval)
