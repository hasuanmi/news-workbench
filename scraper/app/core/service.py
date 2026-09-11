import asyncio
from datetime import datetime
from typing import List, Optional

from app.core import settings
from app.core.logger import logger
from app.core.store import save_article, upsert_media_status
from app.scrapers.registry import get_scrapers


async def run_scrape(business: Optional[str] = None, media: Optional[str] = None, limit: int = 50):
    """实际抓取并入库，返回每家媒体的统计。"""
    summary = []
    delay = settings.get_settings().request_delay
    for src_cfg, scraper in get_scrapers(business=business, media=media):
        inserted = dup = 0
        errors: List[str] = []
        try:
            stubs = await scraper.list_articles()
        except Exception as e:
            logger.error(f"[scrape] {scraper.media} 列表失败: {e}")
            summary.append({"media": scraper.media, "error": str(e)[:200], "inserted": 0, "dup": 0})
            continue
        for st in stubs[:limit]:
            try:
                art = await scraper.fetch_detail(st["url"])
                r = save_article(art.to_dict())
                inserted += r == "inserted"
                dup += r == "dup"
                await asyncio.sleep(delay)
            except Exception as e:
                errors.append(str(e)[:150])
        logger.info(f"[scrape] {scraper.media} inserted={inserted} dup={dup} errors={len(errors)}")
        summary.append({
            "media": scraper.media,
            "inserted": inserted,
            "dup": dup,
            "errors": errors[:5],
            "total": min(len(stubs), limit),
        })
    return summary


async def run_poc_test(media: Optional[str] = None, n: int = 20):
    """PoC 字段覆盖率验证：抽样、入库、统计、回填 media_status。"""
    reports = []
    for src_cfg, scraper in get_scrapers(media=media):
        reports.append(await _test_one(scraper, n, src_cfg))
    return reports


async def _test_one(scraper, n, src_cfg):
    report = {
        "media": scraper.media,
        "sampled": 0,
        "inserted": 0,
        "dup": 0,
        "errors": [],
        "coverage": {},
        "method": None,
        "anti_bot": "none",
        "status": "ok",
        "note": "",
    }
    try:
        stubs = await scraper.list_articles()
    except Exception as e:
        report["status"] = "blocked"
        report["note"] = "列表页抓取失败"
        upsert_media_status(
            media=scraper.media,
            business=",".join(scraper.business),
            source_priority=",".join(src_cfg.get("source_priority", [])),
            active_source=",".join(scraper.entry_urls),
            status="blocked",
            last_error=str(e)[:300],
            anti_bot="unknown",
            recommended_method="playwright",
            note=report["note"],
        )
        return report

    if not stubs:
        report["status"] = "degraded"
        report["note"] = "列表页未解析到文章链接"
        upsert_media_status(
            media=scraper.media,
            business=",".join(scraper.business),
            source_priority=",".join(src_cfg.get("source_priority", [])),
            active_source=",".join(scraper.entry_urls),
            status="degraded",
            last_error="列表页未解析到文章链接",
            anti_bot="unknown",
            recommended_method="http",
            note=report["note"],
        )
        return report

    stubs = stubs[:n]
    report["sampled"] = len(stubs)
    cov = {k: 0 for k in ["list", "title", "time", "content", "url", "edition", "column", "images"]}
    cov["list"] = len(stubs)
    methods = set()
    delay = settings.get_settings().request_delay

    for st in stubs:
        try:
            art = await scraper.fetch_detail(st["url"])
            methods.add(art.scrape_method)
            r = save_article(art.to_dict())
            report["inserted"] += r == "inserted"
            report["dup"] += r == "dup"
            d = art.to_dict()
            if d["title"]:
                cov["title"] += 1
            if d["publish_time"] and d["publish_time"] != "1970-01-01 00:00:00":
                cov["time"] += 1
            if d["content"] and len(d["content"]) > 50:
                cov["content"] += 1
            if d["url"]:
                cov["url"] += 1
            if d.get("edition_no") or d.get("edition_name"):
                cov["edition"] += 1
            if d.get("column_name"):
                cov["column"] += 1
            if d.get("images"):
                cov["images"] += 1
            await asyncio.sleep(delay)
        except Exception as e:
            report["errors"].append({"url": st["url"], "error": str(e)[:200]})

    total = report["sampled"]
    report["coverage"] = {
        k: round(v / total * 100, 1) if total else 0.0 for k, v in cov.items()
    }
    report["method"] = "/".join(methods) or "http"

    if "playwright" in methods:
        report["anti_bot"] = "js_render"
        report["recommended_method"] = "playwright"
    else:
        report["recommended_method"] = "http"

    if report["errors"] and report["inserted"] == 0 and report["dup"] == 0:
        report["status"] = "blocked"
    elif report["coverage"].get("content", 0) < 50:
        report["status"] = "degraded"
    else:
        report["status"] = "ok"

    upsert_media_status(
        media=scraper.media,
        business=",".join(scraper.business),
        source_priority=",".join(src_cfg.get("source_priority", [])),
        active_source=",".join(scraper.entry_urls),
        status=report["status"],
        last_success_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        last_error=";".join([e["error"] for e in report["errors"]])[:300] or None,
        anti_bot=report["anti_bot"],
        recommended_method=report["recommended_method"],
        note=f"抽样{total}篇, 入库{report['inserted']}, 重复{report['dup']}",
    )
    return report
