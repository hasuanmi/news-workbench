from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import importlib.util


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # 服务
    # 留空 = 不鉴权（开箱即用）；设置后所有 /api/* 需带 X-API-Key
    api_key: str = ""
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"
    log_dir: str = "logs"
    db_path: str = "data/articles.db"

    # 抓取
    fetch_timeout: int = 15
    fetch_retries: int = 3
    fetch_backoff: float = 2.0
    request_delay: float = 1.0
    playwright_fallback: bool = True
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )

    # 业务开关
    business_daily_review: bool = True
    business_news_lead: bool = False

    # 对接主项目 news-workbench（ingest 拉模式）
    ingest_enabled: bool = False           # 是否启用常驻 worker 拉队列
    main_api_base: str = "http://localhost:3000"  # 主项目 base URL
    ingest_api_token: str = "newsdesk-ingest-2026"  # 与主项目 INGEST_API_TOKEN 一致
    poll_interval: int = 120              # worker 轮询间隔（秒）
    worker_per_source: int = 5            # 每个数据源抽样抓取篇数

    # 调度
    schedule_enabled: bool = False
    schedule_cron: str = "0 */2 * * *"

    # 去重
    dedup_ttl_days: int = 30


@lru_cache
def get_settings():
    return Settings()


def playwright_installed() -> bool:
    """playwright 是否可用（未安装时自动降级为纯 HTTP，不影响开箱使用）。"""
    try:
        return importlib.util.find_spec("playwright") is not None
    except Exception:
        return False


def playwright_enabled() -> bool:
    """是否真正启用浏览器兜底：开关打开 + playwright 已安装。"""
    return get_settings().playwright_fallback and playwright_installed()
