import re
from typing import Tuple

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.core import settings
from app.core.logger import logger

_client = None

# 仅当命中这些“强反爬/挑战页”特征时才直接判为需要 JS 兜底
# （注意：不要匹配 "robot"/"验证" 等常见词，否则会误杀正常新闻页的 robots meta/JS）
_STRONG_SUSPICIOUS = re.compile(
    r"请输入验证码|滑动验证|access denied|just a moment|请完成安全验证|"
    r"human verification|security check|checking your browser|启用 JavaScript 和 Cookie",
    re.I,
)


def _count_article_anchors(html: str) -> int:
    """统计页面中疑似文章链接的数量（中文锚文本>=6字），作为 HTTP 是否成功的判据。"""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    n = 0
    for a in soup.find_all("a", href=True):
        t = a.get_text(strip=True)
        if len(t) >= 6 and re.search(r"[\u4e00-\u9fff]", t):
            n += 1
            if n >= 5:
                return n
    return n


def _cn_chars(html: str) -> int:
    """页面中文字符数 —— 比“文章链接数”更通用的“是否拿到真实内容”判据。"""
    return len(re.findall(r"[\u4e00-\u9fff]", html))



def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        cfg = settings.get_settings()
        _client = httpx.AsyncClient(
            headers={
                "User-Agent": cfg.user_agent,
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            timeout=cfg.fetch_timeout,
            follow_redirects=True,
        )
    return _client


async def aclose() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _decode(data: bytes) -> str:
    """对中文新闻站做编码兜底（utf-8 / gbk / gb18030）。"""
    for enc in ("utf-8", "gbk", "gb18030"):
        try:
            s = data.decode(enc)
        except UnicodeDecodeError:
            continue
        if s.count("\ufffd") < 5:
            return s
    return data.decode("utf-8", "ignore")


@retry(
    stop=stop_after_attempt(settings.get_settings().fetch_retries),
    wait=wait_exponential(multiplier=settings.get_settings().fetch_backoff),
    retry=retry_if_exception_type((httpx.TransportError, httpx.TimeoutException)),
    reraise=True,
)
async def _http_get(url: str) -> httpx.Response:
    r = await get_client().get(url)
    r.raise_for_status()
    return r


async def _fetch_playwright(url: str, wait_until: str = "networkidle", extra_wait: int = 1500) -> str:
    try:
        from playwright.async_api import async_playwright
    except Exception as e:  # playwright 未安装
        raise RuntimeError("playwright 未安装，无法使用浏览器兜底") from e
    cfg = settings.get_settings()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(user_agent=cfg.user_agent)
        try:
            await page.goto(url, wait_until=wait_until, timeout=cfg.fetch_timeout * 1000)
            await page.wait_for_timeout(extra_wait)
            return await page.content()
        finally:
            await browser.close()


_WARNED_PW = False


def _warn_playwright_once():
    """playwright 开关已开但未安装时，提示一次（不阻断，自动降级为纯 HTTP）。"""
    global _WARNED_PW
    if _WARNED_PW:
        return
    _WARNED_PW = True
    logger.warning(
        "[fetch] 未检测到 playwright，已自动降级为纯 HTTP 模式；"
        "如需抓取 JS 渲染站点，请执行：pip install -r requirements-playwright.txt && playwright install chromium"
    )


async def fetch(url: str, force_playwright: bool = False, pw_wait_until: str = "networkidle", pw_extra_wait: int = 1500) -> Tuple[str, str]:
    """返回 (html, method)。method ∈ {http, playwright}。

    pw_wait_until / pw_extra_wait 仅用于列表页等需要更稳妥等待策略的场景
    （重 JS 列表页常因长轮询/埋点永不 networkidle 而超时，列表级传 domcontentloaded + 2500）。
    """
    cfg = settings.get_settings()

    def _is_real(html: str) -> bool:
        if not html or len(html) <= 2000:
            return False
        if _STRONG_SUSPICIOUS.search(html[:8000]):
            return False
        return _cn_chars(html) >= 200 or _count_article_anchors(html) >= 3

    # 纯 HTTP 模式（未启用浏览器兜底，或 playwright 未安装 → 自动降级）：抓到就用
    if not settings.playwright_enabled() and not force_playwright:
        if cfg.playwright_fallback and not settings.playwright_installed():
            _warn_playwright_once()
        try:
            resp = await _http_get(url)
            html = _decode(resp.content)
            if _is_real(html):
                return html, "http"
            raise RuntimeError(f"http 内容不足且浏览器兜底不可用: {url}")
        except Exception as e:
            logger.warning(f"[fetch] 抓取失败: {url} -> {e}")
            raise

    # 启用浏览器兜底：先试 http，内容不足/失败再转浏览器
    if not force_playwright:
        try:
            resp = await _http_get(url)
            html = _decode(resp.content)
            if _is_real(html):
                return html, "http"
            logger.warning(f"[fetch] http 内容不足/疑似空壳，改用 playwright: {url}")
        except Exception as e:
            logger.warning(f"[fetch] http 失败，准备 playwright: {url} -> {e}")
    return await _fetch_playwright(url, wait_until=pw_wait_until, extra_wait=pw_extra_wait), "playwright"
