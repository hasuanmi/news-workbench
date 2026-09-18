import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime
import asyncio
import json
import os
import time
from typing import List, Optional, Tuple

from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

from app.core.fetcher import fetch
from app.core.logger import logger

MISSING_TIME = "1970-01-01 00:00:00"

# 常见的正文容器候选选择器（命中文本最长者）
_CONTENT_SELECTORS = [
    "article",
    ".article-content", ".articleContent", ".art_content", ".artcontent",
    ".news-content", ".newsContent", ".post-content", ".post_content",
    ".content", "#content", ".content-text", ".content_text", ".content-page",
    ".TRS_Editor", ".body", ".text", ".article", ".detail", ".main-content",
    ".article_detail", ".article-body", ".detail_inner", ".news-text",
    ".text-con", ".artical-content", ".news-text",
]

_TIME_META = [
    ("property", "article:published_time"),
    ("name", "publishdate"),
    ("name", "publishDate"),
    ("name", "PubDate"),
    ("itemprop", "datePublished"),
    ("name", "og:pubdate"),
]


def clean_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def norm_time(raw: Optional[str]) -> str:
    if not raw:
        return MISSING_TIME
    s = raw.strip().replace("年", "-").replace("月", "-").replace("日", " ").replace("/", "-")
    m = re.search(
        r"(\d{4})[-.](\d{1,2})[-.](\d{1,2})\D*(\d{1,2}):(\d{2})(?::(\d{2}))?", s
    )
    if m:
        y, mo, d, h, mi, sec = m.groups()
        sec = sec or "00"
        try:
            return (
                f"{int(y):04d}-{int(mo):02d}-{int(d):02d} "
                f"{int(h):02d}:{int(mi):02d}:{int(sec):02d}"
            )
        except Exception:
            pass
    m2 = re.search(r"(\d{4})[-.](\d{1,2})[-.](\d{1,2})", s)
    if m2:
        y, mo, d = m2.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d} 00:00:00"
    return MISSING_TIME


def guess_time(soup: BeautifulSoup, url: str = "") -> str:
    for attr, val in _TIME_META:
        tag = soup.find("meta", attrs={attr: val})
        if tag and tag.get("content"):
            return norm_time(tag["content"])
    # 页面文本里出现的时间
    text = soup.get_text(" ", strip=True)
    m = re.search(r"(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?\s*\d{1,2}:\d{2})", text)
    if m:
        return norm_time(m.group(1))
    # 数字报等：日期常编码在 URL 路径里（如 /content/2026-09/07/ 或 /node/2026-09/07/）
    if url:
        mu = re.search(r"/(?:content|node|html|news|article)?/?(\d{4})[-_/](\d{1,2})[-_/](\d{1,2})", url)
        if mu:
            y, mo, d = mu.groups()
            return f"{int(y):04d}-{int(mo):02d}-{int(d):02d} 00:00:00"
    return MISSING_TIME


def _looks_like_article(url: str, text: str) -> bool:
    if not re.search(r"[\u4e00-\u9fff]", text):
        return False
    path = urlparse(url).path
    if path in ("", "/"):
        return False
    if re.search(r"/(tag|category|column|channel)/?", path, re.I) and len(text) < 10:
        return False
    return True


def _nearby_time(a) -> Optional[str]:
    node = a
    for _ in range(3):
        if node is None:
            break
        txt = node.get_text(" ", strip=True)
        m = re.search(r"\d{4}[-/年]\d{1,2}[-/月]\d{1,2}", txt)
        if m:
            return m.group(0)
        node = node.parent
    return None


def collect_links(soup: BeautifulSoup, base_url: str, min_cn: int = 6,
                  allowed_hosts: Optional[List[str]] = None) -> List[dict]:
    """从列表页抽取文章存根（通用启发式）。

    allowed_hosts: 若提供，仅保留 netloc 以列表中任一后缀结尾的链接，
                   用于过滤页脚/导航里的站外链接噪音（如政府门户、友站）。
    """
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        text = clean_text(a.get_text())
        if len(text) < min_cn:
            continue
        href = a["href"].strip()
        if href.startswith(("javascript:", "#", "mailto:")):
            continue
        full = urljoin(base_url, href)
        host = urlparse(full).netloc.lower()
        if allowed_hosts and not any(host.endswith(h.lower().lstrip(".")) for h in allowed_hosts):
            continue
        if not _looks_like_article(full, text) or full in seen:
            continue
        seen.add(full)
        t = _nearby_time(a)
        out.append(
            {
                "url": full,
                "title": text,
                "publish_time": norm_time(t) if t else MISSING_TIME,
            }
        )
    return out


# ---------- 列表页 Playwright 兜底（HTTP 优先，仅当实抽链接不足时兜底） ----------
_LIST_LOG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs", "list_method_log.jsonl")
_list_pw_sem = None


def _list_pw_sem():
    global _list_pw_sem
    if _list_pw_sem is None:
        _list_pw_sem = asyncio.Semaphore(2)
    return _list_pw_sem


def _record_list_method(media, url, method, http_links, pw_links):
    try:
        os.makedirs(os.path.dirname(_LIST_LOG_PATH), exist_ok=True)
        with open(_LIST_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "ts": time.time(), "media": media, "url": url,
                "method": method, "http_links": http_links, "pw_links": pw_links,
            }, ensure_ascii=False) + "\n")
    except Exception:
        pass


