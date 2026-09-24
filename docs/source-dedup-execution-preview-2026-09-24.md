# Source 去重执行预览（未执行）

生产快照：2026-09-24 17:07:50 北京时间。只读查询 media、media_source、article；未删除、停用或迁移任何数据。

| 项目 | 当前 | 预览后 |
| --- | --- | --- |
| 媒体覆盖 | 135 | 135 |
| website | 284 | 183 |
| epaper | 38 | 38 |
| manual / 其他 | 0 | 0 |
| 有效 source 总数 | 322 | 221 |
| 数据库物理行数（仅停用） | 322 | 322 |

明确重复 95 组，涉及 95 家媒体、196 条记录；建议保留每组 1 条，共建议停用 **101 条**。去重后有效 source **221 条**。135 家媒体及原有媒体×source_type 覆盖均不减少。

建议停用项中 **53 条有关联文章，共 316 篇**，这些文章和原 source_id 关联全部保留。本预览不建议物理删除；没有 article 关联也不等于已核查所有其他表引用。article 统计包含所有正式/测试记录，未按文章有效性筛选。

## 分组与保留规则

重复键严格为 media_id + 规范化 URL + source_type。URL 仅做标准解析（主机大小写、默认端口、根路径斜杠等）和首尾空格清理；不合并 HTTP/HTTPS、不同子域名、非根路径尾斜杠，不删除 query 或 fragment。

保留排序：已启用 → 当前 scraper/source_id 白名单可用 → 审计运行有成功记录 → 关联文章较多 → 数据库最近成功时间较新 → 创建较早 → ID。所有建议均具体到 source_id，不改抓取配置。无 scraper 的组去重后仍然无 scraper，不能算采集恢复。

“数据库最近成功/状态”与“最近观察到的实际运行状态”分列：失败可能没有回写数据库，不能把旧 ok 当成当前成功。实际运行证据范围为下列完整 run 和两次补充回归，并非查询了所有远端历史日志。补充回归没有逐源结束时间时使用该回归结束时间。

- `logs/scheduler/e3f6940c-52f7-44b8-8566-f4fdc2ad4aa0.json`
- `logs/scheduler/quick-fix-utility-regression-8461282f-8bf9-4010-8530-f2345fdc2726.json`
- `logs/scheduler/quick-fix-quality-final-77b269c5-9b38-4b61-97ae-68373562b070.json`

## 每组执行建议

### D001 东莞广播电视台 / website

media_id：`3529bf46-b3f8-4be7-bfc7-4bcd3843cfc4`  
规范化 URL：https://news.sun0769.com/dg/headnews/

**建议保留：`415535c6-0280-44a5-8aed-ed5dd01c4819`**  
建议停用（不删除）：`96266c07-c051-411c-90c1-572213cba632`、`233879a9-5733-47f6-b295-149ed6334055`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 415535c6-0280-44a5-8aed-ed5dd01c4819 | https://news.sun0769.com/dg/headnews/ | true | html / generic | 2026-09-18 11:55:48 北京时间 | 2026-09-24 13:54:23 北京时间 | ok | success；2026-09-24 13:54:24 北京时间 | 是（10 篇） |
| 停用预览 | 96266c07-c051-411c-90c1-572213cba632 | https://news.sun0769.com/dg/headnews/ | true | html / generic | 2026-09-12 19:39:37 北京时间 | 2026-09-24 13:57:04 北京时间 | ok | success；2026-09-24 13:57:05 北京时间 | 否（0 篇） |
| 停用预览 | 233879a9-5733-47f6-b295-149ed6334055 | https://news.sun0769.com/dg/headnews/ | true | html / generic | 2026-09-12 19:39:38 北京时间 | 2026-09-24 13:57:04 北京时间 | ok | success；2026-09-24 13:57:05 北京时间 | 否（0 篇） |

### D002 广西广播电视台 / website

media_id：`675ffbd4-db8a-4b6b-879e-bf0211278dfa`  
规范化 URL：https://news.gxtv.cn/

**建议保留：`5648f0b2-41b8-4767-bc7c-97ec35754f5f`**  
建议停用（不删除）：`f341e81d-2568-4a24-b237-09b4b0090d68`、`320d860a-3f04-4b78-92e1-9265a4590955`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 15 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 5648f0b2-41b8-4767-bc7c-97ec35754f5f | https://news.gxtv.cn/ | true | html / generic | 2026-09-12 19:39:10 北京时间 | 2026-09-24 13:47:20 北京时间 | ok | success；2026-09-24 13:47:20 北京时间 | 是（15 篇） |
| 停用预览 | f341e81d-2568-4a24-b237-09b4b0090d68 | https://news.gxtv.cn/ | true | html / generic | 2026-09-18 11:55:57 北京时间 | 2026-09-24 13:52:02 北京时间 | ok | success；2026-09-24 13:52:03 北京时间 | 否（0 篇） |
| 停用预览 | 320d860a-3f04-4b78-92e1-9265a4590955 | https://news.gxtv.cn/ | true | html / generic | 2026-09-12 19:39:09 北京时间 | 2026-09-24 13:49:43 北京时间 | ok | success；2026-09-24 13:49:44 北京时间 | 否（0 篇） |

### D003 黑龙江广播电视台 / website

media_id：`c728024b-01ff-49d6-bfd2-bc3ffa3cf4aa`  
规范化 URL：https://ljktx.dbw.cn/index.shtml

**建议保留：`cdb7460b-ad73-4396-919f-a73b76811c4f`**  
建议停用（不删除）：`21c0bd38-4146-40f6-8c10-2c46d51ff29b`、`70bbc948-f93c-47dd-a35e-3af48844a0e5`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | cdb7460b-ad73-4396-919f-a73b76811c4f | https://ljktx.dbw.cn/index.shtml | true | html / generic | 2026-09-12 19:38:50 北京时间 | 2026-09-24 13:44:18 北京时间 | ok | success；2026-09-24 13:44:18 北京时间 | 是（10 篇） |
| 停用预览 | 21c0bd38-4146-40f6-8c10-2c46d51ff29b | https://ljktx.dbw.cn/index.shtml | true | html / generic | 2026-09-12 19:38:50 北京时间 | 2026-09-24 13:44:18 北京时间 | ok | success；2026-09-24 13:44:18 北京时间 | 是（5 篇） |
| 停用预览 | 70bbc948-f93c-47dd-a35e-3af48844a0e5 | https://ljktx.dbw.cn/index.shtml | true | html / generic | 2026-09-18 11:56:08 北京时间 | 2026-09-24 13:54:22 北京时间 | ok | success；2026-09-24 13:54:22 北京时间 | 否（0 篇） |

### D004 上观新闻 / website

media_id：`ae8431dd-dc68-4483-a61c-05e4bf77f3b5`  
规范化 URL：https://www.shobserver.com/home

**建议保留：`426ee21e-2005-4f74-9ebc-6b3c74479a7f`**  
建议停用（不删除）：`bc248474-68ad-40a8-b20c-562bbb88f803`、`c25c2167-8be7-4c06-b399-d4dd537d2e12`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 426ee21e-2005-4f74-9ebc-6b3c74479a7f | https://www.shobserver.com/home | true | html / generic | 2026-09-12 19:38:51 北京时间 | 2026-09-24 16:05:45 北京时间 | ok | success；2026-09-24 16:05:46 北京时间 | 是（10 篇） |
| 停用预览 | bc248474-68ad-40a8-b20c-562bbb88f803 | https://www.shobserver.com/home | true | html / generic | 2026-09-18 11:55:48 北京时间 | 2026-09-24 16:10:52 北京时间 | ok | success；2026-09-24 16:10:53 北京时间 | 否（0 篇） |
| 停用预览 | c25c2167-8be7-4c06-b399-d4dd537d2e12 | https://www.shobserver.com/home | true | html / generic | 2026-09-12 19:38:51 北京时间 | 2026-09-24 16:03:24 北京时间 | ok | success；2026-09-24 16:03:25 北京时间 | 否（0 篇） |

### D005 天山网 / website

media_id：`05b0159a-2f62-4f79-b887-ca7a1e1f9cf5`  
规范化 URL：https://www.ts.cn/

**建议保留：`c9715174-3d3f-4438-9cae-2131ccd2509f`**  
建议停用（不删除）：`8a7bf076-3a46-4e5d-92e9-ad2108d883bf`、`a2cb1288-480e-490b-a067-4b6a3f57097c`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | c9715174-3d3f-4438-9cae-2131ccd2509f | https://www.ts.cn | true | html / generic | 2026-09-12 19:39:23 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:32 北京时间 | 否（0 篇） |
| 停用预览 | 8a7bf076-3a46-4e5d-92e9-ad2108d883bf | https://www.ts.cn | true | html / generic | 2026-09-12 19:39:24 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:18 北京时间 | 否（0 篇） |
| 停用预览 | a2cb1288-480e-490b-a067-4b6a3f57097c | https://www.ts.cn/ | true | html / generic | 2026-09-18 11:55:54 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:40:55 北京时间 | 否（0 篇） |

### D006 羊城晚报 / website

media_id：`b46b5c33-ceaa-4e94-95fd-f49873cb99f2`  
规范化 URL：http://www.ycwb.com/

**建议保留：`9c259287-10be-4684-8583-eafeb1249c3f`**  
建议停用（不删除）：`065e084c-f6ef-420c-b597-da53af5b81e2`、`c72caaed-ca57-480e-8e2a-fa5a0e40561d`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 16 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 9c259287-10be-4684-8583-eafeb1249c3f | http://www.ycwb.com | true | html / ycwb | 2026-09-12 19:39:09 北京时间 | 2026-09-24 16:03:00 北京时间 | ok | success；2026-09-24 16:03:01 北京时间 | 是（16 篇） |
| 停用预览 | 065e084c-f6ef-420c-b597-da53af5b81e2 | http://www.ycwb.com | true | html / ycwb | 2026-09-12 19:39:09 北京时间 | 2026-09-24 16:19:17 北京时间 | ok | success；2026-09-24 16:19:18 北京时间 | 是（10 篇） |
| 停用预览 | c72caaed-ca57-480e-8e2a-fa5a0e40561d | http://www.ycwb.com/ | true | html / ycwb | 2026-09-18 11:56:05 北京时间 | 2026-09-24 16:07:24 北京时间 | ok | success；2026-09-24 16:07:24 北京时间 | 是（10 篇） |

### D007 安徽广播电视台 / website

media_id：`70f60567-7a72-4b51-987f-8ee6a21660e8`  
规范化 URL：http://www.ahtv.cn/

**建议保留：`b128a33b-3860-400e-b2e8-2e941d8e81d2`**  
建议停用（不删除）：`db53b904-5199-44e7-bc1e-f84f698b6f43`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 4 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | b128a33b-3860-400e-b2e8-2e941d8e81d2 | http://www.ahtv.cn | true | html / 无匹配 | 2026-09-12 19:38:55 北京时间 | 2026-09-19 09:46:41 北京时间 | ok | fail / configuration_missing；2026-09-24 14:15:41 北京时间 | 是（4 篇） |
| 停用预览 | db53b904-5199-44e7-bc1e-f84f698b6f43 | http://www.ahtv.cn | true | html / 无匹配 | 2026-09-12 19:38:56 北京时间 | 2026-09-19 09:46:17 北京时间 | ok | fail / configuration_missing；2026-09-24 14:02:33 北京时间 | 是（1 篇） |

### D008 安徽日报 / website

media_id：`19a562bd-c048-4ad8-907c-a3d072682c30`  
规范化 URL：http://www.ahnews.com.cn/

**建议保留：`1e5e73a9-128f-4c15-ad5e-976657784b36`**  
建议停用（不删除）：`5a03a436-e657-4314-bb54-97191d9bffd8`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 1e5e73a9-128f-4c15-ad5e-976657784b36 | http://www.ahnews.com.cn | true | html / 无匹配 | 2026-09-12 19:38:55 北京时间 | 2026-09-19 09:47:57 北京时间 | ok | fail / configuration_missing；2026-09-24 15:56:44 北京时间 | 是（5 篇） |
| 停用预览 | 5a03a436-e657-4314-bb54-97191d9bffd8 | http://www.ahnews.com.cn | true | html / 无匹配 | 2026-09-12 19:38:55 北京时间 | 2026-09-19 09:47:27 北京时间 | ok | fail / configuration_missing；2026-09-24 15:50:03 北京时间 | 是（3 篇） |

