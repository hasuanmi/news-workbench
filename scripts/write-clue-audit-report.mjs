import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync('logs/clue-audit/latest.json','utf8'));
const rows=v.byMedia.map(m=>`| ${m.name} | ${m['24h']} | ${m['3d']} | ${m['7d']} | ${m['3dUnprocessed']} |`).join('\n');
const empty=v.sources.byMedia.filter(m=>!v.byMedia.some(a=>a.name===m.name)).map(m=>m.name);
const text=`# 新闻线索实际数据链路核查

统计时间：2026-09-18 09:26:29，北京时间。只读共享数据库，未抓取、未调用AI、未修改processed或提示词。

## 结论与证据边界

“开始识别”调用 /api/admin/leads/identify，只分析数据库已有文章，不启动 media-scraper，也不遍历信息源。266条信息源全部enabled，但当前自动采集仅覆盖原定三家媒体，信息源配置数不等于采集覆盖数。

数据库558篇，其中68篇is_test=true；490篇满足is_test=false且URL不是example.test/mock-ingest.local。此处称非测试文章；旧库文章未在本轮逐条重新访问原文，不能据此声称490篇全已通过真实性验收。

| 发布窗口 | 非测试文章 | 已processed | 未processed | 可进入AI（全部媒体，最多100篇） |
| --- | ---: | ---: | ---: | ---: |
| 最近24小时 | 159 | 159 | 0 | 0 |
| 最近3天 | 295 | 252 | 43 | 43 |
| 最近7天 | 410 | 352 | 58 | 58 |

默认前台条件为24h / 全部媒体。当前默认条件为空输入，不是DeepSeek审完159篇后判断0个新栏目。用户刚才的请求body和逐调用信息没有持久化，不能将事后查询冒充刚才点击的精确trace；若当时使用默认条件且期间无数据变化，可还原为0篇、0家媒体、0次AI调用。

最近有文章输入的历史日志是09-17 23:09:46至23:10:00，扫描13篇、处理13篇、新线索0、错误0。它是昨晚自动任务，不是刚才点击。当前空输入分支不写task_log，这是无法精确追溯刚才请求的原因。

## 过滤漏斗与代码规则

用当前默认24h、全部媒体按顺序还原：558篇 → 排除68篇测试 → 490篇 → 窗口外331篇 → 159篇 → processed=true排除159篇 → 0篇。

- 时间根据publish_time而非抓取入库时间，最近24小时是滚动窗口，非今天00:00开始。常规窗口只加下界、不自动排除未来发布时间。
- SQL条件为is_test=false、clue_processed=false、日期下界、可选媒体ID/级别与customEnd；按发布时间倒序，最多100篇。
- 测试68篇是全库数量；最近24小时内测试21篇、3天/7天内各68篇。两者是不同统计范围，不可重复相加。
- 正文过短：pipeline没有长度过滤，所以因该条件排除0篇。3天未处理集合有1篇正文不足100字符，7天有3篇，仍可能送AI。
- 重复：pipeline不做文章去重，不因重复文章减少输入；ingest入口去重在此前入库时发生，本轮点击不会ingest。不能从当前库存恢复本轮之前的每次重复推送数量。线索系列合并在AI之后。
- source disabled：pipeline不查media_source.enabled，所以因该条件过滤0篇；当前信息源disabled也是0。
- 缺标题/URL：pipeline没有过滤；当前各窗口未处理集合缺标题/URL为0。
- 上限100：当前三个窗口未处理分别0/43/58，都没有因上限被截断。

## DeepSeek调用

读取文章后逐篇analyzeArticle → unifiedInvoke → /chat/completions，每次1篇，正文仅前800字符加标题/媒体/时间。不是一次批量送100篇。适配器没有自动重试。

当前默认空输入对应0次；最近3天/7天若全媒体补跑，理论输入分别43/58篇，这不是已经执行的次数。历史日志没有逐调用provider、文章ID和请求body，无法证明用户刚才每次调用详情。没有把本次核查变成另一轮实际识别，以免修改处理状态并污染证据。

## 今日抓取状态

两个Windows任务09-18 09:17:24实际启动，LastTaskResult=3221225786（0xC000013A），已Ready但未成功。两个runner日志started_at为09:17:31，steps为空且没有结束状态；media-scraper没有09-18真实PoC报告。因此没有证据表明今天已完成抓取或HTTP入库，失败发生在记录首个抓取步骤之前。具体是谁终止进程尚未证实，不能把退出码直接解释为反爬或数据库故障。

独立只读REST核查曾收到JWT issued at future；本报告改用已配置Postgres只读事务取得数据。该错误存在，但无法据此断言它是Windows任务退出的原因。当前 /api/ingest/health HTTP200只证明接口可访问，不能证明今天有文章推送。

## 按媒体发布数量

保留数据库两个广州日报名称分别统计，未强行合并媒体ID。

| 媒体 | 24小时 | 3天 | 7天 | 3天未处理 |
| --- | ---: | ---: | ---: | ---: |
${rows}

以下配置媒体全库无非测试文章（因此三个窗口均0）：${empty.join('、')}。

原始只读统计：logs/clue-audit/latest.json。新增仅为本轮诊断脚本和报告，未调整AI提示词、采集媒体范围或业务数据。

下一步应先修复任务中断并验证三家今日抓取→HTTP入库；随后补充空输入执行日志、条件快照、输入文章/媒体数、逐篇调用计数，区分“无待处理文章”和“AI未发现新栏目”。不要先调提示词或重置全库processed。
`;
fs.writeFileSync('docs/CLUE-DATA-CHAIN-AUDIT.md',text);
console.log('docs/CLUE-DATA-CHAIN-AUDIT.md');
