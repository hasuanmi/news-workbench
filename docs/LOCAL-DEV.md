# 本地工程基线与运行方式

主系统是本目录；唯一正式抓取服务为同级 `../media-scraper/`。本目录 `scraper/` 暂留作差异核对，不新增功能，也未删除。当前仅 `app/core/worker.py` 存在排除换行差异后的 Python 文本差异，包含列表过滤、通用标题提取和每批 50 个源回推等必要修复，后续抓取阶段再迁移。

## 数据库边界

当前 `.env` 连接 `reusdpelytqggjyhfsyh.supabase.co`，已由项目所有者确认是扣子线上／共享库。它不是本地隔离数据库。

当前阶段禁止运行 seed、import、db upgrade、drizzle push 和任何 migration。共享库修复方案见 [数据库审核材料](db-review/README.md)，两份 proposed SQL 均未执行；历史节点转入正式日历也需单独确认。

## 运行

在 `news-workbench` 中执行：

```powershell
corepack pnpm --version
# 应为 packageManager 指定的 9.0.0
corepack pnpm dev:local
```

新增本地入口兼容 Windows，不需要 Bash；按 Next.js 环境变量优先级读取配置后选择 `PORT`，当前 `.env` 为 3001。不会清理端口占用进程、安装依赖或执行数据库初始化。遇到端口占用会报错退出。原扣子 build/dev/start 脚本保留。

```powershell
corepack pnpm build:local
corepack pnpm start:local
```

build:local 只编译，不自动安装依赖；start:local 使用生产模式启动已构建主系统。

依赖变更使用 `corepack pnpm`，不要直接用当前系统默认的 pnpm 11 重写 lockfile。`package.json` 和 workspace 同步声明 sharp override，workspace 的原占位值已改为布尔值。原本地 lockfile 备份保存在被 Git 忽略的 `logs/takeover-baseline/`。

## 配置与审核工具

Next.js 配置优先级：进程环境 → `.env.<mode>.local` → `.env.local` → `.env.<mode>` → `.env`。本阶段没有创建 `.env.local` 或更改任何现有密钥；DeepSeek 配置与调用验证留到后续阶段。

只读 DB 审核工具需要 Node.js 24 的 TypeScript 支持，或在支持的 Node.js 20+ 中使用现有 tsx loader：

```powershell
node --import tsx scripts/audit-local-db.mjs
# GET/SELECT 表结构、计数和日历记录；不执行 SQL，不输出密钥
```

登录和只读 HTTP 验收：

```powershell
$env:BASE_URL = 'http://localhost:3001'
$env:AUDIT_USERNAME = '已有账号'
$env:AUDIT_PASSWORD = '已有账号密码'
node scripts/smoke-local.mjs
Remove-Item Env:AUDIT_PASSWORD
```

该脚本仅 POST 登录，其余请求均为 GET；不生成 AI 内容、不推送 mock、不保存配置。结果只包含状态和数量，不保存会话 cookie、密码、配置值或正文。日历 API 的已知 schema 故障会让验收退出码非零，不能视作全功能通过。

## 当前环境变量目录

| 名称 | 用途／当前状态 |
|---|---|
| SUPABASE_URL | 已配置，连接上述共享远程库 |
| SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY | 已配置；不展示值 |
| COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY / COZE_SUPABASE_SERVICE_ROLE_KEY | 上述标准名的兼容回退 |
| SESSION_SECRET | 已配置，签名登录会话 |
| DEFAULT_LLM_BASE_URL / DEFAULT_LLM_API_KEY / DEFAULT_LLM_MODEL | 已配置，地址为 DeepSeek，模型为 deepseek-chat；未验证调用 |
| DEEPSEEK_SEARCH_MODEL | 联网推荐读取；当前未配置，模板未列出，后续核验服务能力后配置 |
| INGEST_API_TOKEN | 模板和 .env 有值，但主系统当前实际鉴权未读取它；后续 ingest 阶段最小修复 |
| CRON_SECRET / CRON_TOKEN | 标准名已配置；兼容名可回退，仅表明可鉴权，不证明外部定时器已部署 |
| PORT | 当前 3001 |
| NEXT_PUBLIC_SITE_URL | 已配置；是否为本地正确地址尚需后续部署阶段核对 |
| NODE_ENV | .env 当前 development；本地入口按 dev/start 选择模式 |
| HOSTNAME / DEPLOY_RUN_PORT | 原自定义服务器／扣子启动脚本兼容变量 |
| COZE_WORKSPACE_PATH / COZE_LOG_DIR / COZE_PROJECT_ENV | 原扣子脚本工作目录、日志与环境标签 |
| BASE_URL / INGEST_TOKEN | mock-ingest.ts 使用；默认 5000 和示例 token，后续需显式指定 |
| AUDIT_USERNAME / AUDIT_PASSWORD | 新只读 HTTP 验收脚本使用；不保存、不记录值 |

`media-scraper` 使用独立 `.env`，不自动继承主系统 `.env.local`：

```text
API_KEY HOST PORT LOG_LEVEL LOG_DIR DB_PATH
FETCH_TIMEOUT FETCH_RETRIES FETCH_BACKOFF REQUEST_DELAY
PLAYWRIGHT_FALLBACK USER_AGENT
BUSINESS_DAILY_REVIEW BUSINESS_NEWS_LEAD
SCHEDULE_ENABLED SCHEDULE_CRON DEDUP_TTL_DAYS
INGEST_ENABLED MAIN_API_BASE INGEST_API_TOKEN POLL_INTERVAL WORKER_PER_SOURCE
```

独立服务当前无 `.env`，已有 `.venv` 与 `venv` 两套目录，运行时选择在抓取阶段核对。本阶段未启动、改动或执行该服务的 PoC。
