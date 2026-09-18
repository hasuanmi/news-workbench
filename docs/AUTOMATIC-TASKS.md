# 真实自动任务核查与实施（2026-09-17，北京时间）

核查时，本机没有项目相关 Windows 任务；原主系统只有 cron HTTP 入口，日历没有正式调度任务。共享 Supabase 未安装 `pg_cron` / `pg_net`。扣子平台调度配置未取得，不能把历史执行日志当作扣子定时器仍在运行的证明。

现已为当前 Windows 用户安装真实任务，并用 `Start-ScheduledTask` 实际触发验收，不依赖浏览器或用户点击按钮。

| 任务 | Windows 注册名 | 每日时间 | 最近实际业务执行 | 下次触发 |
| --- | --- | --- | --- | --- |
| 新闻日历 AI 推荐 | GZDaily-CalendarRecommend | 07:30 | 09-17 23:17:34～23:17:47 | 09-18 07:30 |
| 媒体抓取后自动识别新栏目 | GZDaily-MediaThenClues | 08:30开始抓取 | 09-17 23:08:35开始抓取；23:09:45～23:10:00识别 | 09-18 08:30开始抓取，完成后立即识别 |

调度方均为本机 **Windows Task Scheduler**，不是 Supabase、扣子或 Codex 自动任务。定时任务页面查询真实 Windows 注册记录，展示运行记录、任务状态和真实下次时间；每周简报、每日评报没有安装自动触发器，页面如实显示仅手动。

## 日历链路与实测

Windows → `launch-daily-task.ps1` → `run-daily-task.mjs calendar_recommend` → 带令牌 `POST /api/cron/calendar_recommend` → 权威页面取证 + 历史资料参考 + DeepSeek → 去重 → `calendar_event`。

- 窗口按北京时间计算未来30～90天，本次为2026-10-17至2026-12-16。
- 当前取证入口：联合国官方纪念日列表 + Bing RSS 搜索发现的政府等权威页面；最多取7页、每轮最多8条推荐。本次4页成功取证、45个固定日期由程序解析校验。
- 页面内容是证据，不执行其中指令。节点名称与日期必须能在已抓取页面逐字核对；动态节点要求当年日期，固定年度节点要求联合国官方列表及正确月日，非年度周期不会误作每年。
- DeepSeek用于提取和编辑背景/理由，正式任务不依赖 DeepSeek 内置 `web_search`。官方文档说明 Responses 内置工具目前会被忽略：[DeepSeek官方文档](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)。旧预览若无可验证联网来源会明确失败，不把模型生成链接当作已检索来源。
- 首次有效调度新增8条；去重补跑另新增2条、跳过6条已有节点。共10条保存了背景、推荐理由、来源及证据。包括联合国日、世界城市日、人权日等。
- 只写正式 `calendar_event`；新记录启用、无需审核、保留来源标签。兼容字段 `review_status=pending` 不影响前台，`GET /api/calendar?all=1` 已实际返回新增记录。
- 同名标准化 + 日期去重：年度固定节点比较月日，动态节点比较具体日期。同名已停用或软删除记录不会恢复；已有完整字段不覆盖，缺失背景/理由/来源可补全。
- 读回实测：新增节点均 enabled=true、deleted_at=null，背景/理由/来源非空；新增集合没有同名同日期重复。历史表未迁移、未清理、未物理删除数据，本轮未执行结构 migration。

当前搜索覆盖有限：本次新增节点来自联合国列表，不代表所有地方会议或动态展会已覆盖。检索与取证失败会记录；没有可取证页面时任务失败，而不是无来源入库。

## 媒体与线索链路及实测

Windows → runner → 独立 `media-scraper/poc_ingest_real.py --scheduled`，依次广州日报、南方日报、南方都市报，每家最多10篇 → `POST /api/ingest/articles` → 抓取阶段结束 → `POST /api/cron/clue_identify` → 主系统识别、保存线索与真实文章关联。

抓取服务不连接 Supabase，不包含线索或评报 AI 判断。定时推送不执行 PoC 的重复推送测试。仍使用既有 external_id / URL / 内容 hash 去重及正文补全。旧全媒体 worker 继续关闭，未扩大媒体范围。

