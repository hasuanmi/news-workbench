"""本地 mock：模拟 news-workbench 主项目的 ingest 端点，用于验证 worker 闭环。

跑法（另开一个终端）：
  venv/Scripts/python mock_server.py
默认监听 5099，token 与 worker 一致（your-random-ingest-token）。

GET  /api/ingest/queue      -> 返回内置队列（1 个专属 scraper 媒体 + 1 个通用解析媒体）
POST /api/ingest/articles   -> 记录收到的 payload 到 received.json，返回成功
"""
import json
import os

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

app = FastAPI()
RECEIVED = {"queue_hits": 0, "pushes": []}

TOKEN = os.environ.get("MOCK_INGEST_TOKEN", "your-random-ingest-token")

# 队列：dayoo.com 命中 gzdaily 专属 scraper；people.com.cn 走通用解析
MOCK_QUEUE = [
    {
        "sourceId": "src-gzdaily-001",
        "mediaId": "m-gz",
        "sourceType": "website",
        "sourceUrl": "https://www.dayoo.com/",
        "crawlMethod": "html",
        "lastIngestAt": None,
    },
    {
        "sourceId": "src-generic-001",
        "mediaId": "m-cnnews",
        "sourceType": "website",
        "sourceUrl": "https://www.chinanews.com.cn/",
        "crawlMethod": "html",
        "lastIngestAt": None,
    },
]


@app.get("/api/ingest/queue")
async def queue(authorization: str = Header(None)):
    RECEIVED["queue_hits"] += 1
    if not authorization or authorization.replace("Bearer ", "") != TOKEN:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return {"success": True, "count": len(MOCK_QUEUE), "sources": MOCK_QUEUE}


@app.post("/api/ingest/articles")
async def articles(request: Request, authorization: str = Header(None)):
    if not authorization or authorization.replace("Bearer ", "") != TOKEN:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    body = await request.json()
    RECEIVED["pushes"].append(body)
    with open("mock_received.json", "w", encoding="utf-8") as f:
        json.dump(RECEIVED, f, ensure_ascii=False, indent=2)
    n = sum(len(r.get("articles", [])) for r in body.get("results", []))
    return {"success": True, "sources": len(body.get("results", [])), "inserted": n, "perSource": []}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=5099)
