# AGENTS.md — AI 新闻辅助工作台

## 项目概览

面向广州日报编辑的内部 AI 新闻辅助工作台，按 PRD V1.0 分三阶段交付：**新闻日历**（已完成 M0+M1）→ **新闻线索**（M3，占位）→ **每日评报**（M4，占位）。工作流内置在 Next.js 后端（API Routes + 后续 cron 调度），核心原则是**配置驱动**：媒体名单、日历分类、重要等级、阈值、线索类型、评报维度、cron 时间全部入库，业务规则变化只改配置不改主流程。

- **Framework**: Next.js 16 (App Router) · React 19 · TypeScript 5 (strict)
- **UI**: shadcn/ui（`src/components/ui/`）+ Tailwind CSS 4
- **数据库**: Supabase (Postgres 15)，通过 drizzle-kit 管理 schema
- **认证**: 内部账号体系，HMAC 签名无状态会话（cookie `nwb_session`），角色 admin / editor

## 常用命令

```bash
pnpm install                      # 安装依赖（仅用 pnpm）
pnpm tsx scripts/seed-config.ts   # 写入配置/分类/线索类型/评报维度种子（幂等 upsert）
pnpm tsx scripts/seed-users.ts    # 创建 admin / editor 账号（幂等）
pnpm tsx scripts/import-data.ts   # 从 assets/ 导入媒体表 + 新闻日历（幂等，按 name/dedup_key 去重）
pnpm tsx --test src/lib/calendar-engine.test.ts   # 日历规则引擎单元测试
pnpm dev / pnpm build             # 开发 / 构建
```

默认账号：`admin / newsdesk2026`（系统管理员）、`editor / newsdesk2026`（值班编辑）。

## 数据库

- Schema 定义：`src/storage/database/shared/schema.ts`（drizzle）。改表后执行 `coze-coding-ai db upgrade` 同步。
- 客户端：`src/lib/db.ts` 导出 `supabase()`（服务端 service-role），**不要**直接改 `src/storage/database/supabase-client.ts`。
- **表/列名以数据库实际为准**（drizzle 会做复数/驼峰转换），主要映射：
  - 用户表 `app_user`（列 `enabled`，无 is_active）
  - 配置表 `app_config`（列 `key` / `value` / `description`）
  - 媒体表 `media`（列 `media_level`，非 level）
  - 日历事件 `calendar_event`：用 `description`（无 background/notes）、`source_name`（无 source）、**无** planning_hint/tags/confidence 列
  - 分类表 `calendar_category`（含 `code`/`color`/`category_name`）
- **Supabase 外键嵌套关联查询不可用**（PostgREST 报 "Could not find a relationship"），关联数据一律用「主查询 + 按 id 批量二次查询 + Map 组装」的方式。

## 目录结构

```
src/
├── app/
│   ├── page.tsx              # 首页（工作台聚合）
│   ├── login/                # 登录页
│   ├── calendar/             # 新闻日历（前台，编辑可见）
│   ├── leads/ review/        # 新闻线索 / 每日评报（M3/M4 占位页）
│   ├── admin/                # 后台：calendar / categories / media / config / review
│   └── api/
│       ├── auth/             # login / logout / me
│       ├── calendar/         # 前台日历查询 + categories
│       ├── stats/            # 首页统计
│       └── admin/            # calendar / categories / media / sources / config（全部 requireAdmin）
├── components/
│   ├── ui/                   # shadcn/ui
│   ├── app-shell.tsx         # 全局布局（侧边栏导航 + 登录态）
│   ├── calendar/             # 日历看板、事件详情弹层
│   └── admin/                # 后台各管理页客户端组件
├── lib/
│   ├── db.ts                 # Supabase 客户端
│   ├── config.ts             # app_config 读取（getAppConfig 内存缓存）
│   ├── session.ts            # 【Edge 安全】HMAC 会话签发/校验，只用 Web Crypto（禁 node:crypto）
│   ├── password.ts           # scrypt 密码哈希（仅 Node 运行时）
│   ├── require-admin.ts      # API 管理员鉴权
│   └── calendar-engine.ts    # 日历规则引擎（纯函数，周年/窗口/置信度，含单测）
├── middleware.ts             # 登录态校验（Edge，只可引用 session.ts）
└── hooks/use-current-user.ts # 前端当前用户
scripts/                      # seed-config / seed-users / import-data
assets/                       # 媒体列表.xlsx、2024年新闻日历.docx（导入源文件）
```

## 核心开发规范

1. **配置驱动**：工作流代码禁止出现业务阈值常量（14 天、0.85、2000 字、cron 时间等），运行时一律从 `getAppConfig()` 读取；改规则只改 `app_config` 或后台配置页。
2. **AI 与规则分工**：确定性判断（14 天窗口、周年计算、字数、媒体启用、去重）走规则（纯函数 + 单测）；模糊判断（新栏目识别、同题聚类、评报写作）走 AI，AI 必须输出结构化 JSON + confidence，按 `ai.confidence_auto`(0.85) / `ai.confidence_review`(0.6) 路由。
3. **日历规则引擎** `calendar-engine.ts` 是纯函数（输入事件数组 + 今天日期，不碰 DB），改动须同步 `calendar-engine.test.ts` 并跑通。
4. **Middleware / Edge 约束**：`src/middleware.ts` 只能引用不依赖 `node:crypto` 的模块——会话逻辑在 `session.ts`（Web Crypto，HMAC SHA-256），密码哈希在 `password.ts`（scrypt，仅 API Route 用）。两者不可混用。
5. **Hydration**：动态内容（当前日期、登录态）必须在客户端 useEffect 后渲染，禁止在服务端渲染期用 Date.now()/Math.random()/window。
6. **类型严格**：禁隐式 any / as any；API 入参显式校验；所有 catch 错误收窄后再返回。

## 后续阶段（M2–M5）

- M2 数据源 PoC：媒体电子报/官网抓取适配器，结果写 `media_source.crawl_status`（untested/ok/failed），抓不稳不进自动任务。电子报版面信号（整版/跨版/头版）可能拿不到，评报先按字数+AI 降级。
- M3 新闻线索：WF03 抓取 → 去重（按 media+series 聚合，更新 first_seen_at）→ AI 识别卡片 → 每日列表 + 每周简报，AI 结果走 confidence 路由进 `news_clue` 审核队列。
- M4 每日评报：文章先 AI 压成结构化卡片（不塞全文）→ embedding 粗聚 + AI 确认同题 → 六维比较（配置 `review.dimension.*`）→ SSE 流式生成约 1000 字评报。
- M5 反馈调优：收集漏报/误报，调阈值与 Prompt。

设计文档见 `docs/superpowers/specs/2026-09-06-news-workbench-design.md`，设计语言见 `DESIGN.md`。