### D009 北京日报 / website

media_id：`ea16bfb0-384e-4d09-a00a-f543d7bd822b`  
规范化 URL：http://www.bjd.com.cn/

**建议保留：`eefc1945-bb0f-4d61-bb95-7c42476f8f50`**  
建议停用（不删除）：`7c30674b-a07c-42d9-ba06-22e4fb538867`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 15 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | eefc1945-bb0f-4d61-bb95-7c42476f8f50 | http://www.bjd.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:41 北京时间 | 2026-09-24 16:20:56 北京时间 | ok | success；2026-09-24 16:20:56 北京时间 | 是（15 篇） |
| 停用预览 | 7c30674b-a07c-42d9-ba06-22e4fb538867 | http://www.bjd.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:41 北京时间 | 2026-09-24 13:59:37 北京时间 | ok | success；2026-09-24 13:59:37 北京时间 | 是（7 篇） |

### D010 常州广播电视台 / website

media_id：`b027702f-1c50-434a-971e-0d032727013e`  
规范化 URL：http://www.cztv.tv/

**建议保留：`d0b99757-7c2e-45a1-bc97-4a6577091b02`**  
建议停用（不删除）：`238071ef-bf94-483d-9d41-c7971110c253`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | d0b99757-7c2e-45a1-bc97-4a6577091b02 | http://www.cztv.tv | true | html / generic | 2026-09-12 19:39:27 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:42:55 北京时间 | 否（0 篇） |
| 停用预览 | 238071ef-bf94-483d-9d41-c7971110c253 | http://www.cztv.tv | true | html / generic | 2026-09-12 19:39:27 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:42:18 北京时间 | 否（0 篇） |

### D011 承德广播电视台 / website

media_id：`3d1d7222-8662-42ed-8d4b-0940dba54f6d`  
规范化 URL：http://www.chengde.gov.cn/

**建议保留：`e6ca3778-c11a-49a4-b69b-34f265fc8082`**  
建议停用（不删除）：`c48e42d3-ff35-4eaa-8b38-c2a6f41f9165`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 17 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | e6ca3778-c11a-49a4-b69b-34f265fc8082 | http://www.chengde.gov.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:42 北京时间 | 2026-09-24 16:34:33 北京时间 | ok | success；2026-09-24 16:34:34 北京时间 | 是（17 篇） |
| 停用预览 | c48e42d3-ff35-4eaa-8b38-c2a6f41f9165 | http://www.chengde.gov.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:43 北京时间 | 2026-09-24 13:59:35 北京时间 | ok | success；2026-09-24 13:59:36 北京时间 | 是（2 篇） |

### D012 重庆广播电视集团 / website

media_id：`d5e810ad-f278-421a-b0e3-229159700f94`  
规范化 URL：http://www.cbg.cn/

**建议保留：`60a4f608-c27a-4353-9bee-7617a7f6741f`**  
建议停用（不删除）：`e64be86c-98e8-4e00-848f-6f1c88b64675`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 60a4f608-c27a-4353-9bee-7617a7f6741f | http://www.cbg.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:12 北京时间 | 2026-09-24 16:33:01 北京时间 | ok | success；2026-09-24 16:33:02 北京时间 | 是（10 篇） |
| 停用预览 | e64be86c-98e8-4e00-848f-6f1c88b64675 | http://www.cbg.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:12 北京时间 | 2026-09-24 14:01:34 北京时间 | ok | success；2026-09-24 14:01:34 北京时间 | 否（0 篇） |

### D013 重庆日报 / website

media_id：`7152abd8-cc2b-4b46-ae05-df10e02ce25d`  
规范化 URL：http://www.cqnews.net/

**建议保留：`ff679027-1451-45a2-89a1-3e18c389e79a`**  
建议停用（不删除）：`54cfbdaa-1ec6-49c1-aeee-9a22dfca2daf`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 16 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | ff679027-1451-45a2-89a1-3e18c389e79a | http://www.cqnews.net | true | html / generic（source_id 白名单） | 2026-09-12 19:39:11 北京时间 | 2026-09-24 15:46:05 北京时间 | ok | success；2026-09-24 15:46:06 北京时间 | 是（16 篇） |
| 停用预览 | 54cfbdaa-1ec6-49c1-aeee-9a22dfca2daf | http://www.cqnews.net | true | html / generic（source_id 白名单） | 2026-09-12 19:39:12 北京时间 | 2026-09-24 15:52:56 北京时间 | ok | success；2026-09-24 15:52:57 北京时间 | 是（5 篇） |

### D014 大众日报 / website

media_id：`7e08e4b1-bf5b-4f83-a12d-9c7c2863057f`  
规范化 URL：http://paper.dzwww.com/

**建议保留：`a68a0a25-d30d-4c96-b97f-04ce2466dfe6`**  
建议停用（不删除）：`c09bc541-51dc-421e-a1af-2c1337044137`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 3 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | a68a0a25-d30d-4c96-b97f-04ce2466dfe6 | http://paper.dzwww.com | true | html / generic | 2026-09-12 19:38:58 北京时间 | 2026-09-24 11:04:37 北京时间 | ok | fail / no_valid_articles；2026-09-24 16:14:09 北京时间 | 是（3 篇） |
| 停用预览 | c09bc541-51dc-421e-a1af-2c1337044137 | http://paper.dzwww.com | true | html / generic | 2026-09-12 19:38:58 北京时间 | 2026-09-24 11:06:53 北京时间 | ok | fail / no_valid_articles；2026-09-24 16:16:02 北京时间 | 否（0 篇） |

### D015 东莞日报社 / website

media_id：`392bd6a7-f4c3-4892-8c75-f69398be69b2`  
规范化 URL：http://www.timedg.com/

**建议保留：`a8d72a09-8f77-436a-8dac-1b0f480bd506`**  
建议停用（不删除）：`8a906243-15af-4996-ab85-3cf8d99b5d9f`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 3 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | a8d72a09-8f77-436a-8dac-1b0f480bd506 | http://www.timedg.com | true | html / generic | 2026-09-12 19:39:38 北京时间 | 2026-09-24 16:31:38 北京时间 | ok | success；2026-09-24 16:31:39 北京时间 | 是（3 篇） |
| 停用预览 | 8a906243-15af-4996-ab85-3cf8d99b5d9f | http://www.timedg.com | true | html / generic | 2026-09-12 19:39:38 北京时间 | 2026-09-24 16:32:00 北京时间 | ok | success；2026-09-24 16:32:01 北京时间 | 否（0 篇） |

### D016 福建日报 / website

media_id：`3609236d-2d86-40ba-8dc9-b715fcc4a61e`  
规范化 URL：http://fjrb.fjdaily.com/

**建议保留：`ccef2051-e3ca-4f49-95df-67d5d0c3ec45`**  
建议停用（不删除）：`7bce761c-916b-4981-97a4-4b55fc2aaefb`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | ccef2051-e3ca-4f49-95df-67d5d0c3ec45 | http://fjrb.fjdaily.com | true | html / generic | 2026-09-12 19:38:56 北京时间 | 2026-09-24 16:31:36 北京时间 | ok | success；2026-09-24 16:31:36 北京时间 | 是（7 篇） |
| 停用预览 | 7bce761c-916b-4981-97a4-4b55fc2aaefb | http://fjrb.fjdaily.com | true | html / generic | 2026-09-12 19:38:56 北京时间 | 2026-09-24 16:31:36 北京时间 | ok | success；2026-09-24 16:31:37 北京时间 | 否（0 篇） |

### D017 福州日报社 / website

media_id：`a4e07cc2-9277-4d07-8809-15f59e088e22`  
规范化 URL：http://www.fznews.com.cn/

**建议保留：`8ffa92a9-f80e-4b4e-afe5-21a5f845c235`**  
建议停用（不删除）：`aba72198-c379-4a91-b9bd-d63ff1c06957`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 8ffa92a9-f80e-4b4e-afe5-21a5f845c235 | http://www.fznews.com.cn | true | html / 无匹配 | 2026-09-12 19:39:30 北京时间 | 2026-09-19 09:46:54 北京时间 | ok | fail / configuration_missing；2026-09-24 14:20:38 北京时间 | 是（5 篇） |
| 停用预览 | aba72198-c379-4a91-b9bd-d63ff1c06957 | http://www.fznews.com.cn | true | html / 无匹配 | 2026-09-12 19:39:31 北京时间 | 2026-09-19 09:45:56 北京时间 | ok | fail / configuration_missing；2026-09-24 13:59:20 北京时间 | 否（0 篇） |

### D018 甘肃广播电视总台 / website

media_id：`9be28e9e-aac2-4619-862a-1378c45921d8`  
规范化 URL：http://www.gstv.com.cn/

**建议保留：`cfc66d9f-74c6-4d6e-a5f7-48acddbc3b26`**  
建议停用（不删除）：`5f70c9ac-2e7d-4c48-aff8-f0da21c456ba`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | cfc66d9f-74c6-4d6e-a5f7-48acddbc3b26 | http://www.gstv.com.cn | true | html / generic | 2026-09-12 19:39:20 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:12 北京时间 | 否（0 篇） |
| 停用预览 | 5f70c9ac-2e7d-4c48-aff8-f0da21c456ba | http://www.gstv.com.cn | true | html / generic | 2026-09-12 19:39:20 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:26 北京时间 | 否（0 篇） |

### D019 甘肃日报 / website

media_id：`b12a8d29-b9cd-4305-b4da-6509fdeb52b6`  
规范化 URL：http://gansudaily.com.cn/

**建议保留：`fd7bb5eb-7a02-45c2-8ddb-755ef0808f01`**  
建议停用（不删除）：`dc889cf5-d70e-4d19-98d8-8e869dd06fbd`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 18 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | fd7bb5eb-7a02-45c2-8ddb-755ef0808f01 | http://gansudaily.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:20 北京时间 | 2026-09-24 15:47:47 北京时间 | ok | success；2026-09-24 15:47:48 北京时间 | 是（18 篇） |
| 停用预览 | dc889cf5-d70e-4d19-98d8-8e869dd06fbd | http://gansudaily.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:20 北京时间 | 2026-09-24 15:54:35 北京时间 | ok | success；2026-09-24 15:54:36 北京时间 | 是（1 篇） |

### D020 广东广播电视台 / website

media_id：`911602f0-723d-42f8-818e-6465d2e27fbd`  
规范化 URL：https://www.gdtv.cn/channels/2

**建议保留：`74602362-0599-4a34-856b-8a37fa23d694`**  
建议停用（不删除）：`c15e47a9-5af6-48bf-8cc3-ab2f9841c11c`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 74602362-0599-4a34-856b-8a37fa23d694 | https://www.gdtv.cn/channels/2 | true | html / generic | 2026-09-12 19:39:08 北京时间 | 2026-09-19 09:44:39 北京时间 | ok | fail / no_valid_articles；2026-09-24 13:46:59 北京时间 | 否（0 篇） |
| 停用预览 | c15e47a9-5af6-48bf-8cc3-ab2f9841c11c | https://www.gdtv.cn/channels/2 | true | html / generic | 2026-09-18 11:55:57 北京时间 | 2026-09-19 09:16:13 北京时间 | warning / 列表抓取失败: Page.goto: Timeout 15000ms exceeded. Call log:   - navigating to "https://www.gdtv.cn/channels/2", waiting until "domcontentloaded"  | fail / empty_list；2026-09-24 13:44:01 北京时间 | 否（0 篇） |

### D021 广州日报报业集团 / website

media_id：`f04a4d70-cc2c-4a1c-97dd-540c381d7532`  
规范化 URL：http://www.gzdaily.com/

