# 独立部署指南

本文档说明如何将 AI 新闻辅助工作台部署到独立服务器（不依赖扣子运行时）。

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                      独立服务器                                │
│                                                              │
│  ┌─────────────┐    ┌──────────────────────────────────────┐ │
│  │   Nginx     │───▶│  Next.js (port 3000)                 │ │
│  │  (HTTPS)    │    │  - 前台页面（日历/线索/评报）          │ │
│  │  :443       │    │  - 后台管理 API                       │ │
│  └─────────────┘    │  - 外部抓取接入 API (/api/ingest/*)   │ │
│                     └──────────────┬───────────────────────┘ │
│                                    │                         │
└────────────────────────────────────┼─────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              ┌─────▼─────┐  ┌──────▼──────┐  ┌─────▼─────┐
              │ Supabase  │  │ LLM 服务    │  │ 外部抓取  │
              │ (Postgres)│  │ (OpenAI兼容)│  │  服务     │
              └───────────┘  └─────────────┘  └───────────┘
```

## 前置条件

| 组件 | 要求 | 说明 |
|------|------|------|
| Node.js | >= 20 | 推荐 LTS 版本 |
| pnpm | >= 9 | `corepack enable` 即可 |
| PostgreSQL | 15+ | 可用 Supabase 托管或自建 |
| 域名 | 已备案 | 需 HTTPS 证书 |

## 步骤一：准备数据库

### 方案 A：Supabase 托管（推荐）

1. 在 [supabase.com](https://supabase.com) 创建项目
2. 记录以下信息：
   - Project URL（`https://xxx.supabase.co`）
   - Anon Key（公开）
   - Service Role Key（服务端专用，**切勿泄露**）
3. 使用 Supabase SQL Editor 执行 `src/storage/database/shared/schema.ts` 对应的 SQL 建表

### 方案 B：自建 PostgreSQL

1. 创建数据库并启用 UUID 扩展：
   ```sql
   CREATE DATABASE news_workbench;
   \c news_workbench
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
2. 使用 drizzle-kit 生成并执行迁移：
   ```bash
   npx drizzle-kit generate
   npx drizzle-kit push
   ```

## 步骤二：配置环境变量

```bash
cp .env.example .env
```

**必填项**（最小启动配置）：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
SESSION_SECRET=$(openssl rand -hex 32)
```

**推荐配置**：

```env
# AI 模型（不配则需后台手动配置）
DEFAULT_LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
DEFAULT_LLM_API_KEY=your-key
DEFAULT_LLM_MODEL=doubao-pro-32k

# 外部抓取服务 token
INGEST_API_TOKEN=newsdesk-ingest-2026

# 对外域名
NEXT_PUBLIC_SITE_URL=https://news.your-domain.com

# 端口
PORT=3000
NODE_ENV=production
```

## 步骤三：初始化数据

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 写入种子数据（幂等，可重复执行）
pnpm tsx scripts/seed-config.ts
pnpm tsx scripts/seed-users.ts
pnpm tsx scripts/import-data.ts
```

## 步骤四：启动服务

### 直接启动

```bash
pnpm start
# 监听 0.0.0.0:3000
```

### PM2 守护进程（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start pnpm --name news-workbench -- start

# 设置开机自启
pm2 startup
pm2 save
```

### Docker 部署

```dockerfile
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm build

# 生产环境可移除 devDependencies
# RUN pnpm prune --prod

EXPOSE 3000
ENV NODE_ENV=production
CMD ["pnpm", "start"]
```

```bash
docker build -t news-workbench .
docker run -d \
  --name news-workbench \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  news-workbench
```

## 步骤五：配置反向代理

### Nginx 示例

```nginx
server {
    listen 443 ssl http2;
    server_name news.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/news.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/news.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name news.your-domain.com;
    return 301 https://$host$request_uri;
}
```

## 步骤六：外部抓取服务对接

外部抓取服务（独立部署）通过以下 API 与主系统对接：

### 拉取待抓取队列

```
GET /api/ingest/queue
Authorization: Bearer <INGEST_API_TOKEN>
```

返回启用中的数据源列表（sourceId / mediaId / sourceType / sourceUrl / crawlMethod）。

### 回推文章

```
POST /api/ingest/articles
Authorization: Bearer <INGEST_API_TOKEN>
Content-Type: application/json

{
  "results": [
    {
      "sourceId": "xxx",
      "success": true,
      "articles": [
        {
          "title": "文章标题",
          "url": "https://...",
          "publishedAt": "2026-01-01T00:00:00Z",
          "content": "正文内容（可选）",
          "wordCount": 1234
        }
      ]
    }
  ]
}
```

主系统自动完成：
- `content_hash` 去重（同 URL 不重复入库）
- 更新数据源状态（ok / warning / error + 连续失败计数）
- 记录 `task_log`（workflow=ingest）
- 单个源失败不影响其他源和主系统

### 鉴权令牌

默认 `newsdesk-ingest-2026`，可在后台「系统配置」页面修改（key: `ingest.api_token`），或直接修改 `.env` 中的 `INGEST_API_TOKEN`。

## 步骤七：验证部署

1. 访问 `https://news.your-domain.com`，应跳转到登录页
2. 使用 `admin / newsdesk2026` 登录
3. 进入「系统管理 → 媒体与数据源」，点击「模拟外部推送」验证 ingest 链路
4. 进入「新闻日历」，点击任意节点查看 AI 选题建议（需 AI 模型已配置）
5. 检查日志无报错：`pm2 logs news-workbench` 或 `docker logs news-workbench`

## 常见问题

### Q: 登录后页面空白 / 401

检查 `SESSION_SECRET` 是否设置。未设置时使用开发默认值，生产环境可能被中间件拒绝。

### Q: AI 功能报错「无可用的 LLM 配置」

两种方式任选：
1. 后台「接入大模型」页面配置（运行时内存，重启后需重新配置）
2. `.env` 中设置 `DEFAULT_LLM_BASE_URL` / `DEFAULT_LLM_API_KEY` / `DEFAULT_LLM_MODEL`

### Q: 数据库连接失败

确认 `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 三个变量均已正确设置。可在 Supabase Dashboard → Settings → API 中查看。

### Q: 外部抓取服务连不上

确认：
1. 主系统已启动且 `/api/ingest/queue` 可达
2. `Authorization: Bearer <token>` 中的 token 与主系统配置一致
3. 网络可达（同一内网或公网可访问）

### Q: 如何轮换 ingest token？

后台「系统配置」页面修改 `ingest.api_token`，或修改 `.env` 中的 `INGEST_API_TOKEN` 后重启服务。外部抓取服务需同步更新 token。

## 安全建议

1. **SESSION_SECRET**：使用 `openssl rand -hex 32` 生成，至少 32 字符
2. **SUPABASE_SERVICE_ROLE_KEY**：仅服务端使用，切勿暴露到前端代码或日志
3. **INGEST_API_TOKEN**：定期轮换，外部抓取服务同步更新
4. **HTTPS**：生产环境必须启用 HTTPS，避免中间人攻击
5. **防火墙**：仅开放 80/443 端口，3000 端口仅对内
6. **日志**：确保日志中不打印完整 API Key 或 token
