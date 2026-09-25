# 每日评报规则与诊断读取修复验收

验收环境：本地主服务端口 3002，生产 Supabase；北京时间 2026-09-24 19:18。
本轮没有修改 UI，没有生成最终评报。

## 根因与证据

1. 本机直连 Supabase REST 的 HTTPS 请求被重置。同一请求经本机现有 HTTP 代理返回 200；PostgreSQL TLS 直连查询也正常。因此不是当天无文章，也不是数据库停机。不能仅凭重置确定是哪一段网络设备导致。
2. `app_config` 只有旧配置 `review.media_names`、`review.word_count_threshold`。新版 `review.comparison_media`、`review.selection_rules`、`review.generation_rules`、`review.display_rules` 四个 key 缺失。旧代码忽略查询错误并回退代码默认值，后台配置接口还把所有查询错误都当成 404。
3. 修复前 `GET /api/review/availability?date=2026-09-24` 和 09-23 都返回 503；Supabase SDK 传输失败 status=0（尚未收到 HTTP 响应），不是 Supabase HTTP 403 或 SQL 字段错误。一次成功的配置查询返回空数组，确认缺少记录。

实际捕获的底层堆栈：

```text
TypeError: fetch failed

Caused by: Error: read ECONNRESET (ECONNRESET)
Error: read ECONNRESET
    at TLSWrap.onStreamRead (node:internal/stream_base_commons:216:20)
```

失败涉及 `app_config.value`（按上述 key 查询）和 `media.id/media_name/enabled`；连 `media.select(id).limit(1)`、`article.select(id).limit(1)` 也会重置。没有发现缺列/字段类型错误。

## 最小修复

- `src/lib/db.ts` 支持可选 `SUPABASE_PROXY_URL`，仅此 Supabase 客户端使用代理；未设置仍直连，保持证书校验，不改全局 AI/ingest 网络设置。当前本地 `.env.local` 配置为已有代理 `http://127.0.0.1:7897`。
- 规则查询使用 `maybeSingle` 区分缺失和查询失败，失败保留查询字段、底层 cause；损坏 JSON 不再静默回退。完整堆栈只记录在服务端，API 返回具体操作、字段及错误码。
- 后台单项配置读取：真实缺失返回 404，查询失败返回 503；诊断读取失败也保留上下文，不当成零篇。
- 仅执行 `sql/2026-09-24-review-config-backfill.sql` 补齐四项缺失配置；`ON CONFLICT DO NOTHING`，不重跑整库 seed。媒体名单与最低字数沿用旧配置；其余沿用已有代码默认值。重复执行验证未覆盖配置。

规则存于数据库 `app_config.value`，不是环境变量或本地规则文件。环境变量只提供连接/认证与可选代理；代码默认值是缺少配置时的回退。

- 媒体：广州日报、南方日报、南方都市报、新快报、羊城晚报、信息时报。广州日报按现有逻辑同时匹配“广州日报报业集团”，所以解析为 7 个 media ID。
- 最低字数：2000。
- 重点稿：头版、整版、跨版、系列、专题（`front_page/full_page/cross_page/series/special`）。
- 维度：选题、时效性、报道角度、内容深度、表现形式。
- 同行遗漏扫描、新华社纯转载排除：开启。重点稿条件和维度用于 AI 选稿，不额外冒充规则层的硬过滤计数。

## 验收

统计口径：北京时间当天 `publish_time`，`is_test=false`；媒体范围 → `word_count >= 2000` → 媒体 ID + 标题去重。API 计数与独立 PostgreSQL 查询一致。

| 日期 | 正式文章 | 涉及媒体 ID | 默认媒体范围命中 | 字数过滤后 | 最终候选 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-09-24 | 616 | 78 | 74 | 40 | 35 |
| 2026-09-23 | 139 | 50 | 7 | 3 | 2 |

- 四个配置 API 均返回 200；不存在的测试 key 返回 404（没有写入该 key）。
- 两个日期诊断 API 均返回 200；页面显示 616 → 74 → 40 → 35。
- 在页面点击一次“开始选稿”，09-24 真实选稿保存成功（19:17:07）：2 组同题、5 条同行亮点、3 篇新华社背景。页面已显示“本期选稿结果”。
- 未点击“基于以上稿件生成评报”。最终评报记录 ID/日期/更新时间与操作前一致。
- TypeScript 检查通过；日期/错误处理 6 项回归通过。
- 所改文件 ESLint 检查发现 `review-engine.ts` 原有 12 处 `no-explicit-any`、`review-draft.ts` 原有 1 处 unused-vars；均不在本次修改行，未扩展到无关重构。

本地完整接口响应及操作前选稿备份：`logs/scheduler/review-read-acceptance.json`；修复前证据：`logs/scheduler/review-read-diagnosis-before.json`。这些日志不进入 Git。当前本地运行依赖上述代理可用；其他部署环境应按实际网络决定是否设置代理。
