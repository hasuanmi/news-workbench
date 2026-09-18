"""开箱即用自检：验证默认配置（不装 playwright 也能跑）下核心链路可用。

用法：python verify_ootb.py
输出：verify_ootb.json
"""
import asyncio
import json
import sys

from app.core import settings
from app.core.store import init_db
from app.core.service import run_scrape

init_db()

result = {}

# 1) playwright 自动探测
result["playwright_installed"] = settings.playwright_installed()
result["playwright_enabled"] = settings.playwright_enabled()
cfg = settings.get_settings()
result["api_key_default_empty"] = (cfg.api_key == "")
result["playwright_fallback_flag"] = cfg.playwright_fallback


async def main():
    # 2) 模拟「未安装 playwright」：强制探测返回 False，验证自动降级为纯 HTTP
    real_installed = settings.playwright_installed
    settings.playwright_installed = lambda: False
    try:
        rep = await run_scrape(media="广州日报", limit=3)
        if isinstance(rep, list):
            rep = rep[0] if rep else {}
        result["scrape_without_playwright"] = {
            "status": "ok",
            "media": rep.get("media"),
            "inserted": rep.get("inserted"),
            "fetched": rep.get("fetched"),
            "coverage": rep.get("coverage"),
        }
    except Exception as e:
        result["scrape_without_playwright"] = {"status": "fail", "error": repr(e)[:200]}
    finally:
        settings.playwright_installed = real_installed


asyncio.run(main())

with open("verify_ootb.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
