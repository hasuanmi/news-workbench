# 新闻日历取消审核：只读核查与待确认方案

核查日期：2026-09-17。数据库为扣子线上/共享 Supabase。本文仅记录代码和已有只读数据库快照；本轮未修改应用查询、执行 SQL、迁移历史数据或调用 AI 写入接口。

产品规则以本次确认内容为准：历史迁移、AI 推荐、用户新增/粘贴节点直接进入新闻日历；展示由 `enabled = true`、`deleted_at IS NULL` 和日期窗口决定。审核字段可以保留，但不作为展示门槛。

## 1. 当前实际过滤条件

| 位置 | 当前条件 | 问题/处理方向 |
| --- | --- | --- |
| `/api/calendar` 普通列表 | 只查 `calendar_event`；`deleted_at IS NULL`、`enabled = true`、`review_status = approved` | 移除审核条件，保留启用和软删除条件 |
| `buildCalendar` 日期引擎 | 跳过 `enabled = false`；跳过非空且不等于 `approved` 的 `review_status` | 存在第二重审核门槛；改为统一启用/软删除规则 |
| `/api/home/preview` 节点块 | `enabled = true`、`review_status = approved`、`deleted_at IS NULL`；代码另要求 `date_status = confirmed` | 移除审核条件；日期确定性与审核分开处理 |
| `/api/stats` 节点统计 | `enabled = true`、`review_status = approved`；没有软删除过滤 | 移除审核条件并补齐软删除过滤，统一日期计算 |
| `/api/admin/calendar` | 默认排除软删除；`pending` 按 `needs_review`；`approved` 按审核通过且启用；`disabled` 按停用；`deleted` 查软删除 | 管理筛选改为全部/启用/停用/已删除；旧审核字段仅兼容 |
| `/api/calendar/[id]` 详情 | 只按 ID 查询，无启用/软删除/审核过滤 | 前台详情需防止软删除节点继续展示；管理编辑需单独保留停用节点访问 |

普通列表还支持分类 ID、重要度、local/national 地域、名称关键词筛选。日期引擎按 fixed 的 original_date 或 dynamic 的 event_date 计算发生日；week 为 7 天、month 为 30 天、next14 实际取配置窗口。前台已使用 `view=month`。普通日期列表取 `0 <= daysUntil <= 窗口天数`，包含今天和第 30 天。

`all=1` 是原始列表分支：仍排除软删除，但不限制启用、审核和日期窗口；不同于 `view=all`。`include_past=1` 对普通窗口不能恢复已经被引擎排除的过去日期。

`date_status = month_known / unknown` 的节点由 `/api/calendar` 单列在 `floating` 待定区域，目前不按具体日期窗口裁剪。拟保留待定表达：已知月份按月份是否与窗口相交筛选，日期完全未知单列“日期待定”，不计入未来 30 天有日期节点数量。

未在上述日历展示路径发现 `published` 条件。`date_status = confirmed` 指日期已经明确，不能视为人工审核状态；候选的 `review_status = confirmed` 才属于旧审核流程。

## 2. 哪些字段仍决定展示

- 直接门槛：enabled、deleted_at、review_status（API 与引擎双重限制）。
- 日期门槛：event_type、original_date、event_date、date_status；首页还使用自己的日期确定性判断。
- 用户筛选：category_id、importance、region、event_name。
- needs_review 仅影响旧管理页待审核筛选和管理统计；confirmed_at/by 是旧确认写入元数据，未发现前台列表据此过滤。
- source/source_type、来源说明和 AI 补全结果不应决定展示。

新闻线索模块自己的 review_status 条件不属于本次日历取消审核范围，不会顺手移除。

## 3. 取消审核后的最小调整方案（尚未实施）

