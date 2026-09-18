"""通用解析兜底 scraper：用 sources.yaml 提供的 entry_urls 抓列表 + 详情。

设计：
- 已在 registry 注册为 `generic`，供未配置专属解析器的媒体复用（按页面结构最小解析）。
- 列表抽取用 base.collect_links（通用启发式：标题长度 + 站内链接过滤）；
- 详情解析用 base.guess_time / guess_content / guess_column（命中文本最长容器 + meta 时间）。
- 正文过短（典型为 JS/SPA 渲染的空壳页）由 BaseScraper.fetch_detail 的 Playwright 兜底处理
  （需抓取服务启用 playwright_fallback）。
"""
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.scrapers.base import (
    Article,
    BaseScraper,
    clean_text,
    collect_links,
    guess_column,
    guess_content,
    guess_time,
)


class GenericScraper(BaseScraper):
    media = ""
    business = ["news_lead"]
    source_type = "官方网站"
    entry_urls = []

    async def list_articles(self):
        from app.scrapers.base import fetch_list_links

        out = []
        for url in self.entry_urls:
            try:
                host = urlparse(url).netloc.lower()
                links, _method = await fetch_list_links(
                    url, min_cn=6, allowed_hosts=[host], media=self.media)
            except Exception as e:
                from app.core.logger import logger

                logger.warning(f"[generic] 列表页失败 {url}: {e}")
                continue
            out += links
        seen, uniq = set(), []
        for s in out:
            if s["url"] not in seen:
                seen.add(s["url"])
                uniq.append(s)
        return uniq

    async def parse_detail(self, url, html):
        soup = BeautifulSoup(html, "lxml")
        art = Article(media=self.media)
        h1 = soup.find("h1") or soup.select_one(
            ".article-title,.title,.art_title,.content-title"
        )
        title = clean_text(h1.get_text()) if h1 else clean_text(
            soup.title.get_text() if soup.title else ""
        )
        # <title> 首段常是真实标题（h1 有时是栏目名），取更长者
        page_title = clean_text(soup.title.get_text()) if soup.title else ""
        if page_title:
            head = re.split(r"\s*[-_|—]\s*", page_title)[0].strip()
            if len(head) > len(title):
                title = head
        art.title = title
        art.publish_time = guess_time(soup, url)
        art.content = guess_content(soup)
        art.column_name = guess_column(soup)
        for img in soup.select(
            "article img,.content img,.art_content img,.news-content img,.article-content img"
        ):
            src = img.get("src") or img.get("data-src")
            if src:
                art.images.append(
                    {
                        "url": urljoin(url, src),
                        "caption": clean_text(img.get("alt")),
                        "type": "photo",
                    }
                )
        return art
