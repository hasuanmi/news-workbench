# 媒体数据抓取服务（Media Scraper）

独立的「原始新闻数据抓取服务」，用于解决扣子(Coze)云端沙箱无法稳定访问新闻网站的问题。
**只负责确定性数据采集**，不负责「是否重点稿 / 是否新栏目 / 是否同题」等 AI 业务判断（这些留在扣子主项目）。

正式链路：媒体网站 → 抓取/清洗 → article-v1 → `POST /api/ingest/articles`。独立 `media-scraper` 是唯一正式采集入口，不连接 Supabase、不做 AI 业务判断。已有原始数据查询 API 可用于诊断。

## 本轮真实数据 PoC

本轮只验证广州日报、南方日报、南方都市报，逐家运行 `poc_ingest_real.py`；主系统 `news-workbench/scraper/` 仅保留差异比对。配置 `MAIN_API_BASE` 和 `INGEST_API_TOKEN` 于忽略的 `.env`。旧的全媒体后台 worker 保持关闭；已安装 Windows 每日08:30任务，按上述顺序各抓取最多10篇并通过 HTTP 推送，完成后由主系统识别新栏目。详见[真实自动任务](../news-workbench/docs/AUTOMATIC-TASKS.md)。

```powershell
.venv/Scripts/python.exe poc_ingest_real.py 广州日报 5
.venv/Scripts/python.exe poc_ingest_real.py 南方日报 5
.venv/Scripts/python.exe poc_ingest_real.py 南方都市报 5
```

[真实 PoC 报告](../news-workbench/docs/REAL-MEDIA-POC.md)列出实际数量、失败原因和业务证据边界。下文广泛媒体覆盖说明不代表本轮已验收这些媒体。

---

## 快速开始（开箱即用，无需 Playwright）

环境要求：**Python 3.10+**（推荐 3.12）。

> 默认是**纯 HTTP 模式**：装完依赖直接能跑，可覆盖媒体清单中约 70 家。
> Playwright 只是**可选增强**（约 20 家 JS 渲染站点需要），不装也能正常启动，服务会自动降级为纯 HTTP 并给出提示。

### 方式一：一键脚本（推荐）

```bash
# Windows：双击 start.bat
# Linux / macOS：
bash start.sh
```

脚本会自动完成：创建虚拟环境 → 安装依赖 → 启动服务。

### 方式二：手动三步

```bash
python -m venv venv

# Windows
venv\Scripts\pip install -r requirements.txt
venv\Scripts\python -m app.main

# Linux / macOS
./venv/bin/pip install -r requirements.txt
./venv/bin/python -m app.main
```

### 验证是否跑通

打开 <http://127.0.0.1:8000/docs> 查看接口文档，或执行：

```bash
curl http://127.0.0.1:8000/api/health                       # -> {"status":"ok"}

curl -X POST http://127.0.0.1:8000/api/scrape \
     -H "Content-Type: application/json" \
     -d '{"media":"广州日报","limit":5}'

curl "http://127.0.0.1:8000/api/articles?limit=5"
```

### 自检（可选）

```bash
python verify_ootb.py
```

会输出 `verify_ootb.json`，检查默认配置（鉴权关闭、Playwright 自动降级）与纯 HTTP 抓取链路是否正常。

### 可选：启用浏览器兜底（约 20 家 JS 渲染站点）

```bash
pip install -r requirements-playwright.txt
playwright install chromium
```

> **鉴权说明**：默认 `API_KEY` 留空 = **不鉴权**，方便下载后直接调试。
> 正式部署请在 `.env` 中设置 `API_KEY=你的密钥`，之后所有 `/api/*` 请求需带请求头 `X-API-Key: 你的密钥`（`/api/health` 始终免鉴权）。

---

## 两类业务与数据源覆盖

### ① 每日评报（广州同城 6 家）
广州日报、南方日报、南方都市报、新快报、羊城晚报、信息时报。
- 源优先级：**电子报/数字报 > 官方网站 > 客户端网页**（公众号非 V1 必须）
- 重点字段：标题、发布时间、正文、原文链接、媒体名称、**版面号/版名、是否头版、是否整版/跨版、栏目名、图片/图示/专题元数据**