async def fetch_list_links(url: str, min_cn: int = 6,
                           allowed_hosts: Optional[List[str]] = None,
                           min_links: int = 3, media: str = "") -> Tuple[list, str]:
    """列表页抓取：默认 HTTP；仅当 collect_links 实抽文章链接数 < min_links 时，
    用 Playwright 兜底（domcontentloaded + 2.5s，Semaphore(2) 限并发，1 次重试）。
    返回 (links, method)。method ∈ {http, playwright}。
    判据用『实抽链接数』而非 fetcher._is_real，避免 SPA 空壳页骗过 _is_real 而漏触发。"""
    html, fetch_method = await fetch(url, pw_wait_until="domcontentloaded", pw_extra_wait=2500)
    host = urlparse(url).netloc.lower()
    hosts = allowed_hosts or [host]
    links = collect_links(BeautifulSoup(html, "lxml"), url, min_cn=min_cn, allowed_hosts=hosts)
    if len(links) >= min_links:
        _record_list_method(media, url, fetch_method, len(links), len(links))
        return links, fetch_method
    if fetch_method == "playwright":
        _record_list_method(media, url, "playwright", len(links), len(links))
        return links, "playwright"
    from app.core import settings
    if not settings.playwright_enabled():
        _record_list_method(media, url, "http", len(links), 0)
        return links, "http"
    sem = _list_pw_sem()
    html2 = None
    links2 = []
    last_err = None
    for attempt in range(2):
        try:
            async with sem:
                html2, _m = await fetch(url, force_playwright=True,
                                       pw_wait_until="domcontentloaded", pw_extra_wait=2500)
            links2 = collect_links(BeautifulSoup(html2, "lxml"), url, min_cn=min_cn, allowed_hosts=hosts)
            break
        except Exception as e:
            last_err = e
            logger.warning(f"[base] 列表页 PW 兜底第{attempt + 1}次失败 {url}: {e}")
    if html2 is not None and len(links2) > len(links):
        _record_list_method(media, url, "playwright", len(links), len(links2))
        return links2, "playwright"
    if last_err is not None:
        logger.warning(f"[base] 列表页 PW 兜底最终失败 {url}: {last_err}")
    _record_list_method(media, url, "http", len(links), len(links2))
    return links, "http"


_COLUMN_SELECTORS = (
    ".column, .article-column, .crumb, .breadcrumb, .location, .nav-crumb, "
    ".cur-crumbs, .path, .position, .Crumbs, .bread, .article-path, .nav"
)


def guess_column(soup: BeautifulSoup) -> Optional[str]:
    """抽取栏目名；优先面包屑/栏目容器，剔除“来源/记者/作者”等噪音。"""
    node = soup.select_one(_COLUMN_SELECTORS)
    if not node:
        return None
    txt = clean_text(node.get_text())
    # 面包屑取最后一级（最具体的栏目）
    for sep in ["/", ">", "·", "•", "—", "|"]:
        if sep in txt:
            txt = txt.split(sep)[-1].strip()
    if not txt or any(k in txt for k in ("来源", "记者", "作者", "编辑", "首页", "详情")):
        return None
    return txt[:30]


def guess_content(soup: BeautifulSoup) -> str:
    best = ""
    for sel in _CONTENT_SELECTORS:
        node = soup.select_one(sel)
        if node:
            txt = node.get_text("\n", strip=True)
            if len(txt) > len(best):
                best = txt
    if best:
        return best
    # 兜底：取 <body> 内最长连续文本块
    body = soup.body or soup
    # 移除脚本/样式
    for tag in body(["script", "style", "noscript"]):
        tag.decompose()
    blocks = [p.get_text("\n", strip=True) for p in body.find_all(["p", "div"])]
    blocks = [b for b in blocks if len(b) > 30]
    return "\n".join(sorted(blocks, key=len, reverse=True)[:8]) if blocks else ""


@dataclass
class Article:
    media: str
    title: str = ""
    publish_time: str = MISSING_TIME
    url: str = ""
    content: str = ""
    word_count: int = 0
    edition_no: Optional[str] = None
    edition_name: Optional[str] = None
    is_front_page: Optional[bool] = None
    is_full_page: Optional[bool] = None
    is_cross_page: Optional[bool] = None
    column_name: Optional[str] = None
    images: List[dict] = field(default_factory=list)
    series_name: Optional[str] = None
    special_name: Optional[str] = None
    special_url: Optional[str] = None
    column_url: Optional[str] = None
    series_id: Optional[str] = None
    series_articles: List[str] = field(default_factory=list)
    first_seen_at: Optional[str] = None
    source_type: Optional[str] = None
    scrape_method: Optional[str] = None
    business: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items()}


class BaseScraper(ABC):
    media: str = ""
    business: List[str] = []
    source_type: str = "官方网站"
    entry_urls: List[str] = []

    @abstractmethod
    async def list_articles(self) -> List[dict]:
        """返回文章存根列表：{url, title, publish_time?, edition_no?, edition_name?, is_front_page?, column_name?}"""
        raise NotImplementedError

    @abstractmethod
    async def parse_detail(self, url: str, html: str) -> Article:
        """从详情页 HTML 解析 Article（补齐正文等字段）。"""
        raise NotImplementedError

    async def fetch_detail(self, url: str) -> Article:
        from app.core import settings

        html, method = await fetch(url)
        art = await self.parse_detail(url, html)
        art.url = url
        art.scrape_method = method
        art.source_type = self.source_type
        art.business = self.business
        # 正文过短（典型为 JS 渲染的空壳页）→ 若允许则改用 Playwright 兜底
        if len(art.content or "") < 200 and settings.playwright_enabled():
            try:
                html2, method2 = await fetch(url, force_playwright=True)
                art2 = await self.parse_detail(url, html2)
                if len(art2.content or "") > len(art.content or ""):
                    art = art2
                    art.scrape_method = method2
            except Exception as e:
                logger.warning(f"[base] playwright 兜底失败 {url}: {e}")
        art.word_count = len(re.sub(r"\s+", "", art.content or ""))
        if not art.title:
            art.title = url
        return art

    def _soup(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "lxml")
