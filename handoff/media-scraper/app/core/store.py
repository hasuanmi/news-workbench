import json
import os
import sqlite3
from datetime import datetime
from typing import List, Optional

from app.core import settings
from app.core.dedup import content_hash, url_hash
from app.core.logger import logger

_SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_hash TEXT UNIQUE,
    content_hash TEXT,
    media TEXT,
    title TEXT,
    publish_time TEXT,
    url TEXT,
    content TEXT,
    word_count INTEGER,
    edition_no TEXT,
    edition_name TEXT,
    is_front_page INTEGER,
    is_full_page INTEGER,
    is_cross_page INTEGER,
    column_name TEXT,
    images TEXT,
    series_name TEXT,
    special_name TEXT,
    special_url TEXT,
    column_url TEXT,
    series_id TEXT,
    series_articles TEXT,
    first_seen_at TEXT,
    source_type TEXT,
    scrape_method TEXT,
    business TEXT,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS media_status (
    media TEXT PRIMARY KEY,
    business TEXT,
    source_priority TEXT,
    active_source TEXT,
    status TEXT,
    last_success_at TEXT,
    last_error TEXT,
    anti_bot TEXT,
    recommended_method TEXT,
    note TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_media ON articles(media);
CREATE INDEX IF NOT EXISTS idx_articles_series ON articles(series_id);
"""


def _conn() -> sqlite3.Connection:
    path = settings.get_settings().db_path
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    c = _conn()
    c.executescript(_SCHEMA)
    c.commit()
    c.close()


def _b(v) -> Optional[int]:
    if v is None:
        return None
    return 1 if v else 0


_COLS = [
    "url_hash", "content_hash", "media", "title", "publish_time", "url", "content",
    "word_count", "edition_no", "edition_name", "is_front_page", "is_full_page",
    "is_cross_page", "column_name", "images", "series_name", "special_name",
    "special_url", "column_url", "series_id", "series_articles", "first_seen_at",
    "source_type", "scrape_method", "business", "created_at",
]


def save_article(art: dict) -> str:
    """写入文章；URL 已存在返回 'dup'，否则 'inserted'。"""
    c = _conn()
    uh = url_hash(art.get("url", ""))
    existing = c.execute("SELECT 1 FROM articles WHERE url_hash=?", (uh,)).fetchone()
    if existing:
        c.close()
        return "dup"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    first_seen = art.get("first_seen_at") or now
    vals = [
        uh,
        content_hash(art.get("content") or ""),
        art.get("media"),
        art.get("title"),
        art.get("publish_time"),
        art.get("url"),
        art.get("content"),
        art.get("word_count") or 0,
        art.get("edition_no"),
        art.get("edition_name"),
        _b(art.get("is_front_page")),
        _b(art.get("is_full_page")),
        _b(art.get("is_cross_page")),
        art.get("column_name"),
        json.dumps(art.get("images") or [], ensure_ascii=False),
        art.get("series_name"),
        art.get("special_name"),
        art.get("special_url"),
        art.get("column_url"),
        art.get("series_id"),
        json.dumps(art.get("series_articles") or [], ensure_ascii=False),
        first_seen,
        art.get("source_type"),
        art.get("scrape_method"),
        json.dumps(art.get("business") or [], ensure_ascii=False),
        now,
    ]
    c.execute(
        f"INSERT INTO articles({','.join(_COLS)}) VALUES ({','.join(['?']*len(_COLS))})",
        vals,
    )
    c.commit()
    c.close()
    return "inserted"


def get_articles(
    media: Optional[str] = None,
    business: Optional[str] = None,
    since: Optional[str] = None,
    keyword: Optional[str] = None,
    has_series: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[dict]:
    c = _conn()
    sql = "SELECT * FROM articles WHERE 1=1"
    args = []
    if media:
        sql += " AND media=?"
        args.append(media)
    if business:
        sql += " AND business LIKE ?"
        args.append(f"%{business}%")
    if since:
        sql += " AND publish_time>=?"
        args.append(since)
    if keyword:
        sql += " AND (title LIKE ? OR content LIKE ?)"
        args += [f"%{keyword}%", f"%{keyword}%"]
    if has_series is True:
        sql += " AND series_id IS NOT NULL AND series_id <> ''"
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    args += [limit, offset]
    rows = c.execute(sql, args).fetchall()
    c.close()
    return [_row_to_dict(r) for r in rows]


def get_article(article_id: int) -> Optional[dict]:
    c = _conn()
    r = c.execute("SELECT * FROM articles WHERE id=?", (article_id,)).fetchone()
    c.close()
    return _row_to_dict(r) if r else None


def get_series(series_id: str) -> List[str]:
    c = _conn()
    rows = c.execute(
        "SELECT url FROM articles WHERE series_id=?", (series_id,)
    ).fetchall()
    c.close()
    return [r["url"] for r in rows]


def _row_to_dict(r: sqlite3.Row) -> dict:
    d = dict(r)
    for k in ("images", "series_articles", "business"):
        if d.get(k):
            try:
                d[k] = json.loads(d[k])
            except Exception:
                pass
    for k in ("is_front_page", "is_full_page", "is_cross_page"):
        d[k] = None if d.get(k) is None else bool(d[k])
    return d


def upsert_media_status(**fields) -> None:
    c = _conn()
    fields["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cols = list(fields.keys())
    placeholders = ", ".join(["?"] * len(cols))
    updates = ", ".join([f"{k}=excluded.{k}" for k in cols if k != "media"])
    sql = (
        f"INSERT INTO media_status({','.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT(media) DO UPDATE SET {updates}"
    )
    c.execute(sql, [fields.get(k) for k in cols])
    c.commit()
    c.close()


def get_sources() -> List[dict]:
    """返回 sources.yaml 中已配置的媒体，并合并 media_status 中的可用性状态。"""
    from app.scrapers.registry import load_sources

    try:
        cfgs = load_sources()
    except Exception:
        cfgs = []
    c = _conn()
    status_rows = {r["media"]: dict(r) for r in c.execute("SELECT * FROM media_status").fetchall()}
    c.close()
    out = []
    for s in cfgs:
        st = status_rows.get(s["media"], {})
        out.append({
            "media": s["media"],
            "business": s.get("business", []),
            "scraper": s.get("scraper"),
            "enabled": s.get("enabled", True),
            "entry_urls": s.get("entry_urls", []),
            "source_type": s.get("source_type"),
            "status": st.get("status"),
            "recommended_method": st.get("recommended_method"),
            "last_error": st.get("last_error"),
            "anti_bot": st.get("anti_bot"),
            "last_success_at": st.get("last_success_at"),
        })
    return out


def get_stats() -> dict:
    c = _conn()
    total = c.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    by_media = c.execute(
        "SELECT media, COUNT(*) AS n FROM articles GROUP BY media ORDER BY n DESC"
    ).fetchall()
    dup_note = "去重由 url_hash 唯一约束保证，重复写入被忽略"
    c.close()
    return {
        "total_articles": total,
        "by_media": [dict(r) for r in by_media],
        "dedup": dup_note,
    }