**建议保留：`6c039ad2-065a-461c-99d6-77ca17bd12c6`**  
建议停用（不删除）：`a293c344-e0b9-4dc9-9ce9-103114c2750e`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 45 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 6c039ad2-065a-461c-99d6-77ca17bd12c6 | http://www.gzdaily.com | true | html / gzdaily | 2026-09-12 19:39:37 北京时间 | 2026-09-24 10:51:43 北京时间 | ok | fail / empty_list；2026-09-24 16:03:31 北京时间 | 是（45 篇） |
| 停用预览 | a293c344-e0b9-4dc9-9ce9-103114c2750e | http://www.gzdaily.com | true | html / gzdaily | 2026-09-12 19:39:36 北京时间 | 2026-09-24 11:08:35 北京时间 | ok | fail / empty_list；2026-09-24 16:17:46 北京时间 | 是（21 篇） |

### D022 贵州广播电视台 / website

media_id：`8460b917-a077-4d49-825b-0a8bd816ba66`  
规范化 URL：http://www.gzstv.com/

**建议保留：`7d04bbd9-21ba-4be1-bf6d-715e25f486c7`**  
建议停用（不删除）：`6b3e1417-6973-4fcb-bfd6-6acfc510b1f6`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 7d04bbd9-21ba-4be1-bf6d-715e25f486c7 | http://www.gzstv.com | true | html / 无匹配 | 2026-09-12 19:39:16 北京时间 | 2026-09-19 09:17:54 北京时间 | warning / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / configuration_missing；2026-09-24 13:43:55 北京时间 | 是（5 篇） |
| 停用预览 | 6b3e1417-6973-4fcb-bfd6-6acfc510b1f6 | http://www.gzstv.com | true | html / 无匹配 | 2026-09-12 19:39:16 北京时间 | 2026-09-19 09:46:18 北京时间 | ok | fail / configuration_missing；2026-09-24 14:02:33 北京时间 | 否（0 篇） |

### D023 合肥报业传媒集团 / website

media_id：`2c78ef92-7057-40c9-b2b3-759a474c9ef6`  
规范化 URL：http://www.hf365.com/

**建议保留：`dc290974-b8b6-4de0-b317-b0e183148422`**  
建议停用（不删除）：`bbfd79ed-0b05-4d02-95f0-9ce442a7cfcd`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 3 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | dc290974-b8b6-4de0-b317-b0e183148422 | http://www.hf365.com | true | html / 无匹配 | 2026-09-12 19:39:30 北京时间 | 2026-09-19 09:47:16 北京时间 | ok | fail / configuration_missing；2026-09-24 15:47:49 北京时间 | 是（3 篇） |
| 停用预览 | bbfd79ed-0b05-4d02-95f0-9ce442a7cfcd | http://www.hf365.com | true | html / 无匹配 | 2026-09-12 19:39:30 北京时间 | 2026-09-19 09:47:41 北京时间 | ok | fail / configuration_missing；2026-09-24 15:52:58 北京时间 | 是（2 篇） |

### D024 河北广播电视台 / website

media_id：`d8899a65-7cc9-4707-876d-6ceb2aa00e52`  
规范化 URL：http://www.hebtv.com/

**建议保留：`a02cc683-e0c5-4fb3-b519-cb5ed9f20d2b`**  
建议停用（不删除）：`c9e74975-16de-4d03-90c6-d4b3d58f44c0`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 4 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | a02cc683-e0c5-4fb3-b519-cb5ed9f20d2b | http://www.hebtv.com | true | html / 无匹配 | 2026-09-12 19:38:44 北京时间 | 2026-09-19 09:46:34 北京时间 | ok | fail / configuration_missing；2026-09-24 14:14:54 北京时间 | 是（4 篇） |
| 停用预览 | c9e74975-16de-4d03-90c6-d4b3d58f44c0 | http://www.hebtv.com | true | html / 无匹配 | 2026-09-12 19:38:44 北京时间 | 2026-09-19 09:46:07 北京时间 | ok | fail / configuration_missing；2026-09-24 14:00:22 北京时间 | 否（0 篇） |

### D025 河北日报 / website

media_id：`c8ef46ce-4f9a-4043-b790-a1c6be1e8f5f`  
规范化 URL：http://hebnews.cn/

**建议保留：`19e19f93-ce54-4b8b-8fb3-78eecde9ea36`**  
建议停用（不删除）：`0e09c24f-6e18-4b86-a89f-c0681d618000`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 4 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 19e19f93-ce54-4b8b-8fb3-78eecde9ea36 | http://hebnews.cn | true | html / 无匹配 | 2026-09-12 19:38:43 北京时间 | 2026-09-19 09:46:33 北京时间 | ok | fail / configuration_missing；2026-09-24 14:14:54 北京时间 | 是（4 篇） |
| 停用预览 | 0e09c24f-6e18-4b86-a89f-c0681d618000 | http://hebnews.cn | true | html / 无匹配 | 2026-09-12 19:38:44 北京时间 | 2026-09-19 09:46:08 北京时间 | ok | fail / configuration_missing；2026-09-24 14:00:49 北京时间 | 是（3 篇） |

### D026 河南广播电视台 / website

media_id：`736ef9bc-40ef-4ee6-8264-39d6efb50ac3`  
规范化 URL：http://www.hntv.tv/

**建议保留：`3b3e8713-d9d1-4b60-b727-d942f755b3ac`**  
建议停用（不删除）：`1f890937-4311-4bc2-9103-99f03c3eaece`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 1 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 3b3e8713-d9d1-4b60-b727-d942f755b3ac | http://www.hntv.tv | true | html / generic | 2026-09-12 19:39:00 北京时间 | 2026-09-24 16:17:36 北京时间 | ok | success；2026-09-24 16:17:36 北京时间 | 是（1 篇） |
| 停用预览 | 1f890937-4311-4bc2-9103-99f03c3eaece | http://www.hntv.tv | true | html / generic | 2026-09-12 19:39:01 北京时间 | 2026-09-24 16:15:44 北京时间 | ok | success；2026-09-24 16:15:45 北京时间 | 否（0 篇） |

### D027 黑龙江日报 / website

media_id：`e6f0cd68-56ed-4589-8fde-3d59a317c7af`  
规范化 URL：http://epaper.hljnews.cn/

**建议保留：`530cd61b-356a-49aa-8c6a-ecfc843e9325`**  
建议停用（不删除）：`f8266677-f5d5-4972-9224-39fef7e931e7`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 530cd61b-356a-49aa-8c6a-ecfc843e9325 | http://epaper.hljnews.cn | true | html / 无匹配 | 2026-09-12 19:38:49 北京时间 | 2026-09-19 09:47:54 北京时间 | ok | fail / configuration_missing；2026-09-24 15:56:24 北京时间 | 是（5 篇） |
| 停用预览 | f8266677-f5d5-4972-9224-39fef7e931e7 | http://epaper.hljnews.cn | true | html / 无匹配 | 2026-09-12 19:38:50 北京时间 | 2026-09-19 09:47:32 北京时间 | ok | fail / configuration_missing；2026-09-24 15:50:46 北京时间 | 否（0 篇） |

### D028 湖北广播电视台 / website

media_id：`c04ce106-14a3-4dc4-8c53-9c9a2999c1f0`  
规范化 URL：http://www.hbtv.com.cn/

**建议保留：`21ec8650-92b4-47c9-8615-8575faeb0fe9`**  
建议停用（不删除）：`e88a2818-9ddf-4f66-90d0-fc2c1cec69c4`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 21ec8650-92b4-47c9-8615-8575faeb0fe9 | http://www.hbtv.com.cn | true | html / generic | 2026-09-12 19:39:05 北京时间 | 2026-09-24 16:13:53 北京时间 | ok | success；2026-09-24 16:13:54 北京时间 | 否（0 篇） |
| 停用预览 | e88a2818-9ddf-4f66-90d0-fc2c1cec69c4 | http://www.hbtv.com.cn | true | html / generic | 2026-09-12 19:39:04 北京时间 | 2026-09-24 16:11:07 北京时间 | ok | success；2026-09-24 16:11:08 北京时间 | 否（0 篇） |

### D029 湖北日报 / website

media_id：`c1e36ab9-79ca-40fe-a824-6dbb26c6cf83`  
规范化 URL：http://www.hbnews.net/

**建议保留：`0bae6817-0fd9-4e75-97bf-f9e073e34fe0`**  
建议停用（不删除）：`f9305134-c7a5-4724-a02d-ca117e3129b7`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 3 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 0bae6817-0fd9-4e75-97bf-f9e073e34fe0 | http://www.hbnews.net | true | html / 无匹配 | 2026-09-12 19:39:03 北京时间 | 2026-09-19 09:47:17 北京时间 | ok | fail / configuration_missing；2026-09-24 15:47:49 北京时间 | 是（3 篇） |
| 停用预览 | f9305134-c7a5-4724-a02d-ca117e3129b7 | http://www.hbnews.net | true | html / 无匹配 | 2026-09-12 19:39:02 北京时间 | 2026-09-19 09:47:18 北京时间 | ok | fail / configuration_missing；2026-09-24 15:48:13 北京时间 | 是（2 篇） |

### D030 湖南广播电视台 / website

media_id：`2aa5c046-818e-4af0-8d47-72312861a5f6`  
规范化 URL：https://news.hunantv.com/

**建议保留：`0a09ee31-7f44-4011-a328-569491c86be2`**  
建议停用（不删除）：`981915e6-1108-418c-bac4-913dcfd974c0`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 0a09ee31-7f44-4011-a328-569491c86be2 | https://news.hunantv.com/ | true | html / generic | 2026-09-12 19:39:06 北京时间 | 2026-09-24 13:47:19 北京时间 | ok | success；2026-09-24 13:47:20 北京时间 | 是（10 篇） |
| 停用预览 | 981915e6-1108-418c-bac4-913dcfd974c0 | https://news.hunantv.com/ | true | html / generic | 2026-09-18 11:56:01 北京时间 | 2026-09-24 13:51:58 北京时间 | ok | success；2026-09-24 13:51:59 北京时间 | 否（0 篇） |

### D031 湖南日报 / website

media_id：`cfd0c75c-8846-4ef9-bfeb-890452a5833c`  
规范化 URL：http://www.voc.com.cn/

**建议保留：`1c89bfc7-71e0-478a-9f20-c2d357f05749`**  
建议停用（不删除）：`76a7e0ed-1f83-426c-855d-5e72b3f6cdd6`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 22 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 1c89bfc7-71e0-478a-9f20-c2d357f05749 | http://www.voc.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:05 北京时间 | 2026-09-24 16:38:51 北京时间 | ok | success；2026-09-24 16:38:51 北京时间 | 是（22 篇） |
| 停用预览 | 76a7e0ed-1f83-426c-855d-5e72b3f6cdd6 | http://www.voc.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:06 北京时间 | 2026-09-24 15:52:25 北京时间 | ok | success；2026-09-24 15:52:26 北京时间 | 否（0 篇） |

### D032 湖州市新闻传媒中心 / website

media_id：`eef09c2b-600b-4398-82e7-f56a694d08b8`  
规范化 URL：http://www.hz66.com/

**建议保留：`c3fd441b-87c6-4b87-9bc0-542c19b4913a`**  
建议停用（不删除）：`4884f74c-4d86-484e-9f86-dd0eac0f429e`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | c3fd441b-87c6-4b87-9bc0-542c19b4913a | http://www.hz66.com | true | html / generic | 2026-09-12 19:39:29 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:12 北京时间 | 否（0 篇） |
| 停用预览 | 4884f74c-4d86-484e-9f86-dd0eac0f429e | http://www.hz66.com | true | html / generic | 2026-09-12 19:39:29 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:46 北京时间 | 否（0 篇） |

### D033 华龙网 / website

media_id：`74f624e9-daac-43b4-b6c9-9a06593ae328`  
规范化 URL：https://www.cqliving.com/

**建议保留：`82e2f6c3-5ae8-4270-907f-063a8c280572`**  
建议停用（不删除）：`55a86b20-f146-4770-84d8-9093e0975e99`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 9 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 82e2f6c3-5ae8-4270-907f-063a8c280572 | https://www.cqliving.com | true | html / generic | 2026-09-12 19:39:13 北京时间 | 2026-09-24 10:48:03 北京时间 | ok | fail / empty_list；2026-09-24 15:59:52 北京时间 | 是（9 篇） |
| 停用预览 | 55a86b20-f146-4770-84d8-9093e0975e99 | https://www.cqliving.com | true | html / generic | 2026-09-12 19:39:13 北京时间 | 2026-09-24 11:09:28 北京时间 | ok | fail / empty_list；2026-09-24 16:17:47 北京时间 | 是（8 篇） |