### ② 新闻线索（媒体池，初始来自《媒体列表.xlsx》）
优先 10 家：新华社、人民日报、光明日报、央视新闻、南方日报、解放日报、浙江日报、河南日报、四川日报、深圳特区报 + 列表内其他重点省级/地市级媒体。
- 源优先级：**官方网站 > 电子报/数字报 > 专题页/栏目页 > 客户端网页**
- 重点字段：标题、发布时间、正文、原文链接、栏目名、系列名、专题名、专题页链接、栏目页链接、系列标识、同系列文章关系、首次发现时间

> 所有字段在统一 `article` 结构中**预留可选字段**，目标站点拿不到即为 `null`，不破坏结构。

---

## 技术栈

- Python 3.12 + **FastAPI**（HTTP API）
- **httpx**（异步 HTTP）+ **BeautifulSoup4 / lxml**（解析）
- **Playwright**（JS 渲染/反爬兜底，**可选**：不装也能跑，需要时 `docker build --build-arg WITH_PLAYWRIGHT=true`）
- **APScheduler**（可选定时调度）
- **SQLite**（去重 + 存储 + 媒体可用性状态）
- **pydantic-settings**（环境变量/配置文件管理）
- **loguru**（日志）、**tenacity**（失败重试）
- **Docker / docker-compose**（部署）

> 选轻量 fetcher 而非 Scrapy：本服务是「指定站点 + 按需/定时拉取 + 对外 API」场景，可插拔 scraper 更贴合，也便于被扣子触发。

---

## 目录结构

```
media-scraper/
├── app/
│   ├── main.py                 # FastAPI 入口
│   ├── api/routes.py           # API 路由
│   ├── ingest_worker.py        # 常驻 worker 启动入口（-m app.ingest_worker / --once）
│   ├── core/
│   │   ├── settings.py         # 配置（环境变量/配置文件）
│   │   ├── logger.py           # loguru 日志
│   │   ├── fetcher.py          # HTTP + GBK/GB18030 编码兜底 + Playwright 兜底 + 重试
│   │   ├── dedup.py            # 去重（URL + 正文哈希）
│   │   ├── store.py            # SQLite（articles + media_status）
│   │   ├── service.py          # 抓取编排
│   │   ├── scheduler.py        # 定时调度（可选）
│   │   ├── ingest_client.py    # 对接主项目：拉队列/回推文章（Bearer 鉴权）
│   │   └── worker.py           # 常驻 worker：派发+抓取+回推
│   └── scrapers/
│       ├── base.py             # Article 结构 + BaseScraper + 通用解析工具
│       ├── gzdaily.py          # 广州日报
│       ├── southcn.py          # 南方日报
│       ├── oeeee.py            # 南方都市报（奥一网）
│       ├── xkb.py              # 新快报
│       ├── ycwb.py             # 羊城晚报
│       ├── xxsb.py             # 信息时报
│       └── registry.py         # scraper 注册表
├── config/
│   └── sources.yaml            # 各媒体入口 URL / 业务 / 抓取方式
├── mock_server.py              # 本地验证用：模拟主项目 ingest 端点
├── verify_ingest.py            # 闭环验证脚本（同进程起 mock + 跑 worker）
├── verify_ootb.py              # 开箱自检：默认配置 + 纯 HTTP 抓取链路
├── start.sh / start.bat        # 一键启动脚本（建 venv → 装依赖 → 启服务）
├── requirements.txt            # 核心依赖（纯 HTTP，必装）
├── requirements-playwright.txt # 可选依赖（JS 渲染站点需要）
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── PoC验证报告.md             # 实测结果
```

---

## 配置

**可选**：全部配置项都有默认值，不建 `.env` 也能直接跑。需要修改时复制 `.env.example` 为 `.env` 再改：

