# 现有功能验收：2026-09-17

**当前最新：[三家真实媒体 PoC](REAL-MEDIA-POC.md)。28篇真实原文核对入库，Mock默认隔离，真实正文补全及评报保存已验证。下文为较早阶段历史记录，不作为当前结论。**

**最新结果以[数据库执行及持久化验收更新](DATABASE-ACCEPTANCE-UPDATE.md)为准：A/B已成功执行，实际迁入108条、当前30天12条，日历/线索/评报HTTP持久化专项通过。下文保留补齐结构前的历史验收记录。**

后续执行更新：用户已授权A/B既定结构范围，无需再次批准。已增加`scripts/apply-business-b.mjs`（默认只读，显式--apply执行、项目身份/物理字段预检、事务与run_id日志）。再次执行A/B均在凭据检查阶段BLOCKED，没有SQL写入：A run_id `aad0f6b5-c085-42d8-8d4b-2a3f7636b6f7`；B run_id `ab6c4dd6-3fb5-4a41-91ae-2c66f1d794ce`。本地仍无.env.local及SQL凭据。结构完成前未重复运行写入验收，也未开展媒体PoC。

结论：未通过全量验收。最新HTTP套件27项：15 PASS、12 FAIL。下表另包含浏览器与流式调用结果，不能与27项直接相加。FAIL（阻断）表示未满足依赖、未完成验收，不代表每个按钮已有独立缺陷。

最终生产构建、TypeScript通过，生产服务在 http://localhost:3001。生产只读复查12个页面均200，无Next错误页，但数据接口仍有失败。没有新增业务功能或做UI polish，media-scraper未改动，三家真实媒体PoC未开展。

## PASS / FAIL清单

| 模块 | 检查 | 结果 | 实测证据 / 限制 |
|---|---|---|---|
| 日历 | `/api/calendar` 200 | FAIL | 500：缺少`calendar_event.deleted_at` |
| 日历 | 当前30天应有节点 | FAIL | 现有正式表3条均计算到2027-01-01，历史12条未迁入 |
| 日历 | 首页未来7天节点 | FAIL | 预览200但日历告警，无具体节点 |
| 日历 | 列表/月历控件切换 | PASS | 浏览器切换选中状态正常；有数据渲染尚未通过 |
| 日历 | 有数据列表/月历、节点详情 | FAIL（阻断） | 查询失败，无可见节点可点击 |
| 日历 | 编辑、停用 | FAIL（阻断） | 临时验收节点创建500，缺少`event_year`；未修改线上既有节点 |
| 日历 | 删除及刷新后不再出现 | FAIL（阻断） | 同上；本地已排除软删除、防止PATCH复活，数据库实测未完成 |
| 首页 | 具体新闻节点 | FAIL | 日历结构缺失 |
| 首页 | 具体新栏目 | PASS | 湖南日报「新思想引领新征程」有具体内容，不代表识别链路通过 |
| 首页 | 最近一期评报预览 | FAIL | 当前首页无评报预览区域，按不新增功能要求未增设模块 |
| 首页 | 查看全部跳转 | PASS | 日历、线索实际跳转到对应页面 |
| 线索 | 基础查询 | PASS | 200、已有12条，关联证据缺失告警明确返回 |
| 线索 | Mock/已有文章识别新栏目入库 | FAIL | 缺少`news_clue.recent_article_at`、`news_clue_article` |
| 线索 | 原文链接打开 | FAIL（阻断） | 缺关联表，未完成真实线索链接验证；Mock的example.test不能当真实原文 |
| 线索 | 旧栏目不会重复出现 | FAIL（阻断） | 持久化链路不通；实际AI旧栏目排除内存检查PASS |
| 线索 | 确认新栏目 / 不是新栏目 | FAIL（未验收） | 无完整隔离线索可验收，未改变共享库已有业务判断 |
| 评报 | 最近一期历史、完整正文 | PASS | 2026-09-12 v2，正文932字，浏览器成功打开 |
| 评报 | 先出本期选稿 | FAIL | `review_draft`缺表，读取/保存500 |
| 评报 | 同题分组 | FAIL（阻断） | 实际AI内存分组PASS，HTTP选稿保存失败 |
| 评报 | 同行有、广州日报没有 | FAIL（阻断） | 内存命中PASS，完整新一期链路未通过 |
| 评报 | 新华社转载排除原创比较 | FAIL（阻断） | 内存引擎PASS，完整HTTP持久化未通过 |
| 评报 | 生成完整评报并保存 | FAIL | SSE HTTP200但流内报缺选稿表，不能算成功 |
| 评报 | 补充要求后完整重生成并保存 | FAIL | 实际生成四模块、1037字完整评报，缺`daily_review_revision`导致保存失败 |
| 评报 | 保存失败保护原评报 | PASS | 前后内容哈希及v2版本一致 |
| 评报 | 无裸`###` | PASS（渲染范围） | 标题/加粗/列表转React元素，SSR检查PASS，历史正文浏览器正常 |
| 系统 | DeepSeek实际调用 | PASS | HTTP200、真实非空响应，Key未进入源码 |
| 系统 | ingest health | PASS | 200，database=ok、ingest_enabled=true |
| 系统 | ingest queue | PASS | Mock经HTTP拉取队列并使用真实source_id |
| 系统 | Mock HTTP入库、去重、补全 | PASS | 最新新增18、重复2、更新1，无效链接拒绝，全程HTTP |
| 系统 | 最近执行 / 下次执行 / 状态 | PASS | 接口提供字段，最新failed记录具体数据库错误 |
| 系统 | 手动执行一次 | FAIL | clue_identify真实调用500，缺线索字段/关联表；已停止伪报success |
| 系统 | 自动定时 | FAIL（未验证） | 未验证外部调度器，只有密钥不再被宣称自动运行 |