| 媒体 | 成功正文并通过 HTTP 推送 | 详情失败 |
| --- | ---: | --- |
| 广州日报 | 9 | 1：标题或有效正文不足 |
| 南方日报 | 10 | 0 |
| 南方都市报 | 8 | 2：图片正文为空、移动端正文不足且浏览器兜底不可用 |

三家推送完成后自动扫描近3天、上述三家、未处理且非测试的真实文章。本次处理13篇，AI调用及保存流程无错误，发现新栏目0条；不把普通稿或旧栏目伪装为新栏目。真实新栏目正例的关联保存仍需后续真实开栏稿触发。本次没有使用 Mock 作为验收结果。

至少一家成功推送时，对成功来源继续识别；部分来源失败会记录并让总体任务失败；全部推送失败则不触发识别。单篇正文失败记录在日志中，不阻塞其他有效正文。本次三家 HTTP 均成功，任务退出码0。

“开始识别”仍作为手动补跑；后台日历保留“立即更新 AI 推荐”，也可在定时任务页立即执行。

## 运行与运维

- 必须本机开机且当前用户已登录；不是电脑关机也能运行的云调度。设置已启用 StartWhenAvailable（错过后补跑）、WakeToRun（受系统/硬件限制）、IgnoreNew（同任务不重叠），以及本地锁。
- 本地 Next.js 未运行时 runner 启动既有生产构建并等待健康响应；缺少构建、数据库/AI密钥或网络失败会写日志并返回失败。没有无限重试或悄悄模拟成功。
- 当前时间为中国标准时间。日历07:30；媒体08:30，线索实际时间取决于抓取耗时。后台开关关闭时 runner 跳过业务执行；Windows任务仍可能按时启动空跑。
- `CRON_SECRET` / `CRON_TOKEN`：主系统 cron 鉴权，只保存在忽略的本地配置中。可选 `LOCAL_MAIN_API_BASE` 指定本地目标，默认127.0.0.1与PORT；不把公共站点URL误当本地调度目标。
- AI仍读取既有 `DEFAULT_LLM_BASE_URL` / `DEFAULT_LLM_API_KEY` / `DEFAULT_LLM_MODEL` 或后台模型配置；Supabase及scraper ingest token复用已有配置。未新增依赖，未提交真实密钥。
- 注册脚本固定两个每日时间；任务页不会假装改一个cron文本就能修改Windows计划。需要更改时间时调整注册脚本并重新注册。

```powershell
# 在 news-workbench 目录注册/更新两个任务
powershell -NoProfile -File scripts/register-daily-tasks.ps1
# 通过真实 Windows 任务手动补跑
Start-ScheduledTask -TaskName GZDaily-CalendarRecommend
Start-ScheduledTask -TaskName GZDaily-MediaThenClues
# 只读复核运行结果、真实下次时间和日历入库
node scripts/verify-automatic-tasks.mjs
```

每轮保留 `run_id` 与步骤日志：`logs/scheduler/<run_id>.json`、两个 `*-latest.json`、`verification.json`；抓取详情在 `media-scraper/logs/real-poc/`。本轮有效日历run为 `9c4847b1-f692-450d-ac83-29f48cadbc61` 和 `9438ca33-d982-4e31-8ff8-8cf7718c710e`；媒体链run为 `383d22a6-60bc-45e8-ad46-a6a3f3af2fcd`。数据库 task_log 同时保存业务执行记录。

## 修改与回退

主要文件：`src/lib/calendar-auto.ts`、`scheduler.ts`、`local-triggers.ts`、`deepseek-search.ts`；cron/admin scheduler API；后台日历和调度页；三个任务脚本及只读复核脚本；独立抓取 `poc_ingest_real.py` 的定时模式。

回退自动触发可禁用上述两个 Windows 任务，不影响已有文章、日历节点或手动按钮。原业务调度配置备份在 `logs/scheduler/config-before.json`。已入库节点按run日志列出ID，若需要回退数据应软停用这些ID，不能全量删除日历或历史表。本轮没有执行数据回退或删除。
