"""Execute one explicit source snapshot; never reselect a source by media name."""
import argparse
import asyncio
import hashlib
import json
import sys
from dataclasses import asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

from app.core.ingest_client import IngestClient
from app.scrapers.registry import get_scrapers
from app.core.worker import _filter_stubs

SOURCE_FIELDS = ("source_id", "media_id", "source_url", "source_type", "crawl_method")


async def run_source(source, run_id, attempt_id, limit=10, client=None):
    client = client or IngestClient()
    report = {
        **{key: source.get(key) for key in SOURCE_FIELDS},
        "media": source.get("media_name"), "run_id": run_id, "attempt_id": attempt_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "success": False, "retryable": False, "attempted": 0,
        "discovered": 0, "articles": [], "failures": [], "successful_bodies": 0,
        "entry_urls": [],
    }

    def fail(code, reason, retryable=False):
        report.update(error_code=code, error=reason, retryable=retryable)

    source_id = source.get("source_id")
    source_type = source.get("source_type")
    method = source.get("crawl_method")
    url = source.get("source_url")
    if not source_id or not source.get("media_id") or not source.get("media_name"):
        fail("invalid_source", "source_id, media_id and media_name are required")
    elif source_type == "manual" or method == "manual":
        fail("manual_source", "Manual source cannot be replaced by an automatic source")
    elif (source_type, method) not in (("website", "html"), ("epaper", "epaper")):
        fail("unsupported_source", "Unsupported source_type/crawl_method; no fallback allowed")
    else:
        try:
            parsed = urlparse(url or "")
            valid_url = parsed.scheme in ("http", "https") and bool(parsed.hostname)
        except ValueError:
            valid_url = False
        if not valid_url:
            fail("invalid_source_url", "Source URL must be an explicit HTTP(S) URL")

    if "error_code" not in report:
        media = source["media_name"]
        # Alias selects an existing parser only, never a different source or URL.
        parser_name = {"广州日报报业集团": "广州日报"}.get(media, media)
        scrapers = get_scrapers(media=parser_name, source_id=source_id)
        if not scrapers:
            fail("configuration_missing", "No scraper registered for " + media)
        else:
            scraper = scrapers[0][1]
            scraper.entry_urls = [url]
            scraper.source_type = source_type
            report["entry_urls"] = list(scraper.entry_urls)
            try:
                stubs = _filter_stubs(await scraper.list_articles())
            except Exception as exc:
                stubs = []
                report["failures"].append({"stage": "list", "url": url, "reason": str(exc)})
                fail("list_fetch_failed", str(exc))
            report["discovered"] = len(stubs)
            payload = []
            for stub in stubs[:limit]:
                report["attempted"] += 1
                try:
                    art = await scraper.fetch_detail(stub["url"])
                    if not art.title or not art.content or len(art.content) < 50:
                        raise ValueError("Missing title or substantive body")
                    report["articles"].append(asdict(art))
                    stamp = None
                    if art.publish_time and not art.publish_time.startswith("1970"):
                        stamp = datetime.fromisoformat(art.publish_time).replace(
                            tzinfo=timezone(timedelta(hours=8))).isoformat()
                    payload.append({
                        "source_id": source_id, "title": art.title, "url": art.url,
                        "external_id": "real-" + hashlib.sha256(art.url.encode()).hexdigest()[:32],
                        "publish_time": stamp, "content": art.content, "word_count": art.word_count,
                        "column_name": art.column_name, "edition_no": art.edition_no,
                        "edition_name": art.edition_name, "source_type": source_type,
                        "scrape_method": method, "crawl_time": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception as exc:
                    report["failures"].append({"stage": "detail", "url": stub["url"], "reason": str(exc)})
                await asyncio.sleep(1)
            report["successful_bodies"] = len(payload)
            if payload:
                report["ingest"] = await client.push_articles([
                    {"source_id": source_id, "success": True, "articles": payload}])
                ingest = report["ingest"]
                per_source = ingest.get("perSource", [])
                identity_ok = len(per_source) == 1 and per_source[0].get("sourceId") == source_id
                accepted = sum(ingest.get(key, 0) for key in ("inserted", "updated", "duplicated"))
                report["success"] = bool(
                    identity_ok and per_source[0].get("ok") and ingest.get("success")
                    and ingest.get("failed", 0) == 0 and accepted > 0)
                if not report["success"]:
                    fail("ingest_failed", "Ingest failed, rejected all articles or returned a different source")
            elif "error_code" not in report:
                fail("no_valid_articles" if stubs else "empty_list", "No valid articles from this source URL")

    report["failed"] = len(report["failures"])
    report["ended_at"] = datetime.now(timezone.utc).isoformat()
    return report


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-stdin", required=True, action="store_true")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--attempt-id", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    source = json.loads(sys.stdin.read())
    print(json.dumps({"event": "source_start", "run_id": args.run_id,
                      "attempt_id": args.attempt_id, **source}, ensure_ascii=False), flush=True)
    try:
        report = await run_source(source, args.run_id, args.attempt_id, args.limit)
    except Exception as exc:
        report = {**{key: source.get(key) for key in SOURCE_FIELDS},
                  "media": source.get("media_name"), "run_id": args.run_id,
                  "attempt_id": args.attempt_id, "success": False, "retryable": False,
                  "error_code": "worker_error", "error": str(exc)}
    filename = Path(args.report)
    filename.parent.mkdir(parents=True, exist_ok=True)
    temporary = filename.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(filename)
    print(json.dumps({key: value for key, value in report.items() if key != "articles"}, ensure_ascii=False))
    return 0 if report["success"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
