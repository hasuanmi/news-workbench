# Source 状态治理验收（2026-09-24）

已在生产 Supabase 执行事务迁移，只更新 source 状态和启用标记，不物理删除。

| 状态 | source 数 | 每日任务 |
| --- | ---: | --- |
| active / 启用中 | 101 | 参与 |
| needs_fix / 待修复 | 120 | 不参与 |
| duplicate / 重复停用 | 101 | 不参与 |
| manual_disabled / 人工停用 | 0 | 不参与 |
| 合计 | 322 | 101 个唯一成功源 |

- active 为 101 个 website，覆盖 90 家媒体；没有将未验收的 epaper 冒充 active。
- needs_fix 为 82 个 website + 38 个 epaper。电子报原因区分 manual 配置、尚未逐源验证，以及人民日报绑定通过但内容验收未通过。
- duplicate 仅限同 media_id、规范化 URL、source_type；均保存 duplicate_of 指向建议保留 ID。广东广播电视台 epaper 未跨类型判重。
- 135 家媒体全部保留。135 是媒体池覆盖，90 是当前已验证自动采集覆盖，不能混用。
- 2,161 篇文章数量及 id/source_id 关联摘要在事务前后完全一致；原 source 记录仍为 322 条。

管理页面：/admin/media，显示四类计数、状态筛选、逐源停用原因、重复项保留源 ID。

每日任务：/api/ingest/queue 与 scripts/run-daily-task.mjs 双重限制 active。真实 worker 失败后标记 needs_fix 并停用；停用/重复源不会因入库、模拟推送或保存配置自动重新启用。重新启用要求真实 worker 验证。

每日实际数：按北京时间、实际开始执行的 source_id 去重，同一天重复运行不重复计数；记录于本地 logs/scheduler 的每日任务日志。当前显示新规则生效后 2026-09-24 实际执行 0 个，本次未重新启动采集。旧 284 源 run 不追认为 active 运行。此统计随部署主机本地日志保存，迁移主机时应一起保留日志。

验收：

- TypeScript 检查通过；定向 ESLint 通过。
- 状态资格、URL 规范化、北京时间跨日和多次运行去重测试通过。
- 真实管理 API 返回 322 条源及四类正确数量。
- 真实 ingest 队列仅返回 101 个 active source，ID 不重复。
- 重复源/未验证源强制启用返回 409；未知状态返回 400；无文章及入库回执的假成功被拒绝。
- 人工停用真实接口回归：队列 101 → 100 → 101；测试源已恢复 active。
- 浏览器验证四类状态、每日计数及广东广播电视台三个 source 的分类和原因显示。

执行明细：source-lifecycle-applied-2026-09-24.json；接口验收：source-lifecycle-acceptance-2026-09-24.json。

本地原始备份：logs/scheduler/source-lifecycle-backup-2026-09-24.json。未 commit / push。
