# 本地接管：第 1～3 阶段结果

**2026-09-18最新：[自动抓取与线索日志修复](news-workbench/docs/CLUE-TASK-REPAIR.md)。三家真实Windows补跑HTTP推送27篇，新增6篇，自动识别6篇／DeepSeek6次成功；空输入日志与运行摘要已补齐。下文为此前记录。**

**当前最新：[真实自动任务与试跑](news-workbench/docs/AUTOMATIC-TASKS.md)。Windows每日07:30日历推荐、08:30三家媒体抓取后自动识别线索，真实调度已试跑；下文为较早阶段记录。**

[三家真实媒体 PoC](news-workbench/docs/REAL-MEDIA-POC.md)：28篇真实原文核对入库，Mock默认隔离，真实正文补全及评报保存已验证。

最新：[A/B实际执行与持久化验收](news-workbench/docs/DATABASE-ACCEPTANCE-UPDATE.md)。共享数据库A/B已提交，历史新增108条、当前30天12条，日历/线索/评报HTTP持久化通过；完整浏览器操作及真实媒体PoC尚待完成。下文此前缺凭据/未迁入的结论属于历史记录。

最新结果见[现有功能 PASS / FAIL 清单](news-workbench/docs/ACCEPTANCE-REPORT.md)：生产构建、DeepSeek、HTTP Mock ingest通过；共享数据库缺结构且无SQL凭据，日历/选稿/任务未通过。历史实际迁入0条，108条/当前30天12条仅为去重计划。

检查日期：2026-09-17。工程基线和日历只读诊断完成；主系统能够构建、启动、登录和打开页面，但日历数据 API 仍受共享数据库缺失字段阻塞，不能标记为全功能验收通过。

## 工程结构与边界

```text
GZdailydata/
├─ news-workbench/                 主系统，保留独立 Git 仓库
│  ├─ src/app/                     页面、认证、业务和 ingest API
│  ├─ src/lib/                     日历规则、线索、评报、AI 与状态管理
│  ├─ src/storage/database/shared/ 数据库 schema
│  ├─ sql/                         现有迁移；本轮未执行
│  ├─ scripts/                     原脚本 + 本地启动与只读验收入口
│  ├─ docs/db-review/              只读 preflight 与未获批 SQL 提案
│  └─ scraper/                     暂留的抓取副本，仅比对、不新增、不删除
├─ media-scraper/                  唯一正式独立抓取服务，保留独立 Git 仓库
│  ├─ app/scrapers/                 媒体列表与详情解析
│  ├─ app/core/worker.py            拉队列、标准化、HTTP 回推
│  └─ config/                      媒体源配置
└─ PROJECT-STATUS.md               本报告
```

抓取服务只负责媒体网站 → 采集 → 标准化文章 → ingest HTTP。新闻线索、评报、AI 判断和入库去重归主系统。主系统仍有后台数据源测试接口引用 HTML crawler，本阶段保留，待抓取整合阶段收敛，不改核心业务引擎。

排除 CRLF/LF 后，两份抓取服务的 Python 源码只有 `app/core/worker.py` 存在文本差异，内置副本有列表过滤、通用标题提取、50 源分批回推修复。独立服务本轮未修改，副本未删除，未迁移这些修复。

## 最小修复

1. 备份开始时的 package、lockfile 和 workspace 文件至被 Git 忽略的 `news-workbench/logs/takeover-baseline/`。
2. 恢复仓库原 lockfile，避免本地 pnpm 11 重写产生的大范围依赖升级；使用指定 pnpm 9.0.0 通过 frozen 校验和实际完整安装。没有改动 dependency/devDependency 声明。
3. 补全 workspace 的 packages，修正 allowBuilds 占位值，同步原 sharp override。实际安装 sharp 0.35.4、lunar-typescript 1.8.6，所有声明依赖均存在。
4. 新增 dev:local / build:local / start:local。本地入口不依赖 Bash，在读取 .env 文件后选择端口，不抢占端口、不杀其他进程、不自动安装或初始化数据库；原扣子脚本保留。
5. 日历前端改用实际支持的 30 天视图 `view=month`；此前 `next30` 被规则引擎按未知视图回退到默认 14 天。没有改动日期规则引擎。
6. 日历与后台节点管理明确显示加载错误并提供重试；首页单独标记节点读取失败，仍展示已读到的新闻线索，避免数据库错误伪装为“没有节点”。
7. 补齐通用系统配置表单与后端的接口差异：GET 无 key 返回表单所需 10 项通用配置，缺失项显示现有运行默认值；PATCH 支持原表单请求并校验允许键、字符串值和重复项。保留原按 key GET 与 POST；本轮没有调用保存，没有写入默认值、token 或模型配置。
8. 新增只读数据库与 HTTP 审核脚本、运行说明和未执行的 SQL 审核材料；新增一项 30 天窗口边界回归测试。