### D034 吉林广播电视台 / website

media_id：`707fa244-d7da-4d3d-8b43-60c808f8aa66`  
规范化 URL：http://www.jlntv.cn/

**建议保留：`cbe9f3f4-5330-436f-9abb-ee761d89da10`**  
建议停用（不删除）：`da79ced7-4887-446c-9dc2-2895e715a96f`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | cbe9f3f4-5330-436f-9abb-ee761d89da10 | http://www.jlntv.cn | true | html / generic | 2026-09-12 19:38:49 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:41 北京时间 | 否（0 篇） |
| 停用预览 | da79ced7-4887-446c-9dc2-2895e715a96f | http://www.jlntv.cn | true | html / generic | 2026-09-12 19:38:49 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:41:40 北京时间 | 否（0 篇） |

### D035 济南广播电视台 / website

media_id：`26789265-f88c-47d8-a30d-bec664b22355`  
规范化 URL：http://www.e23.cn/

**建议保留：`da0a95b1-ea0b-465d-bd3d-4ea146d00a94`**  
建议停用（不删除）：`68d4af59-5f1e-487d-b9c5-346b43037e68`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 11 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | da0a95b1-ea0b-465d-bd3d-4ea146d00a94 | http://www.e23.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:34 北京时间 | 2026-09-24 14:43:06 北京时间 | ok | success；2026-09-24 14:43:07 北京时间 | 是（11 篇） |
| 停用预览 | 68d4af59-5f1e-487d-b9c5-346b43037e68 | http://www.e23.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:34 北京时间 | 2026-09-24 15:50:44 北京时间 | ok | success；2026-09-24 15:50:45 北京时间 | 否（0 篇） |

### D036 江苏省广播电视总台 / website

media_id：`7c6c7a10-256c-4d04-aa8d-54cf4d08e1ce`  
规范化 URL：http://www.jsbc.com/

**建议保留：`4700d44f-45d8-4527-a45d-edd9f4abc986`**  
建议停用（不删除）：`46d98481-3931-47c2-bb2f-b0b8e727d8e5`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 4700d44f-45d8-4527-a45d-edd9f4abc986 | http://www.jsbc.com | true | html / generic（source_id 白名单） | 2026-09-12 19:38:53 北京时间 | 2026-09-24 15:56:42 北京时间 | ok | success；2026-09-24 15:56:42 北京时间 | 是（5 篇） |
| 停用预览 | 46d98481-3931-47c2-bb2f-b0b8e727d8e5 | http://www.jsbc.com | true | html / generic（source_id 白名单） | 2026-09-12 19:38:53 北京时间 | 2026-09-24 15:52:01 北京时间 | ok | success；2026-09-24 15:52:03 北京时间 | 是（5 篇） |

### D037 江西广播电视台 / website

media_id：`0f30e346-0a6d-4692-8cf7-8ca7529237cc`  
规范化 URL：http://www.jxgdw.cn/

**建议保留：`baeb412b-6e2f-4380-b8bc-fd70d9a60045`**  
建议停用（不删除）：`c9f01e1b-94f9-4c13-9669-b4815ecedcb7`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | baeb412b-6e2f-4380-b8bc-fd70d9a60045 | http://www.jxgdw.cn | true | html / 无匹配 | 2026-09-12 19:38:58 北京时间 | 2026-09-19 09:46:42 北京时间 | ok | fail / configuration_missing；2026-09-24 14:18:09 北京时间 | 是（5 篇） |
| 停用预览 | c9f01e1b-94f9-4c13-9669-b4815ecedcb7 | http://www.jxgdw.cn | true | html / 无匹配 | 2026-09-12 19:38:58 北京时间 | 2026-09-19 09:46:14 北京时间 | ok | fail / configuration_missing；2026-09-24 14:01:07 北京时间 | 否（0 篇） |

### D038 江西日报 / website

media_id：`ccbc3bb6-69e8-412a-80b5-8ecccc4c7eee`  
规范化 URL：http://www.jxnews.com.cn/

**建议保留：`97525118-a931-4f9b-928f-17d9c7a7e2fa`**  
建议停用（不删除）：`c6970c61-9673-46c8-a4d3-3096a0113eba`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 97525118-a931-4f9b-928f-17d9c7a7e2fa | http://www.jxnews.com.cn | true | html / generic | 2026-09-12 19:38:57 北京时间 | 2026-09-24 13:49:21 北京时间 | ok | success；2026-09-24 13:49:21 北京时间 | 是（10 篇） |
| 停用预览 | c6970c61-9673-46c8-a4d3-3096a0113eba | http://www.jxnews.com.cn | true | html / generic | 2026-09-12 19:38:57 北京时间 | 2026-09-24 13:51:42 北京时间 | ok | success；2026-09-24 13:51:42 北京时间 | 否（0 篇） |

### D039 解放日报 / website

media_id：`072b06e9-a72c-43b1-8a94-07de664702ea`  
规范化 URL：http://www.jfdaily.com/

**建议保留：`550139e0-2ef6-47bc-9809-c8abb9616b30`**  
建议停用（不删除）：`ebe3da58-1e98-46b0-9ce9-4b93d8c5bded`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 550139e0-2ef6-47bc-9809-c8abb9616b30 | http://www.jfdaily.com | true | html / generic | 2026-09-12 19:38:50 北京时间 | 2026-09-24 16:07:47 北京时间 | ok | success；2026-09-24 16:07:47 北京时间 | 是（7 篇） |
| 停用预览 | ebe3da58-1e98-46b0-9ce9-4b93d8c5bded | http://www.jfdaily.com | true | html / generic | 2026-09-12 19:38:51 北京时间 | 2026-09-24 16:13:38 北京时间 | ok | success；2026-09-24 16:13:39 北京时间 | 是（1 篇） |

### D040 经济参考报 / website

media_id：`4bceb8de-a659-4b56-877c-978a8602d167`  
规范化 URL：http://www.jjckb.cn/

**建议保留：`f632c210-8ab1-4f64-8b9e-6317cf9bddad`**  
建议停用（不删除）：`6ce12ebe-a41e-47e1-b515-ab886f2dc9d9`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 14 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | f632c210-8ab1-4f64-8b9e-6317cf9bddad | http://www.jjckb.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:39 北京时间 | 2026-09-24 15:51:27 北京时间 | ok | success；2026-09-24 15:51:28 北京时间 | 是（14 篇） |
| 停用预览 | 6ce12ebe-a41e-47e1-b515-ab886f2dc9d9 | http://www.jjckb.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:38 北京时间 | 2026-09-24 15:55:42 北京时间 | ok | success；2026-09-24 15:55:42 北京时间 | 是（11 篇） |

### D041 辽宁日报 / website

media_id：`d1f805e3-cf00-434b-99e1-a025a7c50ee4`  
规范化 URL：http://epaper.lnd.com.cn/

**建议保留：`c0dad72d-5215-493a-a9c5-0bff27c90ce2`**  
建议停用（不删除）：`ca50c4a4-7682-4d85-94a6-03abdd1e8e43`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | c0dad72d-5215-493a-a9c5-0bff27c90ce2 | http://epaper.lnd.com.cn | true | html / generic | 2026-09-12 19:38:47 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:42:08 北京时间 | 否（0 篇） |
| 停用预览 | ca50c4a4-7682-4d85-94a6-03abdd1e8e43 | http://epaper.lnd.com.cn | true | html / generic | 2026-09-12 19:38:47 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:42:13 北京时间 | 否（0 篇） |

### D042 洛阳广播电视台 / website

media_id：`5d3a7017-fb42-4c4c-a6d7-04d4556b414d`  
规范化 URL：http://www.lytv.com.cn/

**建议保留：`c3034c4a-0188-4620-963d-6d3ff203d112`**  
建议停用（不删除）：`6f7af13b-e89a-46c0-b6fb-13637731723b`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 15 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | c3034c4a-0188-4620-963d-6d3ff203d112 | http://www.lytv.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:42 北京时间 | 2026-09-24 15:50:35 北京时间 | ok | success；2026-09-24 15:50:36 北京时间 | 是（15 篇） |
| 停用预览 | 6f7af13b-e89a-46c0-b6fb-13637731723b | http://www.lytv.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:42 北京时间 | 2026-09-24 15:55:00 北京时间 | ok | success；2026-09-24 15:55:01 北京时间 | 是（5 篇） |

### D043 湄洲日报 / website

media_id：`648f29df-a491-4332-90e3-6fda61ba79fa`  
规范化 URL：http://www.ptxw.com/

**建议保留：`7e0aaca5-7a69-47c9-aab2-dccf91861bdb`**  
建议停用（不删除）：`aa7ae184-3fbb-4ace-99c0-9e9b30f9df4d`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 20 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 7e0aaca5-7a69-47c9-aab2-dccf91861bdb | http://www.ptxw.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:32 北京时间 | 2026-09-24 16:34:52 北京时间 | ok | success；2026-09-24 16:34:52 北京时间 | 是（20 篇） |
| 停用预览 | aa7ae184-3fbb-4ace-99c0-9e9b30f9df4d | http://www.ptxw.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:32 北京时间 | 2026-09-24 14:00:48 北京时间 | ok | success；2026-09-24 14:00:48 北京时间 | 是（5 篇） |

### D044 南方日报 / website

media_id：`18415fb5-a68b-4781-96f9-84c9d17cf35a`  
规范化 URL：http://www.southcn.com/

**建议保留：`c7fb44f1-52bb-465d-a4c1-22f365645b7d`**  
建议停用（不删除）：`8b95aea9-ba61-459f-846c-eac870373dbf`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 38 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | c7fb44f1-52bb-465d-a4c1-22f365645b7d | http://www.southcn.com | true | html / southcn | 2026-09-12 19:39:08 北京时间 | 2026-09-24 16:18:34 北京时间 | ok | success；2026-09-24 16:18:35 北京时间 | 是（38 篇） |
| 停用预览 | 8b95aea9-ba61-459f-846c-eac870373dbf | http://www.southcn.com | true | html / southcn | 2026-09-12 19:39:07 北京时间 | 2026-09-24 16:20:17 北京时间 | ok | success；2026-09-24 16:20:17 北京时间 | 是（34 篇） |

### D045 南京广播电视台 / website

media_id：`66fb35f0-84d1-494c-971c-c00a97177ba6`  
规范化 URL：http://www.nbs.cn/

**建议保留：`ce10b415-2b18-4dbc-a4d1-ed4fe2ac71f7`**  
建议停用（不删除）：`6cbabd63-d2ec-4577-b459-867d80161a9d`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 6 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | ce10b415-2b18-4dbc-a4d1-ed4fe2ac71f7 | http://www.nbs.cn | true | html / 无匹配 | 2026-09-12 19:39:24 北京时间 | 2026-09-19 09:47:14 北京时间 | ok | fail / configuration_missing；2026-09-24 15:46:07 北京时间 | 是（6 篇） |
| 停用预览 | 6cbabd63-d2ec-4577-b459-867d80161a9d | http://www.nbs.cn | true | html / 无匹配 | 2026-09-12 19:39:24 北京时间 | 2026-09-19 09:47:23 北京时间 | ok | fail / configuration_missing；2026-09-24 15:48:37 北京时间 | 否（0 篇） |

### D046 内蒙古广播电视台 / website

media_id：`62d913fb-9839-4aa0-b17b-22a0f3d012c6`  
规范化 URL：http://www.nmtv.cn/

**建议保留：`b5387863-f152-4117-955b-f9412b6b4a92`**  
建议停用（不删除）：`e86e123c-7822-4902-865e-2a0cf80295ef`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | b5387863-f152-4117-955b-f9412b6b4a92 | http://www.nmtv.cn | true | html / generic | 2026-09-12 19:38:46 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:46 北京时间 | 否（0 篇） |
| 停用预览 | e86e123c-7822-4902-865e-2a0cf80295ef | http://www.nmtv.cn | true | html / generic | 2026-09-12 19:38:47 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:41:27 北京时间 | 否（0 篇） |

### D047 内蒙古日报 / website

media_id：`2cce0d71-709c-45f4-b27b-f4736dbaab96`  
规范化 URL：http://www.nmgnews.com.cn/