## 已修复的问题与文件

- 取消前台审核门槛，统一enabled/软删除/日期窗口；首页和统计同步，calendar_event为唯一正式来源：`src/lib/calendar-engine.ts`、`src/app/api/calendar/route.ts`、`src/app/api/home/preview/route.ts`、`src/app/api/stats/route.ts`。
- 日期不明确不冒充具体日期；本地区域兼容广东/广州；详情/摘要排除停用和删除，来源标签兼容：`src/app/api/calendar/[id]/route.ts`、`src/app/api/calendar/[id]/summary/route.ts`、`src/components/calendar/{calendar-shell.tsx,calendar-types.ts,calendar-detail-panel.tsx}`。
- 删除原因正确读取/验证，软删除无法PATCH复活，编辑保留停用状态，后台移除日历审核操作：`src/app/api/admin/calendar/{route.ts,[id]/route.ts}`、`src/components/admin/admin-calendar.tsx`、`src/components/calendar/calendar-edit-panel.tsx`。
- 线索先检查结构，失败不继续标记处理；AI/关联写入错误不吞掉：`src/lib/{clue-pipeline.ts,clue-engine.ts}`、`src/app/api/admin/leads/identify/route.ts`、`src/app/api/leads/route.ts`、`src/app/leads/page.tsx`。
- 选稿错误明确返回，不再假404；评报版本使用真实用户id，最终正文安全渲染：`src/lib/review-draft.ts`、`src/app/api/review/draft/route.ts`、`src/app/api/review/[id]/followup/route.ts`、`src/components/review/review-result.tsx`、`src/components/common/report-text.tsx`。
- 模型空响应失败；ingest token保留数据库优先、支持环境回退；任务真实记录失败、按上海时区算下一次、不伪称已自动运行：`src/lib/{llm-adapter.ts,ingest.ts,scheduler.ts}`、`src/app/api/admin/scheduler/route.ts`、`src/app/admin/scheduler/page.tsx`。
- Mock每轮独立run_id，单轮仍验证重复/补全：`scripts/mock-ingest.ts`。验收脚本：`scripts/acceptance-local.mjs`、`scripts/acceptance-ai.ts`、`scripts/acceptance-review-http.mjs`。
- SQL、导入和schema声明：`docs/db-review/calendar-compatibility.proposed.sql`、`scripts/{apply-calendar-a.mjs,plan-history-calendar.mjs,plan-history-calendar.test.mjs}`、`src/storage/database/shared/schema.ts`。schema文件改动不等于线上DDL已执行。

本地启动/依赖与配置修复详见LOCAL-DEV.md；所有修改留在工作区，未提交Git。

## 实际迁入与阻断

确认连接扣子共享生产Supabase：reusdpelytqggjyhfsyh。目前只有REST凭据，无SQL连接串/数据库密码/管理令牌，也没有SQL RPC。service_role不能经REST执行DDL。已批准A v2尚未执行，实际迁入 **0条**，正式表当前30天明确日期节点 **0条**。

快照131条的去重计划：新增108（93日期明确、13仅月份、2未知日期），当前30天12；12批内重复建立来源关联，1已有强关联保留，10歧义暂缓。这是计划，不能算入库。

已准备守卫式执行器和run_id/前后快照/指纹/映射日志；不恢复停用/删除、不物理删除历史。本次执行在凭据检查阶段阻断，run_id `3ba79bfe-db8a-4be1-be9a-ff75042c36b4`，记录`logs/calendar-import/该run_id/manifest.json`。没有SQL写入，无需数据库回滚；实际执行后的回滚按run_id及指纹，不覆盖后来编辑，详见`docs/db-review/calendar-a-v2-plan.md`。

验收确实产生数据变化：多轮Mock文章、ingest状态/任务日志，以及早期一次旧任务标记100篇文章已处理。后续结构预检已防止失败仍标记。未物理删除Mock文章；最新18条带验收run_id，不是媒体真实采集。历史表、既有calendar_event、原评报未改动。

## 证据和后续

- 最新HTTP：`logs/acceptance/436ff3dc-5775-40e9-a474-20e90935756e/results.json`与同目录mock-ingest.log。
- 评报流式调用：`logs/acceptance/review-http.json`，run_id `004fb664-74e4-49c1-8908-3c82b8551337`。
- 实际AI内存五项：`logs/acceptance/ai-quality.json`，5/5 PASS，不替代持久化验收。
- 日历引擎10/10、历史去重5/5通过；核心修改文件ESLint零错误、三条既有未使用变量警告；git diff --check通过。最终生产构建/TypeScript通过。
- Markdown标题/加粗/列表/HTML转义SSR通过，脚本在忽略目录`logs/acceptance/render/`。

先在Git忽略的本地.env.local安全提供该项目DATABASE_URL或SUPABASE_DB_URL，再执行已授权A v2及去重迁入、B结构补齐，复验完整持久化链路。A/B无需再次批准；范围之外的业务migration不能自动执行。

旧候选生成/粘贴/历史确认写入路径仍需核对是否直接进入正式表，本轮移除查询审核条件不代表所有来源写入流程已统一。共享库结构及已有功能验收完成后再开展三家真实媒体PoC。