Next.js 更新了生成文件 next-env.d.ts。没有重构新闻线索、评报、AI 模块，没有修改或提交密钥，没有 Git 提交或远端发布。

## 运行与验证

主系统保留在生产模式 `http://127.0.0.1:3001` 运行。浏览器的 localhost 连接在生产复查时失败，使用明确的 IPv4 地址可访问；Node HTTP 检查使用 localhost 正常。临时 3002 无 AI 配置实例已停止。

```powershell
cd news-workbench
corepack pnpm dev:local
# 或构建后启动生产模式：
corepack pnpm build:local
corepack pnpm start:local
```

验证结果：

| 检查 | 结果 |
|---|---|
| 原 lockfile frozen 安装 | 通过，pnpm 9.0.0 |
| 生产构建与 TypeScript | 通过，生成 51 个页面/路由构建单元 |
| 日历纯函数测试 | 9/9 通过，包含第 30/31 天边界 |
| 改动文件 ESLint | 0 错误，2 个原有未使用变量警告 |
| 登录 | 200，使用已有账号，不更新用户表 |
| 首页、日历、线索、评报、管理及 7 个管理子页 | 已登录 HTTP 均 200；日历 UI 明确报告数据加载失败 |
| 移除默认 LLM 地址/Key/模型的临时生产实例 | 登录和上述页面同样可打开；没有触发 AI |
| 新闻线索 API | 200，全量 12 条，当前 active 0 条；关联证据和识别不在本阶段验收范围 |
| 历史评报 API/页面 | 200，已有 1 条；浏览器可读取 2026-09-12 的 v2 摘要 |
| 日历分类、候选池、历史文件 API | 200，分别 8 类、130 条候选、8 个文件 |
| 系统配置 GET | 200，表单 10 项正常读取；保存接口未对共享库执行 |
| 定时任务状态 GET | 200；未触发任务，是否存在外部定时器未验证 |
| 正式日历 month/all 与后台节点 API | 500：calendar_event.deleted_at 不存在；未通过 |
| 当前日期选稿 GET | 404 暂无选稿；同时 review_draft 在 REST schema 中缺失，不能据此判断功能正常 |

两组 HTTP 验收脚本均退出 1，原因是日历真实故障，未把已知问题调整为“通过”。HTTP 与 DB 审核记录在被 Git 忽略的 `news-workbench/logs/takeover-baseline/`，不含密码、cookie、API Key 或配置值。

## 数据库身份与日历结论

项目所有者已确认 `reusdpelytqggjyhfsyh.supabase.co` 是扣子线上／共享数据库。当前本地应用直接访问它，没有另建或切换数据库。本轮仅 GET/SELECT，不执行建表、ALTER、seed、import、清理、AI 生成或候选确认。

当前读取到 article 461 条、媒体 135 家、数据源 266 个、线索 12 条、历史评报 1 条。

“未来30天无节点”涉及三项独立问题：

1. **API 结构错误**：正式日历查询引用的 deleted_at 在线上缺失，返回 500；此前前端将错误响应当作空列表。首页同时引用缺失的 event_year，曾静默降级为空。
2. **窗口请求错误**：前端 next30 不是规则引擎支持的视图，实际回退到 14 天；已修复为 month，不改变默认规则。
3. **正式数据没有当前窗口节点**：calendar_event 仅 3 条已启用/已审核节点，名称为“元旦”“元旦假期”“元旦假期”，下一发生日均为 2027-01-01，距检查当天 106 天。只读用现有规则引擎计算，未来30天为 0。

