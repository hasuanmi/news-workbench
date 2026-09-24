# 逐源绑定最小修复验收

范围仅限 source 绑定、任务身份、重试与统计。未补 scraper，未修改站点适配/数据库配置，未跑完整 284 源，未提交或推送。

## 修复结果

- 调度从 ingest 队列生成 source 快照，传递 source_id、media_id、source_url、source_type、crawl_method；按 source_id 去重后执行。
- Python 通过 stdin 接收明确快照，不重新读取队列、不按媒体名选 source；媒体名只用于选择已有解析器。
- 已有解析器 entry_urls 设为传入 source_url，保留传入 source_type/crawl_method；空 URL、manual、类型/方式冲突均明确失败，不回退到官网或其他源。
- 每次尝试以 run_id + source_id + attempt_id 创建独立日志和原子报告；调度校验五个字段、run_id 和 attempt_id，拒绝错配报告。
- 配置缺失返回 configuration_missing/retryable=false，只执行一次。进程没有报告等异常仍可按原上限重试。
- 成功回推还要校验后端 perSource 中的 sourceId，并确认至少一条插入/更新/重复被接受，不能仅凭 HTTP 成功当作采集成功。
- 调度 journal 的 steps/perSource 和 run-summary API 保留真实 source_id；源数按 source_id、媒体数按 media_id 分别去重。旧 journal 不补造 source_id，仅显示旧任务次数。
- 保留原调度 website 范围；本次未扩大为全量自动抓取 epaper。epaper 回归使用与调度相同的 runSource 执行器。

## 小样本结果

所有已执行样本：调度快照 → Python 报告 → 独立日志 → 执行结果中的五个 source 字段均一致；有回推的样本，其后端 perSource.sourceId 也一致。

|样本|source_id|绑定结果|实际结果|尝试次数|
|---|---|---|---|---:|
|南方日报 website|8b95aea9-ba61-459f-846c-eac870373dbf|PASS|3 篇正文回推：新增 1、重复 2、无效 0、写入失败 0|1|
|人民日报 epaper|0407a3e1-3357-4131-9ddf-867f2b0a450e|PASS|后端接受 2 条重复数据，但内容是索引页，**不计作新闻正文采集成功**|1|
|新华社 no scraper|651abe46-e60e-47dd-8e64-28c0eec1b596|PASS|预期失败 configuration_missing；没有重试、没有借用其他 scraper|1|
|错误 URL 隔离样本|d396c7e5-2b82-4ea8-99ed-81f60aa6d577|PASS|预期失败 invalid_source_url；使用 invalid:// URL 和临时 UUID，不改生产 source、不回推测试文章|1|
|中国青年报 epaper 补充核对|89518fc7-1fca-49f6-9125-506ebc5be8d4|PASS|no_valid_articles；未替换成 website|1|

人民日报只读候选检查发现既有解析器抽到版面/索引及错误拼接的相对路径。中国青年报样本也未获得有效正文。这属于已有 epaper 适配问题，按本轮“不做站点适配”的要求保留，未为了凑成功回退到网站源或改变 URL。

**交付判断：source 绑定修复通过；“真实 epaper 新闻正文成功源”这一项尚未通过，不能把索引页回推包装成通过。** website 正文成功、缺配置与错误 URL 的预期失败已通过。manual 与类型冲突不替代的行为由隔离自动测试验证。

## 验证凭证

- 四类主回归 run：d19d8161-5b5f-40de-8bc6-c06381e016af。
- epaper 补充 run：018893c4-d59d-4790-bdc0-5c13d2db752d。
- 新增正式文章 ID：2ed4d85e-74a0-4d82-8b4a-923e7535ea04。生产只读复核 source_id=8b95aea9-ba61-459f-846c-eac870373dbf、media_id=18415fb5-a68b-4781-96f9-84c9d17cf35a、source_type=website，与调度一致。
- 运行摘要 API：HTTP 200；旧完整 run 仍保留。sourceIdentityVerified=false、successfulSources=null、successfulTasks=51、successfulMedia=23，未将旧记录改写为去重成功源。
- Python 4 项测试通过（含 website/epaper 正确回推、禁止重新选源、缺配置终止、manual/空 URL/类型冲突拒绝、错回推 ID/零接受量拒绝）。
- Node 1 项身份测试、TypeScript 2 项统计测试通过；TypeScript 全量检查、改动 TS/TSX 文件 ESLint、Python 编译、diff 空白检查通过。
- 机器可读凭证：source-binding-acceptance-2026-09-24.json；逐次原始报告位于相邻 media-scraper/logs/real-poc，文件名见 JSON。

## 涉及实现

- news-workbench/scripts/run-daily-task.mjs
- news-workbench/scripts/source-runner.mjs
- media-scraper/poc_ingest_real.py
- news-workbench/src/lib/source-run-summary.ts
- news-workbench/src/app/api/leads/run-summary/route.ts
- news-workbench/src/components/leads/run-summary-card.tsx（仅数量字段及旧记录口径文字，未改样式）

原工作区其他未提交改动保留；本次未处理历史数据清理、文章候选质量或其他功能。
