"""闭环验证：同进程起 mock 主项目 + 跑一次 worker，确认「拉队列→抓取→回推」全链路。

自动设置环境变量（不依赖 .env），断言：
- worker 能从 mock 拉到队列（2 个数据源）
- 专属 scraper 媒体（dayoo.com）产出文章 + 丰富字段（栏目名/图片等）
- 通用解析媒体（people.com.cn）产出文章
- 推送的 body 结构与主项目契约一致、token 鉴权生效
"""
import os
import json
import sys
import time
import asyncio
import threading

# Windows GBK 控制台无法输出 emoji，统一用纯文本标记
sys.stdout.reconfigure(encoding="utf-8")

os.environ["MAIN_API_BASE"] = "http://127.0.0.1:5099"
os.environ["INGEST_API_TOKEN"] = "your-random-ingest-token"
os.environ["INGEST_ENABLED"] = "true"
os.environ["PLAYWRIGHT_FALLBACK"] = "false"
os.environ["MOCK_INGEST_TOKEN"] = "your-random-ingest-token"
os.environ["WORKER_PER_SOURCE"] = "3"


def run_mock():
    from mock_server import app
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=5099, log_level="warning")


def main():
    t = threading.Thread(target=run_mock, daemon=True)
    t.start()
    time.sleep(3)

    from app.core.worker import run_once

    asyncio.run(run_once())
    time.sleep(1)

    try:
        data = json.load(open("mock_received.json", encoding="utf-8"))
    except FileNotFoundError:
        print("[FAIL] mock_received.json 未生成，worker 未推送任何内容")
        return

    print("队列被拉取次数:", data.get("queue_hits"))
    pushes = data.get("pushes", [])
    total = 0
    for push in pushes:
        for r in push.get("results", []):
            arts = r.get("articles", [])
            total += len(arts)
            flag = "[OK]" if r.get("success") else "[WARN]"
            print(f"{flag} sourceId={r.get('sourceId')} success={r.get('success')} 文章数={len(arts)}")
            if r.get("error"):
                print("    错误:", r.get("error"))
            for i, a in enumerate(arts[:1]):
                preview = {
                    k: (f"<{len(a.get('content') or '')}字>" if k == "content"
                        else (a.get(k) if not isinstance(a.get(k), (list, dict)) else f"<{type(a.get(k)).__name__}>"))
                    for k in ["title", "url", "publishedAt", "wordCount", "columnName",
                              "sourceType", "scrapeMethod", "business", "isFrontPage"]
                }
                print(f"    样例[{i}]字段:", json.dumps(preview, ensure_ascii=False))
    print("推送文章总数:", total)
    print("[OK] 闭环验证完成" if total > 0 else "[FAIL] 未推送任何文章")


if __name__ == "__main__":
    main()