历史导入数据仍在库中：8 个文件、131 条历史节点（2026 年 126 条，2025 年 5 条）。其中 12 条的日期落在 2026-09-17～2026-10-17，包括广交会、广州解放纪念日、中秋节假期、国庆节假期等；这些是历史节点，尚不能当作已发布正式节点。

候选池 130 条全部 target_year=2027，127 条 pending、3 条 confirmed。因此不能把“历史文件导入成功／存在候选”当作“2026 未来30天正式节点已迁移”。当前 API 不读取 AI 推荐来决定既有正式节点的展示。

没有批量启用历史节点、没有修改候选目标年，也没有清理已有重复节点。这些需要确认业务规则后单独操作。

## 共享库缺失项与 SQL 审批

REST schema 与源代码比对发现：

- calendar_event 缺 event_year、source、deleted_at、delete_reason、deleted_by。
- calendar_category 缺 API 已引用的 color，本地 Drizzle schema 也漏此字段。
- news_clue 缺 recent_article_at。
- REST 未暴露 news_clue_article、review_draft、daily_review_revision 三张源 schema 已定义的表。

REST 检查不能完全区分物理缺表与 PostgREST schema cache/暴露配置问题；实际执行前必须做 SQL Editor 只读 preflight。未猜测为独立测试库，也未擅自运行 migration。

审核文件：

- `news-workbench/docs/db-review/preflight-readonly.sql`：物理结构与策略的只读确认。
- `news-workbench/docs/db-review/calendar-compatibility.proposed.sql`：提案 A，日历字段与分类颜色兼容。
- `news-workbench/docs/db-review/business-schema.proposed.sql`：提案 B，原业务表与线索时间字段补齐。
- `news-workbench/docs/db-review/README.md`：逐项影响和回滚条件。

提案 A 不删除或修改原有节点名称、日期、审核和启用状态；新增 source 对现有行默认 user_add、颜色默认 #6b6257，其他新增字段为 null。会短暂获取表锁，有超时保护。它不会产生 2026 年正式节点，历史来源元数据应另行审核。

提案 B 不修改现有文章/线索/评报，只增加空表与 nullable 字段；新表 RLS 仅开放给服务端 service_role。已有表若被其他部署建立，脚本会中止以免改变它们的权限。

两份脚本在事务失败时整体回滚；提交后只有在应用回退且新增数据未使用/已备份时才可安全撤销。删除已写入的新字段/表会丢失新增元数据，因此不能承诺无条件无损回滚。两份提案都未执行，也未放入自动迁移目录。

## 环境与后续范围

环境变量名称、用途、优先级、运行命令和审核脚本使用方法详见 `news-workbench/docs/LOCAL-DEV.md`。主系统现有 .env 已配置 Supabase、会话、DeepSeek 默认模型和 cron/token；.env.local 尚不存在，本阶段没有调整 AI 配置。

仍需处理：

1. 审批并执行必要的日历结构兼容，再复查正式节点 API；随后单独决定 2026 历史节点如何确认发布。
2. 业务表缺失影响线索关联、新鲜度依据、选稿和评报版本，本轮未做生成/写入验证。
3. ingest 鉴权当前未读取环境变量 INGEST_API_TOKEN；后续阶段最小修复并做真实 HTTP mock 测试。
4. DeepSeek 联网检索读取 DEFAULT_LLM_API_KEY + DEEPSEEK_SEARCH_MODEL，模板漏检索变量，服务/模型能力尚未验证。
5. 当前部分配置仍是早期键名（如 calendar.horizon_days、ai.confidence_auto）；本轮只显示现有运行默认值，不自动改名、初始化或覆盖共享库。
6. stats 的 todayLeads 查询引用旧 source_type 字段并静默返回 0；本阶段保留，后续小范围修复，统计 200 不能当作所有计数正确。
7. 定时状态仅有触发密钥不能证明外部定时器已部署；未执行真实任务。
8. 主系统 HTML 测试接口、抓取副本差异、独立服务环境与真实媒体 PoC 留到后续阶段。

本轮没有进入 ingest 写入、抓取真实 PoC、完整业务生成链路、部署或 UI polish。广州日报 → 南方日报 → 南方都市报的一家一家验证顺序保持不变。
