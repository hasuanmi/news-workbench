import os

import yaml

from app.scrapers.gzdaily import GzdailyScraper
from app.scrapers.oeeee import OeeeeScraper
from app.scrapers.southcn import SouthcnScraper
from app.scrapers.xkb import XkbScraper
from app.scrapers.ycwb import YcwbScraper
from app.scrapers.xxsb import XxsbScraper

_REGISTRY = {
    "gzdaily": GzdailyScraper,
    "southcn": SouthcnScraper,
    "oeeee": OeeeeScraper,
    "xkb": XkbScraper,
    "ycwb": YcwbScraper,
    "xxsb": XxsbScraper,
}


def _sources_path() -> str:
    return os.path.join(os.path.dirname(__file__), "..", "..", "config", "sources.yaml")


def load_sources() -> list:
    with open(_sources_path(), encoding="utf-8") as f:
        return yaml.safe_load(f)["sources"]


def get_scrapers(business: str = None, media: str = None):
    """返回 [(source_cfg, scraper_instance), ...]"""
    out = []
    for s in load_sources():
        if not s.get("enabled", True):
            continue
        if media and s["media"] != media:
            continue
        if business and business not in s.get("business", []):
            continue
        cls = _REGISTRY.get(s["scraper"])
        if not cls:
            continue
        inst = cls()
        inst.media = s["media"]
        inst.business = s.get("business", [])
        inst.source_type = s.get("source_type", "官方网站")
        inst.entry_urls = s.get("entry_urls", [])
        out.append((s, inst))
    return out
