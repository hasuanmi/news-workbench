# 提案 A v2 与历史节点迁入方案（待批准，未执行）

基于 2026-09-17 的只读快照及离线模拟。历史表继续作为资料库；前台日历唯一读取 calendar_event。本轮只更新 SQL 草案、离线分析脚本及文档，不修改应用查询或数据库。

## 1. 更新后的 SQL

完整可审阅 SQL：`calendar-compatibility.proposed.sql`；执行前只读核对：`preflight-readonly.sql`。

- calendar_event 补齐 event_year、source（旧接口兼容）、source_type、deleted_at、delete_reason、deleted_by。
- source/source_type 新增为可空，不将已有迁移节点默认标为用户新增。新写入明确提供 source_type；已知旧来源通过独立迁移清单回填，未知来源保留空值，不猜测。
- calendar_category 补齐现有 API 已读取的 color。
- 新增 calendar_history_event_ref 溯源映射表：history_node_id 主键，calendar_event_id 外键，import_run_id、match_method、linked_at。多个历史 ID 可以指向同一正式事件；同一历史 ID 只能指向一个正式事件。该表仅供服务端维护溯源，不是前台第二数据源。
- 溯源表启用 RLS，只授予 service_role 访问，不向浏览器公开权限。
- 保留 review_status/needs_review 等旧字段及默认值；不新增审核触发器、不修改启用状态、不执行发布操作。应用新增节点显式 enabled=true，审核字段不参与展示。

这是纯结构 SQL，没有历史导入、既有业务行 UPDATE、删除或初始化。既有字段若已经存在，执行前须确认类型兼容；新溯源表若已存在，本脚本停止而不是接管或覆盖。DDL 存在短时锁影响，超时会中止事务。

## 2. 去重与映射规则

按以下顺序判断，数据库匹配范围包含停用与软删除记录：

1. **强溯源优先**：新映射表历史 ID；旧 source reference；或者 calendar_event.source_candidate_id → calendar_candidate.source_detail 的 `history_node:<id>`。唯一匹配只建立关联，不覆盖事件内容、日期或用户状态；多个匹配暂缓，不任意选一个。
2. **保守标准化**：名称 NFKC、大小写归一、去空白和标点、剥离数字周年表述，仅用于比较。保留显示原名；不删除年份、季节、届次，不使用包含关系/AI 相似度自动合并。周年基准年若可确认且不同，应视为冲突，不能只凭名称剥离结果合并。
3. **名称＋时间＋地区＋分类精确匹配**：动态事件日期必须 YYYY-MM-DD 完全相等；已明确为 fixed 的既有事件，以同一历史年份的月日发生日比较。地区与分类必须相同；空分类不充当通配符。只有月份时比较历史年＋月份；日期完全未知且同名多条，不能可靠去重，暂缓这些歧义记录。
4. **批内去重**：同样的标准化名称、日期精度、日期/年月份、地区、分类只新增一条正式事件，并为所有对应历史 ID 建立关联。保留每条历史资料，不删除历史行；说明、重要度等有差异时保留来源信息，不覆盖用户数据。离线代表记录按历史 ID 排序选择；实际执行前固定逐条清单。
5. **相似但不精确**：日期接近、地区/分类缺失或不一致、周年年份冲突等只列为疑似冲突，不自动合并，也不使用旧候选去重的“日期±7天”规则直接导入。执行前复核新增清单，必要时下调预计数量。
6. **幂等和并发**：正式导入使用单个数据库事务和专用事务级 advisory lock；执行事务内锁定 calendar_event 及映射表的写入，重新核查最新数据，防止其他新增接口并发制造重复。建议一次短事务，不跨 AI/HTTP 调用持锁；超时整体回滚。历史 ID 主键作为最终重复导入保护，不能只靠应用先查后写。后续持续导入使用相同锁与重新匹配规则。

已有映射指向停用或软删除事件时，跳过新增，不修改 enabled/deleted_at。避免通过重新导入复活节点。历史资料后来更新时，只列差异供处理，不静默覆盖正式事件。

### 日期和来源映射

历史迁入默认保留原年度发生日期为 dynamic，不统一滚动到 2027，也不把活动/假期机械改成每年固定日期。确有固定周期/周年依据的节点单独映射 fixed 与真实基准年；不将“历史文档年份”冒充事件原始发生年。date_status 保留 confirmed/month_known/unknown，未知日期不伪造日期。

source_type 使用 historical_migration/ai_supplement/manual/pasted_text；旧 source 对应 history_migrate/ai_recommend/user_add/user_paste。历史迁入显式 historical_migration，两份字段仅为兼容，规范来源以 source_type 为准。

## 3. 预计数量

运行 `node scripts/plan-history-calendar.mjs`，仅读取本地只读快照，不连接数据库。逐条结果位于忽略提交的 `logs/takeover-baseline/history-calendar-plan.json`。