**建议保留：`91b12444-4be6-44b5-8147-ac02d5e678ba`**  
建议停用（不删除）：`2bb2ca0e-4999-4516-bf5b-3a5e6c8826eb`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 6 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 91b12444-4be6-44b5-8147-ac02d5e678ba | http://www.nmgnews.com.cn | true | html / generic | 2026-09-12 19:38:46 北京时间 | 2026-09-24 16:32:39 北京时间 | ok | success；2026-09-24 16:32:39 北京时间 | 是（6 篇） |
| 停用预览 | 2bb2ca0e-4999-4516-bf5b-3a5e6c8826eb | http://www.nmgnews.com.cn | true | html / generic | 2026-09-12 19:38:46 北京时间 | 2026-09-24 16:20:32 北京时间 | ok | success；2026-09-24 16:20:33 北京时间 | 是（3 篇） |

### D048 宁波日报报业集团 / website

media_id：`1868d59d-c4e4-41b2-a188-37abb88a75b6`  
规范化 URL：http://nbjt.cnnb.com.cn/

**建议保留：`dcbb89ca-777c-4ecf-835f-91ab445b908b`**  
建议停用（不删除）：`4231d731-0deb-4626-9aa4-66696a37ea12`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 12 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | dcbb89ca-777c-4ecf-835f-91ab445b908b | http://nbjt.cnnb.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:28 北京时间 | 2026-09-24 15:48:11 北京时间 | ok | success；2026-09-24 15:48:12 北京时间 | 是（12 篇） |
| 停用预览 | 4231d731-0deb-4626-9aa4-66696a37ea12 | http://nbjt.cnnb.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:28 北京时间 | 2026-09-24 15:48:31 北京时间 | ok | success；2026-09-24 15:48:32 北京时间 | 否（0 篇） |

### D049 宁夏广播电视台 / website

media_id：`51650397-b16e-4b20-baa2-5b996785ef68`  
规范化 URL：http://www.nxtv.com.cn/

**建议保留：`fb176cf9-f1f5-457d-b346-3aa30e253259`**  
建议停用（不删除）：`8defe366-e756-42f6-859c-ea2bf98e9cc4`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 14 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | fb176cf9-f1f5-457d-b346-3aa30e253259 | http://www.nxtv.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:22 北京时间 | 2026-09-24 14:04:05 北京时间 | ok | success；2026-09-24 14:04:06 北京时间 | 是（14 篇） |
| 停用预览 | 8defe366-e756-42f6-859c-ea2bf98e9cc4 | http://www.nxtv.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:22 北京时间 | 2026-09-24 14:20:34 北京时间 | ok | success；2026-09-24 14:20:36 北京时间 | 是（7 篇） |

### D050 澎湃新闻 / website

media_id：`8340ddea-f0a7-46a0-9032-59baaccd9c0d`  
规范化 URL：https://www.thepaper.cn/

**建议保留：`1954afb6-db52-4715-b4e1-51150a5183f6`**  
建议停用（不删除）：`5b231dec-f22b-47f8-8950-b7b69c823f11`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 16 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 1954afb6-db52-4715-b4e1-51150a5183f6 | https://www.thepaper.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:52 北京时间 | 2026-09-24 16:37:24 北京时间 | ok | success；2026-09-24 16:38:51 北京时间 | 是（16 篇） |
| 停用预览 | 5b231dec-f22b-47f8-8950-b7b69c823f11 | https://www.thepaper.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:52 北京时间 | 2026-09-24 16:37:41 北京时间 | ok | success；2026-09-24 16:38:51 北京时间 | 是（9 篇） |

### D051 青岛日报报业集团 / website

media_id：`a3d48480-d15f-4103-9dd8-4ff96ccde282`  
规范化 URL：http://www.qingdaonews.com/

**建议保留：`22c34aa8-0496-4354-a7e5-30c8715441e3`**  
建议停用（不删除）：`36f7fbcd-50ea-4f93-8822-ae6f6c13b541`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 12 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 22c34aa8-0496-4354-a7e5-30c8715441e3 | http://www.qingdaonews.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:33 北京时间 | 2026-09-24 16:45:30 北京时间 | ok | success；2026-09-24 16:45:31 北京时间 | 是（12 篇） |
| 停用预览 | 36f7fbcd-50ea-4f93-8822-ae6f6c13b541 | http://www.qingdaonews.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:33 北京时间 | 2026-09-24 14:18:50 北京时间 | ok | success；2026-09-24 14:18:51 北京时间 | 是（4 篇） |

### D052 青海日报 / website

media_id：`9f9f11a1-9ad7-482a-a939-a0a73eae2498`  
规范化 URL：http://www.qhnews.com/

**建议保留：`5aa968b9-2ba4-4224-b4d8-0e211c59bb4a`**  
建议停用（不删除）：`fc5765ef-c737-40e4-ba83-65545e6880a3`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 3 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 5aa968b9-2ba4-4224-b4d8-0e211c59bb4a | http://www.qhnews.com | true | html / 无匹配 | 2026-09-12 19:39:21 北京时间 | 2026-09-19 09:47:13 北京时间 | ok | fail / configuration_missing；2026-09-24 15:46:08 北京时间 | 是（3 篇） |
| 停用预览 | fc5765ef-c737-40e4-ba83-65545e6880a3 | http://www.qhnews.com | true | html / 无匹配 | 2026-09-12 19:39:21 北京时间 | 2026-09-19 09:47:19 北京时间 | ok | fail / configuration_missing；2026-09-24 15:48:13 北京时间 | 是（1 篇） |

### D053 求是 / website

media_id：`5e64a5bd-5dcc-4402-925e-11bcf414638d`  
规范化 URL：http://www.qstheory.cn/

**建议保留：`fddba8cb-abe9-4fb5-a62d-63a2c0c4268d`**  
建议停用（不删除）：`47cc51ca-0879-4f42-9ca1-fa3ddbe9deed`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | fddba8cb-abe9-4fb5-a62d-63a2c0c4268d | http://www.qstheory.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:37 北京时间 | 2026-09-24 14:00:20 北京时间 | ok | success；2026-09-24 14:00:21 北京时间 | 是（7 篇） |
| 停用预览 | 47cc51ca-0879-4f42-9ca1-fa3ddbe9deed | http://www.qstheory.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:37 北京时间 | 2026-09-24 14:14:48 北京时间 | ok | success；2026-09-24 14:14:51 北京时间 | 是（6 篇） |

### D054 人民日报 / website

media_id：`92a14871-1203-468e-994c-f3fcb9f947eb`  
规范化 URL：https://www.people.com.cn/GB/59476/index.html

**建议保留：`05178bdc-85c1-495c-92b1-aebf3cc55930`**  
建议停用（不删除）：`d3fe6108-0d6d-41f7-8061-62a9bdcf5018`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 12 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 05178bdc-85c1-495c-92b1-aebf3cc55930 | https://www.people.com.cn/GB/59476/index.html | true | html / generic | 2026-09-12 19:38:30 北京时间 | 2026-09-24 15:58:52 北京时间 | ok | success；2026-09-24 15:58:52 北京时间 | 是（12 篇） |
| 停用预览 | d3fe6108-0d6d-41f7-8061-62a9bdcf5018 | https://www.people.com.cn/GB/59476/index.html | true | html / generic | 2026-09-18 11:55:50 北京时间 | 2026-09-24 16:16:07 北京时间 | ok | success；2026-09-24 16:16:08 北京时间 | 是（1 篇） |

### D055 人民政协报 / website

media_id：`845d2237-6bf9-45a3-97d1-c30515d39dad`  
规范化 URL：http://www.rmzxw.com.cn/

**建议保留：`18508e26-7b48-44ee-b7fd-a013c2ac024f`**  
建议停用（不删除）：`a582584e-fc8a-466c-82ab-3aed793d3f8d`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 11 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 18508e26-7b48-44ee-b7fd-a013c2ac024f | http://www.rmzxw.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:36 北京时间 | 2026-09-24 15:51:26 北京时间 | ok | success；2026-09-24 15:51:27 北京时间 | 是（11 篇） |
| 停用预览 | a582584e-fc8a-466c-82ab-3aed793d3f8d | http://www.rmzxw.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:36 北京时间 | 2026-09-24 15:55:39 北京时间 | ok | success；2026-09-24 15:55:40 北京时间 | 是（5 篇） |

### D056 三明市融媒体中心 / website

media_id：`3a05e66b-78ee-4391-b61d-b3b48c073393`  
规范化 URL：http://www.smnet.com.cn/

**建议保留：`974480ac-4eba-4988-97dd-36b30e8feaff`**  
建议停用（不删除）：`90d8f489-7707-41fa-83b6-55d8721bc149`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 14 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 974480ac-4eba-4988-97dd-36b30e8feaff | http://www.smnet.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:31 北京时间 | 2026-09-24 15:48:35 北京时间 | ok | success；2026-09-24 15:48:36 北京时间 | 是（14 篇） |
| 停用预览 | 90d8f489-7707-41fa-83b6-55d8721bc149 | http://www.smnet.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:31 北京时间 | 2026-09-24 15:57:01 北京时间 | ok | success；2026-09-24 15:57:02 北京时间 | 是（7 篇） |

### D057 三峡日报 / website

media_id：`d8eb91ec-b093-4f15-941e-4ee8d4b3448a`  
规范化 URL：http://www.cn3x.com.cn/

**建议保留：`01c122dd-2489-4f96-985d-f6e364eca45f`**  
建议停用（不删除）：`9a3c4d34-e3e0-424d-815a-6e76b3e6a418`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 22 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 01c122dd-2489-4f96-985d-f6e364eca45f | http://www.cn3x.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:39 北京时间 | 2026-09-24 14:43:46 北京时间 | ok | success；2026-09-24 14:43:47 北京时间 | 是（22 篇） |
| 停用预览 | 9a3c4d34-e3e0-424d-815a-6e76b3e6a418 | http://www.cn3x.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:40 北京时间 | 2026-09-24 15:54:56 北京时间 | ok | success；2026-09-24 15:54:56 北京时间 | 否（0 篇） |

### D058 山西广播电视台 / website

media_id：`0fae45e4-46b7-4ece-9de9-8b5c25f47806`  
规范化 URL：http://www.sxrtv.com/

**建议保留：`72b79bb9-729f-4ffc-b123-d78454a1d3b8`**  
建议停用（不删除）：`ee3356a7-dfa4-447b-b636-cf39df7f4893`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 72b79bb9-729f-4ffc-b123-d78454a1d3b8 | http://www.sxrtv.com | true | html / 无匹配 | 2026-09-12 19:38:45 北京时间 | 2026-09-19 09:46:37 北京时间 | ok | fail / configuration_missing；2026-09-24 14:14:54 北京时间 | 是（7 篇） |
| 停用预览 | ee3356a7-dfa4-447b-b636-cf39df7f4893 | http://www.sxrtv.com | true | html / 无匹配 | 2026-09-12 19:38:46 北京时间 | 2026-09-19 09:46:10 北京时间 | ok | fail / configuration_missing；2026-09-24 14:00:49 北京时间 | 是（5 篇） |

### D059 山西日报 / website

media_id：`91a2278d-617e-4193-a817-a4cb00adfcd0`  
规范化 URL：http://www.sxrb.com/

**建议保留：`edf92267-797e-4424-9542-9e138cd4feba`**  
建议停用（不删除）：`a7eecada-fb58-4d73-8864-d70792dc46a4`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 11 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | edf92267-797e-4424-9542-9e138cd4feba | http://www.sxrb.com | true | html / generic（source_id 白名单） | 2026-09-12 19:38:45 北京时间 | 2026-09-24 14:01:06 北京时间 | ok | success；2026-09-24 14:01:06 北京时间 | 是（11 篇） |
| 停用预览 | a7eecada-fb58-4d73-8864-d70792dc46a4 | http://www.sxrb.com | true | html / generic（source_id 白名单） | 2026-09-12 19:38:45 北京时间 | 2026-09-19 09:46:35 北京时间 | ok | fail / ingest_failed；2026-09-24 14:15:40 北京时间 | 是（7 篇） |

### D060 陕西广播电视台 / website

