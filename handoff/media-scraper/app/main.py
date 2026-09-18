from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.core.fetcher import aclose
from app.core.scheduler import maybe_start, stop
from app.core.store import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    maybe_start()
    yield
    await aclose()
    stop()


app = FastAPI(title="媒体抓取服务 (Media Scraper)", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.get("/")
def root():
    return {"service": "media-scraper", "docs": "/docs", "health": "/api/health"}


if __name__ == "__main__":
    # 开箱即用：python -m app.main
    import uvicorn

    from app.core.settings import get_settings

    cfg = get_settings()
    print(f"[media-scraper] starting on http://{cfg.host}:{cfg.port}  docs: /docs")
    uvicorn.run("app.main:app", host=cfg.host, port=cfg.port, reload=False)
