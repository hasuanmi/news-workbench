from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core import settings
from app.core.logger import logger

_sched = None


async def _tick():
    from app.core.service import run_scrape

    logger.info("[scheduler] 周期抓取触发")
    await run_scrape()


def maybe_start():
    global _sched
    cfg = settings.get_settings()
    if not cfg.schedule_enabled:
        return
    parts = cfg.schedule_cron.split()
    if len(parts) != 5:
        logger.warning(f"[scheduler] 无效 cron: {cfg.schedule_cron}")
        return
    minute, hour, dom, month, dow = parts
    _sched = AsyncIOScheduler()
    _sched.add_job(
        _tick, "cron", minute=minute, hour=hour, day=dom, month=month, day_of_week=dow
    )
    _sched.start()
    logger.info(f"[scheduler] 已启动, cron={cfg.schedule_cron}")


def stop():
    if _sched:
        _sched.shutdown(wait=False)