```ini
# API 鉴权：留空 = 不鉴权（开箱即用）；设置后所有 /api/* 需带 X-API-Key 头
API_KEY=

# 服务
HOST=0.0.0.0
PORT=8000

# 抓取
FETCH_TIMEOUT=15          # 单请求超时（秒）
FETCH_RETRIES=3           # 失败重试次数
PLAYWRIGHT_FALLBACK=true  # 是否用浏览器兜底；未装 playwright 会自动降级为纯 HTTP
USER_AGENT=Mozilla/5.0 ...
DB_PATH=data/articles.db  # SQLite 路径（目录会自动创建）
```

---

## API 设计

鉴权：`API_KEY` **留空时不鉴权**（默认，开箱即用）；设置了则所有 `/api/*` 需带请求头 `X-API-Key: <API_KEY>`（`/api/health` 始终免鉴权）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/scrape` | 触发抓取：`{"media": "广州日报", "limit": 20}` |
| GET | `/api/articles` | 查询已抓取文章（支持 `?media=&limit=&since=`） |
| GET | `/api/sources` | 列出已配置媒体与启用状态 |
| GET | `/api/sources/{media}/test` | **字段覆盖率验证**：实测列表/标题/时间/正文/链接及版面类字段成功率，并回填 `MediaStatus` |
| GET | `/api/stats` | 抓取统计（各媒体文章数、成功率等） |

统一 article 输出示例：

```json
{
  "media": "南方日报",
  "title": "文章标题",
  "publish_time": "2026-09-11 08:30:00",
  "url": "https://...",
  "content": "正文",
  "word_count": 2350,
  "column_name": "时政",
  "images": [{"url": "https://...", "caption": "", "type": "photo"}],
  "edition_no": null,
  "is_front_page": null,
  "scrape_method": "http",
  "source_type": "官方网站",
  "business": ["daily_review"]
}
```

---

## 运行

### 本地（venv）

```bash
python -m venv venv
./venv/Scripts/pip install -r requirements.txt      # Windows
# ./venv/bin/pip install -r requirements.txt        # Linux / macOS

cp .env.example .env     # 可选：不建 .env 也能跑，全部走默认值

python -m app.main       # 等价于 uvicorn app.main:app

# 如需 Playwright 兜底：
pip install -r requirements-playwright.txt && playwright install chromium
```

### Docker（生产）

```bash
# 纯 HTTP 模式（默认，镜像轻量、构建快）
docker compose up -d --build

# 需要抓取 JS 渲染站点时，构建带 Chromium 的镜像：
docker build --build-arg WITH_PLAYWRIGHT=true -t media-scraper . && docker compose up -d

# 服务监听 8000；前面用 nginx + HTTPS 反代，对外提供公网域名
```

扣子工作流通过 HTTP 节点带 `X-API-Key` 调用公网域名即可。

---

## 扩展新媒体

1. 在 `app/scrapers/` 新增 `<media>.py`，继承 `BaseScraper`，实现 `list_articles()` 与 `parse_detail()`。
2. 在 `registry.py` 注册 scraper 类。
3. 在 `config/sources.yaml` 增加该媒体的 `entry_urls` / `business` / `scraper`。
4. 调用 `GET /api/sources/{media}/test` 验证字段覆盖率，回填 `MediaStatus`（可用性/失败原因/反爬情况/推荐抓取方式）。

---

## PoC 实测状态（详见 `PoC验证报告.md`）

- 每日评报 6 家：**广州日报 / 南方日报 / 南方都市报 / 新快报 / 信息时报** 5 家纯 HTTP 即可稳定抓列表+详情；**羊城晚报**官网为 JS 空壳需 Playwright（用 `--build-arg WITH_PLAYWRIGHT=true` 构建镜像后可抓取）。
- 全量扫描《媒体列表.xlsx》132 家：86 家 HTTP 直连、19 家需 Playwright、27 家沙箱不可达（多为代理/网络限制，生产直连通常更优）。

## 边界重申

- 本服务**只做确定性采集**；`first_seen_at`、同系列关联等是采集过程可确定的元数据，由存储层生成。
- 所有「是否重点稿 / 是否新栏目 / 是否同题」判断**不在本服务内**，由扣子主项目负责。

---

## 对接 news-workbench 主项目（ingest 拉模式）

本服务正是主项目（`news-workbench`，Next.js + Supabase）期望的**外部抓取服务**。集成采用主项目官方约定的「拉模式」：

```
media-scraper                         news-workbench
  │  GET  /api/ingest/queue  ──────▶│  返回启用中的 media_source 队列
  │  (Bearer <token>)               │  {sourceId, mediaId, sourceType,
  │                                  │   sourceUrl, crawlMethod, lastIngestAt}
  │  按 sourceUrl 域名派发抓取器      │
  │  POST /api/ingest/articles ────▶│  入库（content_hash 去重）+ 更新源状态
  │  {results:[{sourceId,           │  + 写 task_log（单源失败不影响其他）
  │    success, articles:[...]}]}   │
