# AGENTS.md — AI 新闻辅助工作台

## 独立部署

项目不依赖扣子专属运行时，可在标准 Node.js 环境独立部署。所有敏感配置通过环境变量注入：

- **数据库**：`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（兼容 `COZE_` 前缀）
- **会话密钥**：`SESSION_SECRET`
- **AI 模型**：`DEFAULT_LLM_BASE_URL` / `DEFAULT_LLM_API_KEY` / `DEFAULT_LLM_MODEL`（或通过后台「接入大模型」页面配置）
- **抓取令牌**：`INGEST_API_TOKEN`（或 `app_config` 表 `ingest.api_token`）
- **端口/域名**：`PORT` / `NEXT_PUBLIC_SITE_URL`

详见 `.env.example` 和 `DEPLOY.md`。

## 项目概览

面向广州日报编辑的内部 AI 新闻辅助工作台，按 PRD V1.0 分三阶段交付：**新闻日历**（已完成 M0+M1）→ **新闻线索**（已完成 M3）→ **每日评报**（已完成 M4）。工作流内置在 Next.js 后端（API Routes + 后续 cron 调度），核心原则是**配置驱动 + 前台临时条件**：媒体名单、日历分类、展示/生成规则入库（`app_config`），具体"这次怎么筛、怎么评"由用户在前台条件区临时选择（类似知网高级检索），临时条件不回写后台默认规则。

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
│   ├── leads/                # 新闻线索（前台：线索卡片 + 每周简报）
│   ├── review/               # 每日评报（前台：条件区 + SSE 流式结果 + 历史评报）
│   ├── admin/                # 后台：calendar / categories / media / leads / review / config
│   └── api/
│       ├── auth/             # login / logout / me
│       ├── calendar/         # 前台日历查询 + categories
│       ├── medias/           # 媒体下拉（scope=review 返回 monitor_review 媒体）
│       ├── leads/            # 前台线索 + weekly（历史简报）
│       ├── review/           # 【M4】历史评报列表 / [id] 详情
│       ├── stats/            # 首页统计
│       ├── ingest/           # 【外部抓取服务接入】queue(拉队列) / articles(回推文章)，ingest token 鉴权
│       └── admin/            # calendar / categories / media / sources / articles / ingest/mock / config / llm / leads / review / scheduler（全部 requireAdmin）
├── components/
│   ├── ui/                   # shadcn/ui
│   ├── app-shell.tsx         # 全局布局（侧边栏导航 + 登录态）
│   ├── calendar/             # 日历看板、事件详情弹层
│   ├── leads/                # 线索卡片、线索看板（前台条件区）
│   ├── review/               # 评报条件区(review-filter)、结构化结果(review-result)
│   └── admin/                # 后台各管理页客户端组件（含线索/评报展示规则配置）
├── lib/
│   ├── db.ts                 # Supabase 客户端
│   ├── config.ts             # app_config 读取（getAppConfig 内存缓存）
│   ├── session.ts            # 【Edge 安全】HMAC 会话签发/校验，只用 Web Crypto（禁 node:crypto）
│   ├── password.ts           # scrypt 密码哈希（仅 Node 运行时）
│   ├── require-admin.ts      # API 管理员鉴权
│   ├── calendar-engine.ts    # 日历规则引擎（纯函数，周年/窗口/置信度，含单测）
│   ├── clue-engine.ts        # M3 线索识别（结构化 JSON + 置信度路由 + clue_name）
│   ├── clue-pipeline.ts      # M3 批量识别流水线（扫未处理文章→合并→入库）
│   ├── review-engine.ts      # 【M4】评报：规则筛稿→AI 结构化四区块→SSE 流式总结→落库 daily_review
│   ├── review-types.ts       # 评报结构化类型（ReviewModule/DisplayRules/GenerationRules）
│   ├── weekly-briefing.ts    # M3 每周简报（SSE + Markdown 四段拆分）
│   ├── ingest.ts             # 外部抓取接入层：token 校验、文章去重入库、数据源状态、task_log
│   ├── mock-ingest.ts        # Mock 外部服务（仿真文章，仅联调，不发真实网络请求）
│   ├── llm-client.ts         # 统一 AI 出口（自定义 OpenAI 兼容模型优先，失败回退豆包）
│   ├── llm-adapter.ts        # OpenAI 兼容直连适配器（SSE）
│   └── crawler/              # 【沙箱 PoC，主流程不依赖】直连媒体站点测试用
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

## 待办与已知问题

### 待办：自定义大模型接入（M1.5，暂不开发，等用户确认）

**入口**：左侧功能栏（`app-shell.tsx` 导航）增加「接入大模型」按钮，点击打开「大模型设置」弹窗。目的：允许用户自带 OpenAI 兼容的第三方模型（不限定服务商，不固定为 DeepSeek），覆盖平台默认的豆包 `coze-coding-dev-sdk`。

**两种配置方式**：
1. 粘贴完整 Python API 调用示例（默认推荐，多行代码框，标题「粘贴 Python API 调用示例」，支持注释/换行/缩进/中文说明/英文引号与中文弯引号）。
2. 手动填写 API Key / API 地址(base_url) / 模型名称。
代码框下方提示：「请粘贴平台提供的完整 Python API 示例。系统只会识别配置信息，不会执行这段代码。」按钮：「自动识别配置」「清空」。

**自动识别（纯文本/正则解析，禁止执行代码）**：
- 提取 OpenAI 构造函数的 `api_key`、`base_url`；`chat.completions.create` 的 `model`、`stream`、`max_completion_tokens`；`extra_body` 中可安全转 JSON 的配置。
- 最少必须识别出：API Key、API 服务地址、模型名称，否则提示缺失项。
- 模型服务商与实际模型以示例中的 base_url / model 为准，不写死服务商。

**解析安全红线（最高优先级）**：
- **绝对禁止执行粘贴的 Python 代码**：禁用 eval/exec/动态 import/子进程/临时 py 文件；代码只当普通文本处理。
- 建议在**浏览器前端**做正则解析（先把中文弯引号 `‘’“”` 转成英文引号），原始 Python 代码**绝不上传后端、不落盘、不存 localStorage/sessionStorage/数据库/文件/日志**；只把识别出的配置项提交。
- 只提取字符串/数字/布尔/字典/列表等静态字面量；忽略 messages、循环、print 等无关代码；无法安全识别的直接忽略。
- `os.getenv` 无真实密钥时提示用户手动填 API Key。

**识别结果确认区**（可编辑）：API Key 脱敏显示（如 `abcd****wxyz`）、API 地址完整、模型名完整、流式开关、其他参数折叠。按钮：测试连接 / 保存并启用 / 返回修改 / 取消。

**密钥安全**：
- 前端不直连模型 API；API Key 只提交后端，由后端转发调用。
- Key 只存**后端运行时内存**（不落库、不写文件/日志/源码/README），服务停止即清除；前端不能回取完整 Key；错误提示不得包含完整 Key。
- 后端新增 OpenAI 兼容的直连适配器（base_url + api_key + model，fetch/SSE），与现有豆包 `LLMClient` 并存。

**连接测试**：用识别出的地址/Key/模型发最小请求；加载态；成功提示「模型连接成功」，失败提示检查 Key/地址/模型名；**测试成功后才可「保存并启用」**。

**接入现有功能（适配本项目，文案中的"订单详情/排产/Mock"为其他系统术语）**：
- 连接成功后入口按钮显示「模型已连接」。
- 所有 AI 功能（日历「AI 选题策划建议」、后续 M3 线索 AI 识别、M4 评报 AI 生成）优先走自定义模型，未配置则回退平台豆包。
- 统一展示「AI 结果仅供辅助，最终结果需人工确认」；提供「切回默认模型（平台豆包）」入口。
- AI 调用失败不得影响原页面；**不修改 assets 下 xlsx/docx 文件**。

**验收测试清单（6 项，开发时必测）**：
1. 完整多行 Python 示例；2. 带中文注释；3. 使用中文弯引号；4. 缺模型名称（应提示缺失）；5. 含恶意 Python 语句（如 `import os; os.system(...)`，必须只被当文本忽略、绝不执行）；6. 手动输入 API Key 方式。必须确认任何粘贴代码都不会被执行。

### 其他
- 暂无高优先级遗留。日历详情弹层已修复并增强（见下）。

## 已完成增强

- **日历详情弹层**：`/api/calendar/[id]` 已改为二次查询（外键关联不可用）；弹层展示 description/tags/source_name/周年/审核状态等完整字段；
  `POST /api/calendar/[id]/summary` 通过 SSE 流式调用豆包大模型生成「AI 选题策划建议」（`coze-coding-dev-sdk` 的 `LLMClient.stream()`，nodejs runtime，SSE `data:` 分片 + `[DONE]`）。

## 抓取架构（M2 已定稿：抓取能力解耦）

沙箱出口网络无法稳定访问外部媒体站点（反爬/超时），故抓取能力从主业务解耦：

- **外部抓取服务**（独立部署）：只负责抓原始文章（标题/正文/发布时间/URL）。
  - `GET /api/ingest/queue`：拉取启用中的数据源队列（`Authorization: Bearer <ingest_token>`）。
  - `POST /api/ingest/articles`：批量回推文章与源级成败；主系统做去重入库（`article.content_hash` 唯一）、状态更新（`media_source.crawl_status` ok/warning/error、`fail_count`、`last_ingest_at`、`last_error`）、`task_log`（workflow=`ingest`）记录。
  - 鉴权 token 为配置项 `ingest.api_token`（后台「系统配置」可轮换，默认 `newsdesk-ingest-2026`）。
- **主系统**：媒体配置、任务编排、article 入库去重、状态记录、AI 线索识别/同题聚类/评报。单个源失败只标记状态，绝不影响主系统页面。
- **Mock 联调**：`POST /api/admin/ingest/mock`（管理员）生成仿真文章走完整 ingest 链路；`GET /api/admin/articles` 查看已入库文章。`src/lib/mock-ingest.ts` 不发真实网络请求。
- `src/lib/crawler/*` 为沙箱直连 PoC 代码，仅后台「沙箱直连测试」按钮使用，不在每日工作流中。

## 已完成：M3 新闻线索

- **识别引擎** `src/lib/clue-engine.ts`：AI 从文章标题+正文识别四类线索（new_column 新栏目 / series 系列报道 / special_topic 专题 / feature_plan 特色策划），输出结构化 JSON（series_name/topic/tags/summary/confidence/reason）。阈值 `ai.confidence_auto`(0.85) / `ai.confidence_review`(0.6) 路由：≥0.85 auto_approved、0.6~0.85 pending_review、<0.6 rejected。
- **流水线** `src/lib/clue-pipeline.ts`：扫 `article.clue_processed=false` 的文章 → 逐篇 AI 识别 → 同 media+series_key 合并（article_count 累加、更新 last_seen_at）→ 写 `news_clue` → 标记文章已处理 → 写 `task_log`(workflow=`clue_identify`)。入口 `POST /api/admin/leads/identify`（管理员触发，后续接 cron 每日 9 点）。
- **接口**：`GET /api/leads`（前台，仅 auto_approved/approved，支持 date/type/media 筛选分页）、`GET /api/admin/leads`（后台全量+stats）、`POST /api/admin/leads/[id]/review`（审核 approve/reject/可改字段）。
- **每周简报** `src/lib/weekly-briefing.ts`：汇总近 7 天已发布线索 → AI 流式输出 Markdown 四段简报（新栏目/重点系列/关注专题/特色策划 + 总览）→ `parseMarkdownBriefing` 按二级标题拆分存 `weekly_brief` 表。`POST /api/admin/leads/weekly`（SSE 流式）、`GET /api/leads/weekly`（历史列表）。
- **页面**：前台 `/leads`（卡片列表，置信度进度条/标签/追踪篇数）、`/leads/weekly`；后台 `/admin/leads`（识别触发按钮 + 待审队列 + 审核弹窗）。**入口已挂到「系统管理 → 新闻线索管理」卡片**。
- `article` 表增加 `clue_processed` 标记列。Mock 文章可直接触发识别验证。

## 已完成：M4 每日评报

- **交互模式（前台条件优先）**：`/review` 顶部条件区（日期/对比媒体/最低字数/版面信号/评报维度/关注主题/同行遗漏扫描/自定义要求），用户每次临时选择，不回写后台。默认媒体 = `media.monitor_review=true` 的媒体（`GET /api/medias?scope=review` 动态加载，不硬编码媒体名）。
- **引擎** `src/lib/review-engine.ts`：
  - `fetchReviewArticles` 规则层筛稿（日期/媒体/字数/去重/已启用源），返回文章 + `gzMediaNames`（媒体名含「广州日报」即广州日报系，用于同行遗漏扫描）。
  - `analyzeStructure` 非流式调用 AI 输出结构化四区块 JSON：today_focus 今日重点 / same_topic 同题观察(含对比表 rows) / peer_highlights 同行亮点 / gz_daily 广州日报观察。模块开关、数量、摘要长度、语言风格读 `review.generation_rules`。
  - `streamFinalReview` 基于结构化结果 SSE 流式生成 ≤ 字数上限的自然语言总结（今日重点→同题差异→同行亮点→广州可借鉴）。
  - `saveDailyReview` 落库 `daily_review`（sections JSONB + final_summary），按 report_date upsert，version+1。
- **接口**：`POST /api/admin/review/generate`（SSE，事件 fetching/analyzing/structure/final*/saved/warning/error）、`GET /api/review`（历史列表+summary_preview）、`GET /api/review/[id]`（详情，sections 还原成 modules 数组 + 合并当前 display_rules）。
- **展示规则驱动**：`review.display_rules`（show_media_name/show_article_title/show_article_url/show_evidence/show_comparison_table + modules 开关）控制 `review-result.tsx` 动态渲染；后台 `/admin/review` 分「生成规则」「展示规则」两块配置。
- **版面信号降级**：整版/跨版/头版等外部抓取可能缺失，缺失时按字数 + AI 判断降级，不致任务失败。