1. 统一日历 API、引擎、首页和统计的启用/软删除条件，移除全部日历审核展示门槛；保留日期规则、窗口和用户筛选。
2. 停止用“待审核/已发布”组织正常日历管理流程，保留直接编辑、停用和带原因软删除。兼容字段不再要求用户操作。
3. 修正写入路径，而不只修正读查询：当前历史解析保存只写历史表；历史迁移与手动/粘贴候选写入候选池 pending；AI 推荐接口只返回预览；旧 confirm 接口才将候选写入 calendar_event。调整后有效节点直接写 calendar_event，无审核中转。AI 配置缺失不得影响已有节点的读取。
4. calendar_event 保持唯一可编辑日历存储，历史/候选表可留作兼容档案。历史迁移制定逐条映射和幂等去重方案，保留历史节点 ID 来源引用；不覆盖用户编辑、不重新启用停用节点、不复活软删除节点。不能简单将多个表运行时拼接，否则删除和编辑容易失效。
5. 以 source_type 为规范来源标签，拟沿用现有候选值 historical_migration、ai_supplement、manual、pasted_text。当前正式节点代码用 source 的 history_migrate、ai_recommend、user_add、user_paste；需要明确映射并兼容旧接口。标签仅记录来源，不加审核/发布语义。既有三条节点的 source_name 指向 historical_migration，不能统一误标为用户新增。
6. 日期明确节点依据有效发生日期展示；待定节点保留待定区。历史数据中的年度日期与固定周年规则逐条映射，不能把 2026 年日期统一改成候选池配置的 2027 年。
7. 更新旧“pending 节点不展示”测试；增加启用且旧审核值 pending/rejected/confirmed 仍显示、停用/软删除不显示、30 天边界、历史重复迁移不复活已删除节点等验证。

### 提案 A 的审核逻辑检查

现有 `calendar-compatibility.proposed.sql` 只新增 event_year、source、软删除字段、分类 color 和索引，没有修改 review_status、needs_review、确认状态或添加审核触发器，因而不会在数据库层强化旧审核流程。但它也不会移除代码中的审核门槛，且 source 的 user_add 默认值不能准确表达既有迁移节点来源。

执行前需要提交更新后的具体 SQL：明确 source_type 与旧 source 的兼容方式、既有来源回填及独立历史迁移明细。结构补齐与历史数据写入分开审阅，均先完成物理 schema 的只读 preflight。原提案 A 尚未获批准，不能直接执行。

结构新增不删除现有业务数据，但会短时持有 DDL 锁；失败可事务回滚。提交后新增列若已有写入，删除列将丢失新增元数据，不能称为无损回滚。历史导入需记录新增事件 ID 与来源映射，便于只回退本次新增记录，不能批量清空现有日历。

## 4. 131 条历史节点中的 12 条会不会直接出现

**仅取消审核过滤：不会。** 当前 calendar_event 仅有 3 条节点，全部已经 enabled=true、review_status=approved，计算发生日均为 2027-01-01，不在当前 30 天窗口；131 条历史节点位于 calendar_history_node，不在日历查询的数据源中。候选池 130 条的目标年均为 2027，也不能代替当前年度历史节点。

只读快照中，下列 12 条历史节点均 enabled=true、date_status=confirmed，发生日期位于 **2026-09-17 至 2026-10-17（含边界）**。完成兼容字段补齐、取消审核门槛和历史直接入日历后，这 12 条按当前记录日期应全部进入不加分类/地域/关键词筛选的 30 天列表。实际结果仍需通过 HTTP 查询及逐条 ID 核对验收；此处不代表已完成导入，也不代表已经校核这些历史记录的事实日期。

| 日期 | 历史节点 |
| --- | --- |
| 09-17 | 横琴粤澳深度合作区挂牌成立5周年 |
| 09-19 | 《关于推动传统媒体和新兴媒体融合发展的指导意见》印发12周年 |
| 09-23 | 中国农民丰收节 |
| 09-25 | 中秋节假期 |
| 09-30 | 烈士纪念日 |
| 10-01 | 国庆节假期 |
| 10-07 | 习近平文化思想提出3周年 |
| 10-10 | 中央红军开始长征92周年 |
| 10-10 | 辛亥革命115周年 |
| 10-14 | 广州解放纪念日 |
| 10-15 | 秋季广交会 |
| 10-15 | 广州营商环境日 |

另一个独立阻断点仍存在：共享库 REST 当前报 calendar_event.deleted_at 缺失，日历 API 返回 500。必须先确认物理字段/缓存状态并按获批方案补齐，不能用取消审核过滤掩盖该错误。

**确认边界：本次仅提供核查和方案；等待用户确认后再修改数据库与应用查询。ingest 和媒体 PoC 仍未进入。**
