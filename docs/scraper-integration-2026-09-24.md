# 仓库内抓取服务同步验收（2026-09-24）

来源：独立 media-scraper 仓库已验收提交 ac88fa9。
目标：news-workbench/scraper，保留原目录结构。

## 同步内容

以下 12 个文件已与独立版逐文件核对一致（忽略 CRLF/LF 差异）：

- app/core/fetcher.py
- app/core/ingest_client.py
- app/core/worker.py
- app/scrapers/base.py
- app/scrapers/generic.py
- app/scrapers/oeeee.py
- app/scrapers/registry.py
- app/scrapers/ycwb.py
- config/sources.yaml
- poc_ingest_real.py
- test_link_rules.py
- test_source_binding.py

包括精确 source 身份绑定、generic 配置及 source_id 白名单、重定向/相对 URL、浏览器详情 URL、无效页及 APK 排除、article-v1 入库协议和已验收的南都正文解析。

主系统四状态、active 队列筛选、逐源状态回写和管理页展示已在 4066cb3 提交，本轮保留并接入仓库内 worker。

## 路径及启动保护

- scripts/run-daily-task.mjs 使用 scripts/scraper-runtime.mjs，代码目录固定为本仓库 scraper/。
- Python 环境优先 scraper/.venv，其次 scraper/venv，兼容现有启动脚本；SCRAPER_PYTHON 可指定解释器，但不改变代码目录。
- 两个真实 PoC/隔离验收脚本的日志路径同步切到 scraper/logs/real-poc。
- start.bat、start.sh、Dockerfile、docker-compose.yml、.env.example、settings.py 均未修改；原 .env 内容也未覆盖。
- 本地为 scraper/.venv 安装已有 requirements 声明依赖；虚拟环境、凭据、运行日志不提交。
- handoff/ 保留历史快照，不作为正式执行路径。

## 最小回归

- 仓库内 Python 单测：10/10 PASS。
- Node source 身份校验：1/1 PASS。
- 真实样本：南方日报，source_id c7fb44f1-52bb-465d-a4c1-22f365645b7d。
- 实际执行目录：news-workbench/scraper；解释器：scraper/.venv/Scripts/python.exe；主服务端口：3002。
- 抓取 2 篇，新增 0，重复 2，无效 0，失败 0；source_id 全程一致。
- /api/ingest/source-result 返回 HTTP 200 / success=true。
- 未运行全量队列或 AI 阶段。
- 真实回归明细：scraper-integration-regression-2026-09-24.json。

## 未直接覆盖的差异

独立版与仓库内版本仅剩 .gitignore、README.md、媒体结构化产出覆盖率报告.md 三个文本差异。前两项保留主仓库用途并更新正式运行说明；覆盖率报告保留历史口径，本次验收数据记录在本报告。所有已跟踪 Python 代码、采集配置、依赖声明和回归测试均已一致，无遗漏的功能修改。