| 处理 | 历史行数 |
| --- | ---: |
| 预计新增正式事件 | 108 |
| 与本批新增事件重复，仅追加历史关联 | 12 |
| 强溯源关联已有“元旦”事件 | 1 |
| 已有“元旦假期”多重匹配，暂缓 | 5 |
| 同名未知日期“某重大政策发布”，暂缓 | 5 |
| 合计 | 131 |

108 条新增事件中：93 条日期明确、13 条只知月份、2 条日期未知。**其中当前 30 天（2026-09-17～2026-10-17，含边界）的明确日期节点为 12 条。** 后两类进入待定表达，不计入这 12 条。现有 3 条事件保持原样，预计正式表为 111 条、历史溯源关联 121 条；10 条歧义历史记录不丢弃，仍留资料库。

这是精确规则离线模拟的预计值，尚未最终复核所有疑似近似匹配、周年基准和数据库实时变化；执行前重新读取和生成固定清单，如数量变化先说明。暂缓是导入去重歧义处理，不是恢复候选人工审核流程。现有重复“元旦假期”不在本次自动清理范围。

## 4. 准备修改的文件

### 查询及展示

- `src/app/api/calendar/route.ts`：移除 approved 门槛，保持唯一 calendar_event 数据源，返回 source_type。
- `src/lib/calendar-engine.ts`：移除审核过滤，统一启用/软删除及日期窗口；`calendar-engine.test.ts` 更新旧测试和增加边界验证。
- `src/app/api/home/preview/route.ts`：移除审核过滤，复用确定性日期规则；保留日期确定性，不依赖 AI 成功。
- `src/app/api/stats/route.ts`：移除日历审核门槛，补齐软删除；旧待审核节点指标取消展示并兼容返回，不碰新闻线索审核逻辑。
- `src/app/api/calendar/[id]/route.ts`、`[id]/summary/route.ts`：核对前台详情和摘要的启用/删除保护，隐藏节点不触发补全；管理接口保留编辑停用节点能力。
- `src/app/api/admin/calendar/route.ts`、`[id]/route.ts`：状态筛选改为启用/停用/已删除，审核值不决定可见性；延续带原因软删除。
- `src/components/admin/admin-calendar.tsx`：移除正常管理中的待审核/通过/驳回操作，保留维护入口；有引用旧统计指标的组件同步处理。
- `src/components/calendar/calendar-types.ts`、`calendar-shell.tsx`、`calendar-detail-panel.tsx`：来源标签兼容、类型与展示对齐，不做 UI polish。

### 数据映射及直接写入（与查询修改分开验收）

- `src/storage/database/shared/schema.ts`：结构声明与获批 SQL 对齐，修正旧“AI 只能先进候选池”的注释。
- 增加小型服务端历史迁入模块/一次性导入脚本及逐条运行清单；不得作为启动自动初始化执行。
- `src/lib/calendar-history.ts`、`src/lib/calendar-candidate.ts` 及历史 confirm、候选 generate/recommend/recognize/create 路由：复用已有抽取/日期校验能力，将有效来源直接写入正式日历；旧候选审核路由保留兼容，不再是唯一入日历入口。
- `src/components/admin/history-calendar.tsx`、`admin-calendar-workbench.tsx`：历史资料入口与直接导入动作对齐，取消必须逐条审核发布的正常路径。
- `scripts/audit-local-db.mjs` 的展示计数同步取消审核条件；新离线计划脚本后续支持新溯源映射。

具体变更限于日历边界，逐步验证；不重构新闻线索、每日评报或抓取模块。

## 5. 回滚方案

1. **执行前**保存物理 schema、已有三条事件和来源字段快照；导入清单记录 run ID、每个新 event ID、历史关联、原值及导入后指纹。不覆盖历史资料，不清理已有重复。
2. **结构事务失败**由 PostgreSQL 回滚，不留下半套结构。**结构提交后**通常保留兼容新增列/表，先回退应用代码；避免立即 DROP。只有确认未被其他部署使用、已导出新增元数据后，才准备独立获批的结构撤销 SQL，且仅撤销本次确实新增的项。
3. **导入事务失败**事件和关联同时回滚。**导入提交后**按 run ID/清单只处理本次新增事件和关联，不按 source_type 批量删除。未被后续修改且无业务引用的新增记录可准备精确撤销 SQL；有用户修改/关联的保留并列出，不能自动删除。
4. 若采用软删除撤销导入，在新规则下立即隐藏本次新增节点，同时保留历史 ID 映射作为防重导入标记；恢复导入需显式恢复同一事件，不能创建新副本。已有事件的关联撤销、来源字段恢复均依据清单和原值，先检查并发修改。
5. **查询代码回退**只回退本次日历改动；旧审核过滤会再次隐藏未 approved 的节点，应明确是临时故障回退，不作为产品最终行为。回滚、硬删除或结构 DROP 均另行提供精确 SQL 获批后执行。

**等待用户确认本提案及导入规则后，再进行数据库写入和应用查询修改。**
