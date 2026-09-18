import os
import sys

from loguru import logger as _logger

from app.core import settings

_FMT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
    "<level>{level: <8}</level> | {message}"
)


def setup_logger():
    _logger.remove()
    cfg = settings.get_settings()
    _logger.add(sys.stderr, level=cfg.log_level, format=_FMT, colorize=True)
    try:
        os.makedirs(cfg.log_dir, exist_ok=True)
        _logger.add(
            os.path.join(cfg.log_dir, "scraper_{time:YYYY-MM-DD}.log"),
            rotation="10 MB",
            retention="7 days",
            level=cfg.log_level,
            encoding="utf-8",
            format=_FMT,
        )
    except Exception:
        # 日志目录不可写时不阻断主流程
        pass
    return _logger


logger = setup_logger()