media_id：`78426f53-ffb5-4ef2-9f20-7c71fdcc3588`  
规范化 URL：http://www.sxtvs.com/

**建议保留：`2dfa3495-262b-426c-a49a-57b9bb6c12bc`**  
建议停用（不删除）：`a2e5e1ec-867d-4928-babb-b894f8e56ca3`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 2dfa3495-262b-426c-a49a-57b9bb6c12bc | http://www.sxtvs.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:19 北京时间 | 2026-09-24 14:43:45 北京时间 | ok | success；2026-09-24 14:43:46 北京时间 | 是（10 篇） |
| 停用预览 | a2e5e1ec-867d-4928-babb-b894f8e56ca3 | http://www.sxtvs.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:19 北京时间 | 2026-09-24 15:51:58 北京时间 | ok | success；2026-09-24 15:52:00 北京时间 | 否（0 篇） |

### D061 陕西日报 / website

media_id：`5296caf5-2b0b-4205-b882-c13b3c12e233`  
规范化 URL：http://www.sxdaily.com.cn/

**建议保留：`ac105550-3aec-46f4-9739-4d73b29ea091`**  
建议停用（不删除）：`4c97f4f1-aeea-4ef1-899e-9509fdd966d8`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 14 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | ac105550-3aec-46f4-9739-4d73b29ea091 | http://www.sxdaily.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:19 北京时间 | 2026-09-24 13:59:59 北京时间 | ok | success；2026-09-24 13:59:59 北京时间 | 是（14 篇） |
| 停用预览 | 4c97f4f1-aeea-4ef1-899e-9509fdd966d8 | http://www.sxdaily.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:18 北京时间 | 2026-09-24 14:20:02 北京时间 | ok | success；2026-09-24 14:20:03 北京时间 | 是（6 篇） |

### D062 上海广播电视台 / website

media_id：`84500184-6a31-42fa-8c39-a33c57135057`  
规范化 URL：http://www.smg.cn/

**建议保留：`9efe1520-f823-4068-9be0-2d3594095542`**  
建议停用（不删除）：`3e82b8c3-9c1b-40a7-bc68-b64bf738aff8`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 6 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 9efe1520-f823-4068-9be0-2d3594095542 | http://www.smg.cn | true | html / 无匹配 | 2026-09-12 19:38:51 北京时间 | 2026-09-19 09:46:38 北京时间 | ok | fail / configuration_missing；2026-09-24 14:15:41 北京时间 | 是（6 篇） |
| 停用预览 | 3e82b8c3-9c1b-40a7-bc68-b64bf738aff8 | http://www.smg.cn | true | html / 无匹配 | 2026-09-12 19:38:51 北京时间 | 2026-09-19 09:46:11 北京时间 | ok | fail / configuration_missing；2026-09-24 14:00:49 北京时间 | 是（1 篇） |

### D063 深圳报业集团 / website

media_id：`ff0e8737-3a4f-47f5-b97e-7ad8e2de83a5`  
规范化 URL：http://www.sznews.com/

**建议保留：`7a0caa4d-ff34-4063-8439-356ae774e0e2`**  
建议停用（不删除）：`419c9f3c-e25b-4134-b242-57ea5cfefe61`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 17 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 7a0caa4d-ff34-4063-8439-356ae774e0e2 | http://www.sznews.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:35 北京时间 | 2026-09-24 14:43:05 北京时间 | ok | success；2026-09-24 14:43:06 北京时间 | 是（17 篇） |
| 停用预览 | 419c9f3c-e25b-4134-b242-57ea5cfefe61 | http://www.sznews.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:35 北京时间 | 2026-09-24 15:49:18 北京时间 | ok | success；2026-09-24 15:49:19 北京时间 | 否（0 篇） |

### D064 深圳广播电影电视集团 / website

media_id：`6377308c-a6a6-4ebb-96af-329611ce73b6`  
规范化 URL：http://www.szmg.com.cn/

**建议保留：`11f9b432-d220-4a81-810a-65b5e0f6db99`**  
建议停用（不删除）：`0989bf8b-9b44-43fe-90f4-18553eeb9aea`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 43 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 11f9b432-d220-4a81-810a-65b5e0f6db99 | http://www.szmg.com.cn | true | html / generic | 2026-09-12 19:39:36 北京时间 | 2026-09-24 16:03:48 北京时间 | ok | success；2026-09-24 16:03:48 北京时间 | 是（43 篇） |
| 停用预览 | 0989bf8b-9b44-43fe-90f4-18553eeb9aea | http://www.szmg.com.cn | true | html / generic | 2026-09-12 19:39:35 北京时间 | 2026-09-24 16:06:16 北京时间 | ok | success；2026-09-24 16:06:17 北京时间 | 是（16 篇） |

### D065 沈阳日报 / website

media_id：`91696414-b9ee-47ae-906d-bd3771bb3adc`  
规范化 URL：http://www.syd.com.cn/

**建议保留：`71800c5f-47f5-4b22-8d0f-e56caaf70cce`**  
建议停用（不删除）：`e69e1ebd-f5ab-4113-af20-84b8c57b0338`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 71800c5f-47f5-4b22-8d0f-e56caaf70cce | http://www.syd.com.cn | true | html / 无匹配 | 2026-09-12 19:39:45 北京时间 | 2026-09-19 09:46:49 北京时间 | ok | fail / configuration_missing；2026-09-24 14:18:53 北京时间 | 是（7 篇） |
| 停用预览 | e69e1ebd-f5ab-4113-af20-84b8c57b0338 | http://www.syd.com.cn | true | html / 无匹配 | 2026-09-12 19:39:45 北京时间 | 2026-09-19 09:45:55 北京时间 | ok | fail / configuration_missing；2026-09-24 13:57:11 北京时间 | 是（5 篇） |

### D066 石家庄日报 / website

media_id：`169e4529-b024-4959-8321-a74c79a2df7a`  
规范化 URL：http://www.sjzdaily.com.cn/index.shtml

**建议保留：`01ade713-0acc-44a4-8443-58e70841746e`**  
建议停用（不删除）：`3fdfe6a8-6696-4809-812a-492d82ff0dde`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 01ade713-0acc-44a4-8443-58e70841746e | http://www.sjzdaily.com.cn/index.shtml | true | html / generic | 2026-09-12 19:39:43 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:42:48 北京时间 | 否（0 篇） |
| 停用预览 | 3fdfe6a8-6696-4809-812a-492d82ff0dde | http://www.sjzdaily.com.cn/index.shtml | true | html / generic | 2026-09-18 11:56:04 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:41:38 北京时间 | 否（0 篇） |

### D067 四川广播电视台 / website

media_id：`af998816-98e2-4114-b64e-71742048c06c`  
规范化 URL：http://www.sctv.com/

**建议保留：`3994763a-0708-4c33-88ad-ea51991bdd1b`**  
建议停用（不删除）：`70e7de9e-d955-459d-8706-95086e9db0d6`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 22 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 3994763a-0708-4c33-88ad-ea51991bdd1b | http://www.sctv.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:14 北京时间 | 2026-09-24 14:43:48 北京时间 | ok | success；2026-09-24 14:43:49 北京时间 | 是（22 篇） |
| 停用预览 | 70e7de9e-d955-459d-8706-95086e9db0d6 | http://www.sctv.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:14 北京时间 | 2026-09-24 15:53:21 北京时间 | ok | success；2026-09-24 15:53:22 北京时间 | 否（0 篇） |

### D068 四川日报 / website

media_id：`629381a5-0666-4bb9-b05c-c3820e3c3b94`  
规范化 URL：http://www.scol.com.cn/

**建议保留：`4d7f94b3-48f3-45c2-9431-f5fee615b297`**  
建议停用（不删除）：`b404c528-8930-4beb-b7a3-07e1c4bdb49a`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 21 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 4d7f94b3-48f3-45c2-9431-f5fee615b297 | http://www.scol.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:14 北京时间 | 2026-09-24 16:34:47 北京时间 | ok | success；2026-09-24 16:34:48 北京时间 | 是（21 篇） |
| 停用预览 | b404c528-8930-4beb-b7a3-07e1c4bdb49a | http://www.scol.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:14 北京时间 | 2026-09-24 14:00:16 北京时间 | ok | success；2026-09-24 14:00:16 北京时间 | 是（4 篇） |

### D069 苏州广播电视总台 / website

media_id：`23178c9a-b916-4a03-9dce-079eb426ee21`  
规范化 URL：http://www.csztv.cn/

**建议保留：`ad7a164d-2508-4afd-a3ac-a1da99f24c5a`**  
建议停用（不删除）：`5878737f-a633-42db-850d-0341e29c1f8b`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 12 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | ad7a164d-2508-4afd-a3ac-a1da99f24c5a | http://www.csztv.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:25 北京时间 | 2026-09-24 15:46:33 北京时间 | ok | success；2026-09-24 15:46:34 北京时间 | 是（12 篇） |
| 停用预览 | 5878737f-a633-42db-850d-0341e29c1f8b | http://www.csztv.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:26 北京时间 | 2026-09-24 15:53:22 北京时间 | ok | success；2026-09-24 15:53:23 北京时间 | 否（0 篇） |

### D070 苏州日报社 / website

media_id：`e1a06f69-691c-403a-8866-0a373bef182c`  
规范化 URL：http://www.subaonet.com/

**建议保留：`6f518a63-b136-4919-83aa-9db4058b0739`**  
建议停用（不删除）：`c1a8577e-adfe-4ee6-aa97-d5efceefcb65`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 9 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 6f518a63-b136-4919-83aa-9db4058b0739 | http://www.subaonet.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:25 北京时间 | 2026-09-24 14:13:47 北京时间 | ok | success；2026-09-24 14:13:47 北京时间 | 是（9 篇） |
| 停用预览 | c1a8577e-adfe-4ee6-aa97-d5efceefcb65 | http://www.subaonet.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:25 北京时间 | 2026-09-24 14:21:00 北京时间 | ok | success；2026-09-24 14:21:01 北京时间 | 是（6 篇） |

### D071 天津海河传媒中心（天津日报） / website

media_id：`bf36bedb-3c7c-4805-98b7-5167f30e5b30`  
规范化 URL：http://www.tianjinwe.com/

**建议保留：`8a4e5086-2d8b-43bc-9b9b-126e8e25a2c8`**  
建议停用（不删除）：`d9078301-e6dc-4954-a7df-20f7037ef7cd`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 8a4e5086-2d8b-43bc-9b9b-126e8e25a2c8 | http://www.tianjinwe.com | true | html / 无匹配 | 2026-09-12 19:38:42 北京时间 | 2026-09-19 09:47:53 北京时间 | ok | fail / configuration_missing；2026-09-24 15:56:24 北京时间 | 是（5 篇） |
| 停用预览 | d9078301-e6dc-4954-a7df-20f7037ef7cd | http://www.tianjinwe.com | true | html / 无匹配 | 2026-09-12 19:38:42 北京时间 | 2026-09-19 09:47:28 北京时间 | ok | fail / configuration_missing；2026-09-24 15:50:03 北京时间 | 否（0 篇） |

### D072 吐鲁番日报 / website

media_id：`7645d54d-bae2-461a-862a-b8121499b847`  
规范化 URL：http://www.tlf.gov.cn/

**建议保留：`3526b315-9247-428d-a089-e6e11b03b879`**  
建议停用（不删除）：`e33acb19-46e7-4497-8272-0b98d3949b74`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 13 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 3526b315-9247-428d-a089-e6e11b03b879 | http://www.tlf.gov.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:46 北京时间 | 2026-09-24 14:00:17 北京时间 | ok | success；2026-09-24 14:00:18 北京时间 | 是（13 篇） |
| 停用预览 | e33acb19-46e7-4497-8272-0b98d3949b74 | http://www.tlf.gov.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:46 北京时间 | 2026-09-24 14:19:21 北京时间 | ok | success；2026-09-24 14:19:22 北京时间 | 是（5 篇） |

### D073 温州市新闻传媒中心 / website

media_id：`50c0bdff-f1a4-4399-93b9-c0db265454af`  
规范化 URL：http://www.wzxwcm.com/

