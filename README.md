# AI 新闻辅助工作台

面向广州日报编辑的内部 AI 新闻辅助工作台。按 PRD V1.0 分三阶段交付：**新闻日历**（已完成 M0+M1）→ **新闻线索**（M3）→ **每日评报**（M4）。

## 功能概览

| 模块 | 状态 | 说明 |
|------|------|------|
| 新闻日历 | ✅ 已交付 | 未来 14 天节点预警、AI 选题策划建议、分类/重要度/审核状态 |
| 新闻线索 | 🔜 待开发 | 基于文章去重聚合 → AI 识别线索卡片 → 每日列表 + 每周简报 |
| 每日评报 | 🔜 待开发 | 同城媒体同题比较 → SSE 流式生成约 1000 字评报 |
| 自定义大模型 | ✅ 已交付 | 粘贴 Python API 示例自动识别配置，支持任意 OpenAI 兼容模型 |
| 外部抓取接入 | ✅ 已交付 | 标准 API 对接外部抓取服务，Mock 联调已通 |

## 技术栈

- **Framework**: Next.js 16 (App Router) · React 19 · TypeScript 5 (strict)
- **UI**: shadcn/ui（Radix UI）+ Tailwind CSS 4
- **数据库**: Supabase (PostgreSQL 15)，drizzle-orm 管理 schema
- **AI**: OpenAI 兼容协议（任意模型），沙箱内可回退豆包
- **认证**: 内部账号体系，HMAC SHA-256 无状态会话（cookie）

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9
- Supabase 项目（或任意 PostgreSQL 15+）

### 1. 克隆与安装

```bash
git clone <your-repo-url>
cd projects
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 Supabase 连接信息、会话密钥、AI 模型配置
```

详见 [.env.example](.env.example) 中的注释。

### 3. 初始化数据库

项目使用 drizzle-orm 管理 schema，表结构定义在 `src/storage/database/shared/schema.ts`。

```bash
# 方式 A：使用 Supabase CLI（推荐）
npx supabase db push

# 方式 B：手动执行 SQL（见 docs/sql/ 或 drizzle-kit generate 输出）
npx drizzle-kit generate
npx drizzle-kit push
```

### 4. 写入种子数据

```bash
# 写入全局配置（分类/线索类型/评报维度/阈值/ingest token）
pnpm tsx scripts/seed-config.ts

# 创建管理员/编辑账号
pnpm tsx scripts/seed-users.ts

# 导入媒体列表 + 新闻日历（从 assets/ 解析）
pnpm tsx scripts/import-data.ts
```

默认账号：`admin / newsdesk2026`（管理员）、`editor / newsdesk2026`（编辑）。

### 5. 启动开发服务器

```bash
pnpm dev
# 访问 http://localhost:3000
```

### 6. 构建与生产部署

```bash
pnpm build
pnpm start
# 默认监听 3000 端口，可通过 PORT 环境变量修改
```

## 独立部署

项目不依赖任何扣子专属运行时，可在标准 Node.js 环境中运行。详见 [DEPLOY.md](DEPLOY.md)。

### 部署清单

1. **数据库**：准备 Supabase 项目或自建 PostgreSQL 15+，执行 schema 初始化
2. **环境变量**：按 `.env.example` 配置，至少需要 `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SESSION_SECRET`
3. **AI 模型**：通过后台「接入大模型」页面配置，或在 `.env` 中设置 `DEFAULT_LLM_*` 三个变量
4. **外部抓取服务**：独立部署抓取服务，通过 `GET /api/ingest/queue` 拉队列、`POST /api/ingest/articles` 回推文章，鉴权 token 为 `INGEST_API_TOKEN`
5. **反向代理**：Nginx / Caddy 等，配置 HTTPS、WebSocket 代理

### Docker 部署（参考）

```dockerfile
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

```bash
docker build -t news-workbench .
docker run -d --env-file .env -p 3000:3000 news-workbench
```

## 目录结构

```
src/
├── app/                    # Next.js App Router 页面与 API
│   ├── api/
│   │   ├── auth/           # 登录/登出/会话
│   │   ├── calendar/       # 新闻日历（前台 + 详情 + AI 建议）
│   │   ├── ingest/         # 外部抓取服务接入（queue / articles）
│   │   ├── admin/          # 后台管理 API（日历/分类/媒体/配置/LLM/ingest mock）
│   │   └── stats/          # 首页统计
│   ├── calendar/           # 新闻日历前台页面
│   ├── admin/              # 后台管理页面
│   └── login/              # 登录页
├── components/
│   ├── ui/                 # shadcn/ui 组件
│   ├── calendar/           # 日历看板、事件详情弹层
│   ├── admin/              # 后台各管理页客户端组件
│   └── app-shell.tsx       # 全局布局（侧边栏导航 + 登录态）
├── lib/
│   ├── db.ts               # Supabase 客户端
│   ├── config.ts           # app_config 读取（内存缓存）
│   ├── session.ts          # HMAC 会话签发/校验（Edge 安全，Web Crypto）
│   ├── password.ts         # scrypt 密码哈希（仅 Node 运行时）
│   ├── require-admin.ts    # API 管理员鉴权
│   ├── calendar-engine.ts  # 日历规则引擎（纯函数 + 单测）
│   ├── ingest.ts           # 外部抓取接入层（token 校验/入库去重/状态/日志）
│   ├── mock-ingest.ts      # Mock 外部服务（仿真文章，联调用）
│   ├── llm-client.ts       # 统一 AI 出口（自定义模型优先，回退豆包）
│   ├── llm-adapter.ts      # OpenAI 兼容直连适配器（SSE）
│   └── crawler/            # 沙箱 PoC 代码（主流程不依赖）
├── middleware.ts           # 登录态校验（Edge）
└── storage/database/       # drizzle schema + Supabase 客户端工厂
scripts/                    # seed-config / seed-users / import-data
assets/                     # 媒体列表.xlsx、新闻日历.docx（导入源文件）
```

## 核心设计原则

1. **配置驱动**：工作流代码禁止硬编码业务阈值，运行时一律从 `app_config` 表读取
2. **AI 与规则分工**：确定性判断走规则（纯函数 + 单测），模糊判断走 AI（结构化 JSON + confidence 路由）
3. **抓取解耦**：主系统不直接抓外网，通过标准 API 对接外部抓取服务；单源失败不影响主系统
4. **密钥安全**：自定义模型 API Key 仅存后端内存，不落库不写日志；ingest token 可后台轮换

## 开发命令

```bash
pnpm install                      # 安装依赖
pnpm dev                          # 开发服务器（HMR）
pnpm build                        # 构建生产版本
pnpm start                        # 启动生产服务
pnpm ts-check                     # TypeScript 类型检查
pnpm lint                         # ESLint 检查
pnpm tsx scripts/seed-config.ts   # 写入配置种子
pnpm tsx scripts/seed-users.ts    # 创建账号
pnpm tsx scripts/import-data.ts   # 导入媒体 + 日历数据
pnpm tsx --test src/lib/calendar-engine.test.ts  # 日历引擎单测
```

## 许可证

内部项目，仅限授权范围内使用。