## 已完成：M5 定时调度（cron）

- **调度器** `src/lib/scheduler.ts`：无状态、幂等，三个任务 `clue_identify`（每日 9 点线索识别）/ `weekly_briefing`（每周一 10 点简报）/ `daily_review`（每日 10:30 评报）。复用现有 headless 引擎（runCluePipeline / generateWeeklyBriefing / fetchReviewArticles+analyzeStructure+streamFinalReview+saveDailyReview），每次写 `task_log`，进程内 Set + task_log 防重入。
- **触发方式**：`POST /api/cron/{job}`（外部 crontab / Vercel Cron / 云函数，用 `Authorization: Bearer <CRON_SECRET>` 鉴权，也接受 admin cookie）；后台「系统管理 → 定时任务」（`/admin/scheduler`）可配置开关与 cron 表达式、查看运行日志、点「立即执行」手动触发（`POST /api/admin/scheduler/run`，manual 不受开关限制）。
- **配置**：`app_config` key `scheduler.jobs`（jobs 名 → {enabled, cron}）；`CRON_SECRET`（兼容 `CRON_TOKEN`）为环境变量，未配置时外部调用 401、后台手动触发仍可用。
- **不在进程内跑 setInterval**（多实例会重复触发）；由外部定时器按时调用。crontab 示例见 `DEPLOY.md`「定时任务」。
- middleware 已放行 `/api/cron`（route 内自鉴权）。

## 后续阶段（M5）

- M5 反馈调优：收集漏报/误报，调阈值与 Prompt（`ai_audit_log` 表已就绪）。
- 真实数据：等外部抓取服务部署后，用真实文章回归完整链路（当前 article 多为 Mock 短稿，评报验证时需放宽 minWordCount）。

设计文档见 `docs/superpowers/specs/2026-09-06-news-workbench-design.md`，设计语言见 `DESIGN.md`。