**建议保留：`195f5aa5-c140-4972-9be1-aacf643f1878`**  
建议停用（不删除）：`ecf74c6c-1385-40df-b2a6-bf3e7794c88b`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 9 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 195f5aa5-c140-4972-9be1-aacf643f1878 | http://www.wzxwcm.com | true | html / 无匹配 | 2026-09-12 19:39:28 北京时间 | 2026-09-17 15:59:29 北京时间 | warning / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / configuration_missing；2026-09-24 13:43:49 北京时间 | 是（9 篇） |
| 停用预览 | ecf74c6c-1385-40df-b2a6-bf3e7794c88b | http://www.wzxwcm.com | true | html / 无匹配 | 2026-09-12 19:39:29 北京时间 | 2026-09-17 16:06:55 北京时间 | warning / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / configuration_missing；2026-09-24 13:43:49 北京时间 | 否（0 篇） |

### D074 无锡日报报业集团 / website

media_id：`d8782739-5d66-446d-b7dc-a8145babf0bc`  
规范化 URL：http://www.wxrb.com/

**建议保留：`f6deb4f6-0360-4bb4-a880-561eb551bf4c`**  
建议停用（不删除）：`88db6c96-e629-41aa-af16-c42f08219c04`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 12 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | f6deb4f6-0360-4bb4-a880-561eb551bf4c | http://www.wxrb.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:26 北京时间 | 2026-09-24 14:13:37 北京时间 | ok | success；2026-09-24 14:13:38 北京时间 | 是（12 篇） |
| 停用预览 | 88db6c96-e629-41aa-af16-c42f08219c04 | http://www.wxrb.com | true | html / generic（source_id 白名单） | 2026-09-12 19:39:26 北京时间 | 2026-09-24 14:21:00 北京时间 | ok | success；2026-09-24 14:21:01 北京时间 | 是（5 篇） |

### D075 西藏日报 / website

media_id：`a1b67d3e-b993-43fd-9af3-e5975b78ebec`  
规范化 URL：http://www.chinatibetnews.com/

**建议保留：`060b95e5-770d-41d3-a806-acc90d8c5f5b`**  
建议停用（不删除）：`c7ab056d-d395-411c-8f50-b66e13704b79`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 060b95e5-770d-41d3-a806-acc90d8c5f5b | http://www.chinatibetnews.com | true | html / generic | 2026-09-12 19:39:18 北京时间 | 2026-09-24 16:31:56 北京时间 | ok | success；2026-09-24 16:31:57 北京时间 | 是（10 篇） |
| 停用预览 | c7ab056d-d395-411c-8f50-b66e13704b79 | http://www.chinatibetnews.com | true | html / generic | 2026-09-12 19:39:17 北京时间 | 2026-09-24 16:31:58 北京时间 | ok | success；2026-09-24 16:31:59 北京时间 | 否（0 篇） |

### D076 锡林郭勒盟日报 / website

media_id：`fd1d18c7-f390-4cd0-8b87-d72a7e0a984c`  
规范化 URL：http://www.xlgl.gov.cn/

**建议保留：`234c65a1-6c67-4531-a665-806c27bfb8e8`**  
建议停用（不删除）：`9107eb61-1648-4e8b-b249-6353e881cc06`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 234c65a1-6c67-4531-a665-806c27bfb8e8 | http://www.xlgl.gov.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:43 北京时间 | 2026-09-24 13:44:25 北京时间 | ok | success；2026-09-24 13:44:25 北京时间 | 是（7 篇） |
| 停用预览 | 9107eb61-1648-4e8b-b249-6353e881cc06 | http://www.xlgl.gov.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:44 北京时间 | 2026-09-24 13:37:41 北京时间 | ok | fail / empty_list；2026-09-24 16:32:45 北京时间 | 是（11 篇） |

### D077 新华日报 / website

media_id：`add06f79-b43b-4526-9df6-ddcd68e4026d`  
规范化 URL：http://www.xhby.net/

**建议保留：`25e2a75a-8265-4546-8150-6f1fc205143f`**  
建议停用（不删除）：`6d77e808-c44b-4304-a114-ea8cde202f8f`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 13 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 25e2a75a-8265-4546-8150-6f1fc205143f | http://www.xhby.net | true | html / generic（source_id 白名单） | 2026-09-12 19:38:52 北京时间 | 2026-09-24 14:02:32 北京时间 | ok | success；2026-09-24 14:02:32 北京时间 | 是（13 篇） |
| 停用预览 | 6d77e808-c44b-4304-a114-ea8cde202f8f | http://www.xhby.net | true | html / generic（source_id 白名单） | 2026-09-12 19:38:52 北京时间 | 2026-09-24 14:18:03 北京时间 | ok | success；2026-09-24 14:18:08 北京时间 | 是（11 篇） |

### D078 新疆广播电视台 / website

media_id：`029ab681-1e94-4c44-afb6-876fe0dccf20`  
规范化 URL：http://www.xjtvs.com.cn/

**建议保留：`15fc5d8e-9e54-4ac3-ba65-d84af0250141`**  
建议停用（不删除）：`c354a630-9913-4aab-9184-f3bea75628ba`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 15fc5d8e-9e54-4ac3-ba65-d84af0250141 | http://www.xjtvs.com.cn | true | html / generic | 2026-09-12 19:39:23 北京时间 | 2026-09-18 17:17:43 北京时间 | warning / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:20 北京时间 | 否（0 篇） |
| 停用预览 | c354a630-9913-4aab-9184-f3bea75628ba | http://www.xjtvs.com.cn | true | html / generic | 2026-09-12 19:39:23 北京时间 | 2026-09-18 17:17:43 北京时间 | warning / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:48 北京时间 | 否（0 篇） |

### D079 徐州广播电视台 / website

media_id：`f2467aa6-7d5f-4b08-b43b-37f8122cf1c0`  
规范化 URL：http://www.xztv.com.cn/

**建议保留：`10ec9e4c-fd47-49bb-ae8e-65e016b1b1a1`**  
建议停用（不删除）：`3e031367-ebd5-435f-ae68-c60337449499`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 10ec9e4c-fd47-49bb-ae8e-65e016b1b1a1 | http://www.xztv.com.cn | true | html / generic | 2026-09-12 19:39:26 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:42:17 北京时间 | 否（0 篇） |
| 停用预览 | 3e031367-ebd5-435f-ae68-c60337449499 | http://www.xztv.com.cn | true | html / generic | 2026-09-12 19:39:26 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:31 北京时间 | 否（0 篇） |

### D080 学习时报 / website

media_id：`bd760b1a-4d94-4ec0-9bb3-9c08592a2c7e`  
规范化 URL：http://www.studytimes.cn/

**建议保留：`a2efcfea-cd51-4294-b64a-325abf7f1369`**  
建议停用（不删除）：`025e7bbd-6973-4a45-8cef-d7aaa3255e0c`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | a2efcfea-cd51-4294-b64a-325abf7f1369 | http://www.studytimes.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:39 北京时间 | 2026-09-24 14:00:47 北京时间 | ok | success；2026-09-24 14:00:48 北京时间 | 是（10 篇） |
| 停用预览 | 025e7bbd-6973-4a45-8cef-d7aaa3255e0c | http://www.studytimes.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:39 北京时间 | 2026-09-24 14:14:52 北京时间 | ok | success；2026-09-24 14:14:53 北京时间 | 是（7 篇） |

### D081 榆林日报 / website

media_id：`2b177acf-d7e4-4385-aa7d-031168cbf64d`  
规范化 URL：http://www.ylrb.com/

**建议保留：`4b2f2ca9-8ec1-4271-a6a2-caba0d208576`**  
建议停用（不删除）：`6fdcbac0-dac1-4816-aafb-b96e14b9bee1`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 4b2f2ca9-8ec1-4271-a6a2-caba0d208576 | http://www.ylrb.com | true | html / 无匹配 | 2026-09-12 19:39:44 北京时间 | 2026-09-19 09:46:47 北京时间 | ok | fail / configuration_missing；2026-09-24 14:18:10 北京时间 | 是（7 篇） |
| 停用预览 | 6fdcbac0-dac1-4816-aafb-b96e14b9bee1 | http://www.ylrb.com | true | html / 无匹配 | 2026-09-12 19:39:44 北京时间 | 2026-09-19 09:17:02 北京时间 | warning / 列表抓取失败: Page.goto: net::ERR_EMPTY_RESPONSE at http://www.ylrb.com/ Call log:   - navigating to "http://www.ylrb.com/", waiting until "domcontentloaded"  | fail / configuration_missing；2026-09-24 13:43:55 北京时间 | 是（2 篇） |

### D082 云南广播电视台 / website

media_id：`ea77f662-16b0-409e-80f1-70ef9e8bd71d`  
规范化 URL：http://www.yntv.cn/

**建议保留：`24106efe-5518-4b83-9e83-79c750e50fbe`**  
建议停用（不删除）：`d6cf2deb-a181-4afd-8b07-1c0f7e90dee4`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 7 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 24106efe-5518-4b83-9e83-79c750e50fbe | http://www.yntv.cn | true | html / 无匹配 | 2026-09-12 19:39:17 北京时间 | 2026-09-19 09:46:46 北京时间 | ok | fail / configuration_missing；2026-09-24 14:18:10 北京时间 | 是（7 篇） |
| 停用预览 | d6cf2deb-a181-4afd-8b07-1c0f7e90dee4 | http://www.yntv.cn | true | html / 无匹配 | 2026-09-12 19:39:17 北京时间 | 2026-09-19 09:46:19 北京时间 | ok | fail / configuration_missing；2026-09-24 14:02:33 北京时间 | 是（5 篇） |

### D083 云南日报 / website

media_id：`1856ca2a-93aa-4075-a1e5-3c88d00c96bc`  
规范化 URL：http://yndaily.yunnan.cn/

**建议保留：`a6f6d5f3-b5e9-46c3-8317-b10c35b3ef83`**  
建议停用（不删除）：`08e2ed86-472a-4210-9ebc-c71d714d614c`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 14 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | a6f6d5f3-b5e9-46c3-8317-b10c35b3ef83 | http://yndaily.yunnan.cn | true | html / generic | 2026-09-12 19:39:17 北京时间 | 2026-09-24 15:57:39 北京时间 | ok | success；2026-09-24 15:57:40 北京时间 | 是（14 篇） |
| 停用预览 | 08e2ed86-472a-4210-9ebc-c71d714d614c | http://yndaily.yunnan.cn | true | html / generic | 2026-09-12 19:39:16 北京时间 | 2026-09-24 16:01:03 北京时间 | ok | success；2026-09-24 16:01:04 北京时间 | 是（5 篇） |

### D084 长江日报 / website

media_id：`0fbc62c6-8b98-47b1-b244-7377e3487e6c`  
规范化 URL：http://www.cjn.cn/

**建议保留：`0bc828f6-4dba-42b1-b7a2-40f26f8295fd`**  
建议停用（不删除）：`34357650-ec67-4c9a-8b01-f6a4f338c30b`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 11 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 0bc828f6-4dba-42b1-b7a2-40f26f8295fd | http://www.cjn.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:38 北京时间 | 2026-09-24 14:21:25 北京时间 | ok | success；2026-09-24 14:21:27 北京时间 | 是（11 篇） |
| 停用预览 | 34357650-ec67-4c9a-8b01-f6a4f338c30b | http://www.cjn.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:39:39 北京时间 | 2026-09-19 09:47:17 北京时间 | ok | fail / empty_list；2026-09-24 15:47:54 北京时间 | 否（0 篇） |

### D085 长沙晚报社 / website

media_id：`243344d4-fce9-4787-a32c-ad6f5291b194`  
规范化 URL：http://www.icswb.com/

**建议保留：`3d881b65-30dd-4bde-917a-2c69aae72ce5`**  
建议停用（不删除）：`fc7b783a-efbd-4081-b9a4-0cadadca9ea0`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 3d881b65-30dd-4bde-917a-2c69aae72ce5 | http://www.icswb.com | true | html / 无匹配 | 2026-09-12 19:39:40 北京时间 | 2026-09-19 09:17:52 北京时间 | warning / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / configuration_missing；2026-09-24 13:43:55 北京时间 | 是（5 篇） |
| 停用预览 | fc7b783a-efbd-4081-b9a4-0cadadca9ea0 | http://www.icswb.com | true | html / 无匹配 | 2026-09-12 19:39:41 北京时间 | 2026-09-19 09:46:23 北京时间 | ok | fail / configuration_missing；2026-09-24 14:04:07 北京时间 | 是（2 篇） |