```

### 1. 主项目侧改动（已完成）
- `src/storage/database/shared/schema.ts` 的 `article` 表已扩展丰富字段（栏目名/版面号/版名/头版/整版/跨版/系列名/专题名/专题链接/图片/来源类型/抓取方式/首次发现时间/业务标记）。
- 对应迁移脚本：`sql/0002_article_rich_fields.sql`（在 Supabase SQL Editor 或 `drizzle-kit push` 执行）。
- `src/lib/ingest.ts` 的 `IngestArticle` 接口与入库逻辑已支持上述丰富字段（camelCase）。
- 鉴权 token 默认 `your-random-ingest-token`（主项目 `app_config.ingest.api_token` 或 `.env` 的 `INGEST_API_TOKEN` 可轮换）。

### 2. 本服务侧新增模块
- `app/core/ingest_client.py`：`IngestClient`（拉队列 / 回推文章，Bearer 鉴权）。
- `app/core/worker.py`：常驻 worker。派发逻辑——命中专属 scraper（每日评报 6 家）走高质量定制解析；其余走通用解析兜底；`crawlMethod=epaper` 且未启用 Playwright 时标记跳过（生产 Docker 启用后即可抓）；`manual`（无 URL）直接跳过。
- `app/ingest_worker.py`：启动入口（`python -m app.ingest_worker` / `--once`）。

### 3. 配置（`.env` / `.env.example` 已含）
```ini
INGEST_ENABLED=true                       # 开启常驻 worker
MAIN_API_BASE=https://your-news-workbench.com   # 主项目 base URL
INGEST_API_TOKEN=your-random-ingest-token    # 与主项目 INGEST_API_TOKEN 一致
POLL_INTERVAL=120                        # 轮询间隔（秒）
WORKER_PER_SOURCE=5                      # 每源抽样篇数
```

### 4. 启动
```bash
# 方式 A：常驻 worker（推荐，独立进程）
INGEST_ENABLED=true MAIN_API_BASE=https://... INGEST_API_TOKEN=... \
  .venv/Scripts/python -m app.ingest_worker

# 方式 B：单次周期（调试/验证）
.venv/Scripts/python -m app.ingest_worker --once
```

### 5. 字段映射（本服务 Article → 主项目 IngestArticle）
| 本服务字段 | 主项目字段(camelCase) |
|---|---|
| title / url / publish_time / content / word_count | title / url / publishedAt / content / wordCount |
| column_name / edition_no / edition_name | columnName / editionNo / editionName |
| is_front_page / is_full_page / is_cross_page | isFrontPage / isFullPage / isCrossPage |
| series_name / special_name / special_url | seriesName / specialName / specialUrl |
| images / source_type / scrape_method | images / sourceType / scrapeMethod |
| first_seen_at / business | firstSeenAt / business |

### 6. 本地验证（无需部署主项目）
```bash
# 终端 1：启动模拟主项目
.venv/Scripts/python mock_server.py
# 终端 2：跑一次 worker（指向 mock）
MAIN_API_BASE=http://127.0.0.1:5099 INGEST_ENABLED=true PLAYWRIGHT_FALLBACK=false \
  .venv/Scripts/python -m app.ingest_worker --once
```
`mock_server.py` 会在 `mock_received.json` 记录收到的文章与丰富字段，验证「拉队列→抓取→回推」全链路。

> 注：本地未装 Playwright 时，`epaper` 类媒体会被 worker 标记跳过；用 `WITH_PLAYWRIGHT=true` 构建的镜像可正常抓取这 20 家。
