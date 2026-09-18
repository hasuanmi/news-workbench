"""ingest worker 启动入口。

用法：
  python -m app.ingest_worker            # 常驻轮询（需 INGEST_ENABLED=true）
  python -m app.ingest_worker --once     # 跑一个周期后退出（用于验证/调试）
"""
import asyncio
import sys

from app.core.worker import run_loop, run_once


def main():
    if "--once" in sys.argv:
        asyncio.run(run_once())
    else:
        asyncio.run(run_loop())


if __name__ == "__main__":
    main()