### D086 浙江广播电视集团 / website

media_id：`111c1597-20fe-438c-bb44-31d551f71bbd`  
规范化 URL：http://www.cztv.com/

**建议保留：`0b776882-f7c1-4e20-b9b7-1619cfa72d5b`**  
建议停用（不删除）：`1c542c4d-689f-4e2d-838a-a49745a40917`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 5 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 0b776882-f7c1-4e20-b9b7-1619cfa72d5b | http://www.cztv.com | true | html / generic | 2026-09-12 19:38:54 北京时间 | 2026-09-24 16:34:16 北京时间 | ok | success；2026-09-24 16:34:16 北京时间 | 是（5 篇） |
| 停用预览 | 1c542c4d-689f-4e2d-838a-a49745a40917 | http://www.cztv.com | true | html / generic | 2026-09-12 19:38:55 北京时间 | 2026-09-24 13:59:18 北京时间 | ok | success；2026-09-24 13:59:19 北京时间 | 是（5 篇） |

### D087 浙江日报 / website

media_id：`64ac51ff-ea58-48f6-84a4-013c7680bc5c`  
规范化 URL：http://zjnews.zjol.com.cn/

**建议保留：`9ab1eb07-de9f-4f94-a1e0-0bcf1027d3a1`**  
建议停用（不删除）：`c78d88de-b566-4dd9-93ef-2fff29f7111a`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 16 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 9ab1eb07-de9f-4f94-a1e0-0bcf1027d3a1 | http://zjnews.zjol.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:54 北京时间 | 2026-09-24 15:48:57 北京时间 | ok | success；2026-09-24 15:48:58 北京时间 | 是（16 篇） |
| 停用预览 | c78d88de-b566-4dd9-93ef-2fff29f7111a | http://zjnews.zjol.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:54 北京时间 | 2026-09-24 15:56:42 北京时间 | ok | success；2026-09-24 15:56:43 北京时间 | 是（7 篇） |

### D088 中国航天报 / website

media_id：`0dbfb32e-0c32-4a79-ae3a-aede5232fe86`  
规范化 URL：http://www.csn.spacechina.com/

**建议保留：`70b04246-a6e7-411e-830b-7ca418f36a3d`**  
建议停用（不删除）：`a12c64f1-a5f5-4d90-a748-c4f707854d44`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 10 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 70b04246-a6e7-411e-830b-7ca418f36a3d | http://www.csn.spacechina.com/ | true | html / generic | 2026-09-18 11:55:49 北京时间 | 2026-09-24 13:55:11 北京时间 | ok | success；2026-09-24 13:55:11 北京时间 | 是（10 篇） |
| 停用预览 | a12c64f1-a5f5-4d90-a748-c4f707854d44 | http://www.csn.spacechina.com/ | true | html / generic | 2026-09-12 19:38:39 北京时间 | 2026-09-24 13:58:32 北京时间 | ok | success；2026-09-24 13:58:33 北京时间 | 否（0 篇） |

### D089 中国江苏网 / website

media_id：`2105dbb8-6633-44ad-a6a8-b72b5e41a2de`  
规范化 URL：http://www.jschina.com.cn/

**建议保留：`db73920f-9887-4ab6-a6bc-dc8682b40455`**  
建议停用（不删除）：`51c8c6f1-faef-4957-b248-e98128214731`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 6 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | db73920f-9887-4ab6-a6bc-dc8682b40455 | http://www.jschina.com.cn | true | html / 无匹配 | 2026-09-12 19:38:53 北京时间 | 2026-09-19 09:46:41 北京时间 | ok | fail / configuration_missing；2026-09-24 14:15:41 北京时间 | 是（6 篇） |
| 停用预览 | 51c8c6f1-faef-4957-b248-e98128214731 | http://www.jschina.com.cn | true | html / 无匹配 | 2026-09-12 19:38:53 北京时间 | 2026-09-19 09:46:13 北京时间 | ok | fail / configuration_missing；2026-09-24 14:01:07 北京时间 | 是（2 篇） |

### D090 中国教育电视台 / website

media_id：`50d755d6-b643-4e90-af7d-6a9756c0a5a3`  
规范化 URL：http://www.centv.cn/

**建议保留：`2f9127cf-ac48-456a-b4cb-b658cc155c43`**  
建议停用（不删除）：`7bb9dd05-6801-47ff-ad2c-af2616cf951a`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 9 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 2f9127cf-ac48-456a-b4cb-b658cc155c43 | http://www.centv.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:41 北京时间 | 2026-09-24 15:51:23 北京时间 | ok | success；2026-09-24 15:51:24 北京时间 | 是（9 篇） |
| 停用预览 | 7bb9dd05-6801-47ff-ad2c-af2616cf951a | http://www.centv.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:40 北京时间 | 2026-09-24 15:55:35 北京时间 | ok | success；2026-09-24 15:55:35 北京时间 | 是（5 篇） |

### D091 中国青年报 / website

media_id：`51fd9095-83ce-4f49-a663-660f174800f8`  
规范化 URL：https://news.cyol.com/

**建议保留：`eb6a6a38-c7d7-43dc-bedb-4617038cbf05`**  
建议停用（不删除）：`12dcbd8b-279f-43bd-b720-3f4fe4f430b1`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 13 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | eb6a6a38-c7d7-43dc-bedb-4617038cbf05 | https://news.cyol.com/ | true | html / generic | 2026-09-18 11:55:50 北京时间 | 2026-09-24 13:47:18 北京时间 | ok | success；2026-09-24 13:47:19 北京时间 | 是（13 篇） |
| 停用预览 | 12dcbd8b-279f-43bd-b720-3f4fe4f430b1 | https://news.cyol.com/ | true | html / generic | 2026-09-12 19:38:34 北京时间 | 2026-09-24 16:19:38 北京时间 | ok | success；2026-09-24 16:19:38 北京时间 | 是（5 篇） |

### D092 中国文化报 / website

media_id：`4bece79e-7ee1-4d58-aa7b-72dabc6ba517`  
规范化 URL：http://www.ccdy.cn/

**建议保留：`28e2c835-3f34-4ced-8994-c294c31c7145`**  
建议停用（不删除）：`25aa058e-2913-4ad5-84a5-a39e8f6b625e`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；本轮/补充回归无成功记录；关联文章 0 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 28e2c835-3f34-4ced-8994-c294c31c7145 | http://www.ccdy.cn | true | html / generic | 2026-09-12 19:38:38 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:42:01 北京时间 | 否（0 篇） |
| 停用预览 | 25aa058e-2913-4ad5-84a5-a39e8f6b625e | http://www.ccdy.cn | true | html / generic | 2026-09-12 19:38:38 北京时间 | 无记录 | error / 列表未解析到文章链接（已过滤锚点/重复后为空） | fail / empty_list；2026-09-24 13:43:39 北京时间 | 否（0 篇） |

### D093 中国新闻社 / website

media_id：`7e37bfdb-94cb-47e5-b372-ee718931094d`  
规范化 URL：http://www.chinanews.com.cn/

**建议保留：`6c3d2281-b98e-4870-9066-86fc6a3a618a`**  
建议停用（不删除）：`696920cd-92cb-4bd2-9c2b-7022d5c9a97a`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 14 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 6c3d2281-b98e-4870-9066-86fc6a3a618a | http://www.chinanews.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:34 北京时间 | 2026-09-24 14:00:18 北京时间 | ok | success；2026-09-24 14:00:18 北京时间 | 是（14 篇） |
| 停用预览 | 696920cd-92cb-4bd2-9c2b-7022d5c9a97a | http://www.chinanews.com.cn | true | html / generic（source_id 白名单） | 2026-09-12 19:38:34 北京时间 | 2026-09-24 14:14:07 北京时间 | ok | success；2026-09-24 14:14:07 北京时间 | 是（4 篇） |

### D094 中央广播电视总台 / website

media_id：`6f4a44ac-21ee-44de-b1b5-807f6e0a6237`  
规范化 URL：http://www.cctv.com/

**建议保留：`adaefd5c-5c05-45b0-a063-c0295fc1f9ca`**  
建议停用（不删除）：`bdc7ef1a-750c-4262-ac3d-6a2ed9d5443e`

保留理由：已启用；当前无可用自动抓取配置，保留不代表采集已恢复；本轮/补充回归无成功记录；关联文章 2 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | adaefd5c-5c05-45b0-a063-c0295fc1f9ca | http://www.cctv.com | true | html / 无匹配 | 2026-09-12 19:38:31 北京时间 | 2026-09-19 09:46:24 北京时间 | ok | fail / configuration_missing；2026-09-24 14:13:49 北京时间 | 是（2 篇） |
| 停用预览 | bdc7ef1a-750c-4262-ac3d-6a2ed9d5443e | http://www.cctv.com | true | html / 无匹配 | 2026-09-12 19:38:31 北京时间 | 2026-09-19 09:46:07 北京时间 | ok | fail / configuration_missing；2026-09-24 14:00:22 北京时间 | 是（1 篇） |

### D095 珠海广播电视台 / website

media_id：`7948c361-4c35-4a2a-b29c-0eda94915992`  
规范化 URL：http://pub-zhtb.hizh.cn/shizheng/

**建议保留：`7eb21735-e20c-4c50-abd8-048db026331c`**  
建议停用（不删除）：`602b96fe-1a78-474d-9895-400a9f75948f`

保留理由：已启用；当前 scraper 可匹配（含 source_id 白名单校验）；有本轮/补充回归成功记录；关联文章 12 篇；同条件按关联文章数、数据库最近成功时间、创建较早、ID 排序保留。

| 建议 | source_id | 原 URL | enabled | crawl_method / scraper | 创建时间 | 数据库最近成功 | 数据库抓取状态 | 最近观察到的实际运行 | 关联文章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 保留 | 7eb21735-e20c-4c50-abd8-048db026331c | http://pub-zhtb.hizh.cn/shizheng/ | true | html / generic | 2026-09-12 19:39:37 北京时间 | 2026-09-24 13:49:50 北京时间 | ok | success；2026-09-24 13:49:50 北京时间 | 是（12 篇） |
| 停用预览 | 602b96fe-1a78-474d-9895-400a9f75948f | http://pub-zhtb.hizh.cn/shizheng/ | true | html / generic | 2026-09-18 11:56:03 北京时间 | 2026-09-24 13:53:04 北京时间 | ok | success；2026-09-24 13:53:05 北京时间 | 否（0 篇） |

## 同 URL 不同 source_type：人工核对

不跨类型自动处理，不因 website 存在而停用 epaper。广东广播电视台 website 的两条同类型记录仍满足重复规则，其停用建议单独列在上文；epaper 不进入停用清单。

### 广东广播电视台

media_id：`911602f0-723d-42f8-818e-6465d2e27fbd`  
URL：https://www.gdtv.cn/channels/2

| source_id | source_type | enabled | crawl_method | 数据库最近成功 | 数据库状态 | 最近观察到的实际运行 | 关联文章 | 跨类型建议 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 74602362-0599-4a34-856b-8a37fa23d694 | website | true | html | 2026-09-19 09:44:39 北京时间 | ok | fail / no_valid_articles；2026-09-24 13:46:59 北京时间 | 0 | 人工核对；不跨类型合并 |
| c15e47a9-5af6-48bf-8cc3-ab2f9841c11c | website | true | html | 2026-09-19 09:16:13 北京时间 | warning | fail / empty_list；2026-09-24 13:44:01 北京时间 | 0 | 人工核对；不跨类型合并 |
| e36d5e3a-7169-4f4f-bbba-144ba1e57e35 | epaper | true | manual | 无记录 | error | 无本次审计运行记录 | 0 | 人工核对；不跨类型合并 |

## 验证与执行边界

已验证每组恰好保留一条、停用 ID 不重复、数量守恒、135 家媒体覆盖和媒体×类型覆盖不变、存在可用 scraper 的组保留可用配置。仅生成本报告及 JSON 预览清单；未执行数据库变更，未提交代码。若后续采用停用方案，数据库仍保留 322 行，启用/逻辑有效 source 为 221 条。
