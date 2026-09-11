from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core import settings
from app.core.service import run_poc_test, run_scrape
from app.core.store import get_article, get_articles, get_sources, get_stats

router = APIRouter(prefix="/api")


def _auth(x_api_key: Optional[str] = Header(None)):
    # api_key 留空 = 不鉴权（开箱即用）；设置了则所有 /api/* 需带 X-API-Key
    key = settings.get_settings().api_key
    if key and x_api_key != key:
        raise HTTPException(status_code=401, detail="invalid api key")


class ScrapeReq(BaseModel):
    business: Optional[str] = None
    media: Optional[str] = None
    limit: int = 50
    force: bool = False


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/scrape")
async def scrape(req: ScrapeReq, x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    summary = await run_scrape(req.business, req.media, req.limit)
    return {"accepted": True, "summary": summary}


@router.get("/articles")
def articles(
    media: Optional[str] = None,
    business: Optional[str] = None,
    since: Optional[str] = None,
    keyword: Optional[str] = None,
    has_series: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
    x_api_key: Optional[str] = Header(None),
):
    _auth(x_api_key)
    return get_articles(media, business, since, keyword, has_series, limit, offset)


@router.get("/articles/{aid}")
def article(aid: int, x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    a = get_article(aid)
    if not a:
        raise HTTPException(status_code=404, detail="not found")
    return a


@router.get("/sources")
def sources(x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    return get_sources()


@router.get("/sources/{media}")
def source(media: str, x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    for s in get_sources():
        if s["media"] == media:
            return s
    raise HTTPException(status_code=404, detail="media not found")


@router.get("/sources/{media}/test")
async def test_media(media: str, n: int = 20, x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    reports = await run_poc_test(media=media, n=n)
    return reports[0] if reports else {"media": media, "status": "not_found"}


@router.get("/stats")
def stats(x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    return get_stats()
