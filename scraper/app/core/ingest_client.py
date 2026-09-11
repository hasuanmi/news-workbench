"""对接 news-workbench 主项目的 ingest 契约客户端。

主项目约定（拉模式）：
- GET  {base}/api/ingest/queue      -> {success, count, sources:[{sourceId, mediaId, sourceType, sourceUrl, crawlMethod, lastIngestAt}]}
- POST {base}/api/ingest/articles   -> body {results:[{sourceId, success, error?, articles:[IngestArticle...]}]}
鉴权：Header `Authorization: Bearer <token>` 或 `X-Ingest-Token`。
"""
from typing import Any, Dict, List

import httpx

from app.core import settings
from app.core.logger import logger


class IngestClient:
    def __init__(self):
        cfg = settings.get_settings()
        self.base = cfg.main_api_base.rstrip("/")
        self.token = cfg.ingest_api_token

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "X-Ingest-Token": self.token,
            "Content-Type": "application/json",
        }

    async def get_queue(self) -> List[Dict[str, Any]]:
        url = f"{self.base}/api/ingest/queue"
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as cli:
                r = await cli.get(url, headers=self._headers())
                if r.status_code == 401:
                    logger.error("[ingest] 队列鉴权失败(401)，请检查 INGEST_API_TOKEN")
                    return []
                if r.status_code != 200:
                    logger.error(f"[ingest] 队列返回 {r.status_code}: {r.text[:200]}")
                    return []
                data = r.json()
                return data.get("sources", []) or []
        except Exception as e:
            logger.error(f"[ingest] 拉取队列异常: {e}")
            return []

    async def push_articles(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        url = f"{self.base}/api/ingest/articles"
        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as cli:
                r = await cli.post(url, headers=self._headers(), json={"results": results})
                if r.status_code == 401:
                    logger.error("[ingest] 推送鉴权失败(401)")
                    return {"success": False, "error": "unauthorized"}
                if r.status_code >= 400:
                    logger.error(f"[ingest] 推送返回 {r.status_code}: {r.text[:300]}")
                    return {"success": False, "error": f"http_{r.status_code}"}
                return r.json()
        except Exception as e:
            logger.error(f"[ingest] 推送文章异常: {e}")
            return {"success": False, "error": str(e)[:200]}
