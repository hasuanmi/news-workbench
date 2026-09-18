from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.scrapers.base import Article, BaseScraper, clean_text, collect_links, guess_column, guess_content, guess_time


class YcwbScraper(BaseScraper):
    """羊城晚报 — 官网 ycwb.com / 数字报 epaper.ycwb.com。"""
    media = "羊城晚报"
    business = ["daily_review"]
    source_type = "官方网站"
    entry_urls = [
        "http://www.ycwb.com/",
        "http://epaper.ycwb.com/",
    ]

    async def list_articles(self):
        from app.scrapers.base import fetch_list_links

        stubs = []
        for url in self.entry_urls:
            try:
                links, _method = await fetch_list_links(
                    url, min_cn=8, allowed_hosts=["ycwb.com"], media=self.media)
            except Exception as e:
                from app.core.logger import logger
                logger.warning(f"[ycwb] 列表页失败 {url}: {e}")
                continue
            stubs += links
        seen, uniq = set(), []
        for s in stubs:
            if s["url"] not in seen:
                seen.add(s["url"])
                uniq.append(s)
        return uniq

    async def parse_detail(self, url, html):
        soup = BeautifulSoup(html, "lxml")
        art = Article(media=self.media)
        h1 = soup.find("h1") or soup.select_one(".article-title, .title, .art_title, .content-title")
        art.title = clean_text(h1.get_text()) if h1 else clean_text(
            soup.title.get_text() if soup.title else ""
        )
        art.publish_time = guess_time(soup, url)
        art.content = guess_content(soup)
        art.column_name = guess_column(soup)
        for img in soup.select(".article-content img, .content img, article img, .art_content img"):
            src = img.get("src") or img.get("data-src")
            if src:
                art.images.append(
                    {"url": urljoin(url, src), "caption": clean_text(img.get("alt")), "type": "photo"}
                )
        return art

    async def _fetch(self, url):
        from app.core.fetcher import fetch
        return await fetch(url)
