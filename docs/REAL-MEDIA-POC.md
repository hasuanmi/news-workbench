# 三家真实媒体 PoC：2026-09-17

本报告只使用真实网站文章与真实 HTTP 入库记录。Mock 验收不计入本轮结果。采集入口为独立 `media-scraper`，只抓取、清洗、标准化 article-v1、HTTP 推送；主系统负责持久化、去重、线索识别和评报。未扩大采集媒体，未启用自动采集，未做 UI polish。

## 实际采集与入库

按照广州日报 → 南方日报 → 南方都市报完成首轮，并按同一顺序复测时间、正文和推送；广州日报另做一篇真实原文补全测试。

| 媒体 | 去重后的真实文章/入库核对 | 成功正文访问次数 | 详情失败 | HTTP 插入 | HTTP 更新 | 首次推送重复累计 | 再次推送重复累计 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 广州日报 | 11 / 11 | 16 | 0 | 8 | 1 | 8 | 16 |
| 南方日报 | 8 / 8 | 10 | 0 | 3 | 0 | 7 | 10 |
| 南方都市报 | 9 / 9 | 9 | 1 | 6 | 0 | 3 | 9 |

口径：不同时间首页换稿，复测存在重叠 URL。“真实文章”按 URL 去重；成功正文访问次数包含复测；HTTP 数量为成功批次累计，不将二次推送重复计入首次重复。广州日报插入 8 包含补全测试先插入的一条真实摘录，随后该记录已更新为完整原文。其他重复文章已存在共享数据库，不是本轮新增。28 篇均有正文、均非测试数据，媒体映射核对通过。

南都失败样本：[新华社权威速览丨何为5G工厂](https://www.oeeee.com/html/202609/17/1744005.html)，标题和发布时间取得成功，当前正文容器没有文字（长度 0），未入库。需要进一步兼容图解/图片正文，不能把空正文计为成功。建设重启期间另出现过本地 ingest/queue 502，主服务恢复后重试通过；不是媒体反爬。未遇到登录、验证码或付费墙。

## 各媒体字段与用途

| 媒体 | 标题、正文、链接 | 发布时间 | 栏目/版面/作者 | 线索识别 | 每日评报 |
|---|---|---|---|---|---|
| 广州日报 | 官方大洋网真实文章，核对成功 | 新解析保留网页时分，转换 +08:00 后推送 | 本批栏目及版面、作者未稳定取得 | 可提供真实原文，但当前样本无充分开栏证据 | 符合后台字数规则的文本可用；短视频说明不能当完整长报道 |
| 南方日报 | 南方网真实文章，核对成功 | 新解析取得网页时分 | 标题有南方网品牌后缀；栏目、版面、作者缺失 | 同上，不能把频道名推断为新栏目 | 可用，但须保留网站来源与转载性质 |
| 南方都市报 | 奥一网真实文章，已修复误抓站点 logo 的标题 | article:published_time 保留到秒 | 新解析从页面标题取频道，并定位文章正文；版面、作者缺失 | 文本文章可用；空正文图解尚不可用 | 文本可用；图解失败样本不参与 |

这些是三个媒体体系的官方网站频道样本，不等同于三家纸报全量文章，也不等同于媒体自采原创。新华社/人民日报转载按原文判定，不把采集媒体名称当原创署名。初轮广州日报、南方日报曾仅取得日期（00:00）；新解析已保留时分，但没有批量改写旧记录的历史时间精度。南都初轮部分栏目曾误取导航，新采集已修复；历史元数据尚未统一回填。

## 真实业务联动 PASS / FAIL

| 项目 | 结果 | 证据与边界 |
|---|---|---|
| 独立 scraper → article-v1 → HTTP ingest | PASS | 28 个真实 URL 在主系统中逐项核对；scraper 不连接 Supabase |
| 重复推送不新增 | PASS | 各成功批次再次推送均全部重复，插入/更新为 0 |
| 真实正文补全更新 | PASS | 同一广州日报原文先推真实前 100 字、再推全文，插入 1、更新 1；再次重复 6 |
| Mock 保留并默认隔离 | PASS | 68 篇测试文章仍保留，3 条测试线索已标记；默认线索/首页/选稿/评报无测试文章引用 |
| 真实新栏目识别调用 | PASS（调用） | 识别 HTTP 200，无错误；新栏目 0 条，不制造识别结果 |
| 真实新栏目正例、确认/否决及证据卡片 | 未覆盖 | 本批首页时政样本没有充分开栏语，不用 Mock 充当正例 |
| 本期选稿持久化 | PASS | 18 篇达到现有规则的当日真实文章，选稿保存并可读取 |
| 同题聚类 | PASS（分组） | 两组真实同题，原文可追溯；转载不能推断原创采编差异 |
| 同行独有 | PASS（过滤机制）；结论受覆盖限制 | 已修复未达字数阈值被误当未报道；核对广州日报当日全部已采集标题，仅能说明本轮库内未见 |
| 新华社转载排除原创比较 | PASS（当前样本） | 两篇“筑牢合作根基”原文具有“新华社北京9月15日电”，背景标记为 true，不进入原创比较；无证据的 AI 归类被过滤 |
| 完整评报生成及保存 | PASS | 真实选稿经 SSE 生成完整结构和正文、保存成功 |
| 补充要求完整重生成及版本保存 | PASS | 四区块完整替换，版本递增，非一句回答；记录见下列验收日志 |
| 全量媒体覆盖、纸报版面、原创差异编辑审校 | 未覆盖 | 当前小样本与缺失版面字段不能支持这些结论 |
| 自动原创归因与精确时间比较 | FAIL（语义可靠性） | 浏览器验收发现 v11 将未取得署名的广日报稿称为“自采”，并用旧时间精度推断“早约一天”。已通过完整重生成纠正当前版本；来源字段标准化与自动归因校验仍待补齐，不将接口成功当作所有编辑结论正确 |

**现有评报配置仍比较六家媒体**。本轮只采集三家，但选稿包含库中已有的新快报、信息时报等真实文章，未擅自修改后台长期规则。因此“18 篇选稿”不是仅由本轮 28 个 URL 组成，也不能宣称六家已完成真实采集 PoC。生成与补充要求均明确限制无依据版面推断、绝对独有结论和纯转载比较；AI 编辑判断仍需原文审校。

## 本轮最小修复

- `is_test`、`test_run_id` 可逆标记；文章、线索、选稿和评报默认排除测试数据。保留标记前快照和 run_id，不物理删除。旧测试评报全文已另行归档；同日正式评报沿现有唯一日期记录更新、保留版本快照。
- `article-v1` 接受明确测试标签；Mock HTTP 脚本显式标记，ingest 兼容识别测试域名及 mock external_id。
- 主系统日期筛选使用中国时区；广州日报报业集团作为广州日报配置别名，避免漏选。
- 去掉为 Mock 短文自动放宽最低字数的逻辑；正式选稿遵守后台阈值。
- 新华社判断补充全文署名证据，AI 背景必须有来源依据，纯转载排除原创比较。
- 同行扫描补充全天广州日报已采集标题，选稿校验结果传递到正式评报，避免生成阶段丢失已校验限制。
- 独立抓取同步必要 worker 修复，修复南都 logo 标题、正文容器及导航误当栏目，时间解析优先完整时分。

没有删除 `news-workbench/scraper/`，该副本仅保留差异比较，不再作为正式抓取入口。

## 工程与复现

```text
GZdailydata/
├─ news-workbench/           Next.js 主系统：ingest/数据库/线索/评报/日历
│  ├─ src/lib/               标准文章业务处理，默认测试隔离
│  ├─ scripts/               真实入库核对、HTTP 业务验收、可逆标记
│  ├─ logs/                  忽略的执行证据、测试归档、run_id
│  └─ scraper/               旧副本，仅比对，不作为正式服务
└─ media-scraper/            唯一正式采集服务
   ├─ app/scrapers/          媒体 HTML 解析
   ├─ app/core/ingest_client.py HTTP 推送
   └─ poc_ingest_real.py     单媒体 PoC 与真实正文补全验证
```

主系统当前预览：http://localhost:3001。生产构建与 TypeScript、独立 Python 编译通过。使用已安装 Next CLI 构建，系统 pnpm 自动版本切换曾尝试重装依赖并失败，未为此更换现有依赖。

独立服务 `.env` 只需要 `MAIN_API_BASE`、`INGEST_API_TOKEN` 和采集控制配置，本轮关闭 `SCHEDULE_ENABLED`、`INGEST_ENABLED` 的后台自动批量任务。未复制 Supabase 或大模型密钥到 scraper。

```powershell
# 在 media-scraper 中，逐家运行（主系统已启动）
.venv/Scripts/python.exe poc_ingest_real.py 广州日报 5
.venv/Scripts/python.exe poc_ingest_real.py 南方日报 5
.venv/Scripts/python.exe poc_ingest_real.py 南方都市报 5
# 仅验证一篇真实原文补全，不生成测试文章
.venv/Scripts/python.exe poc_ingest_real.py 广州日报 6 --enrichment
```

执行证据（本地忽略文件）：

最终真实评报验收 run_id：`73227619-171b-49f4-80a4-7649ffc917ba`。生成正文 841 字符，补充要求完整重生成正文 939 字符，版本从 v10 到 v11；四区块保存成功。最终只读复查：测试引用、测试 URL、裸 Markdown、新华社进入原创比较/同行亮点、未经选稿校验同行项，均为 false。

随后浏览器语义验收发现上述原创归因/时间问题，使用 `scripts/correct-real-review-http.mjs` 通过现有补充要求接口进行完整纠正。当前最终版本与纠正 run_id 以 `logs/real-review-correction.json` 为准；这项纠正不代表自动归因问题已彻底消除。

纠正实际结果：HTTP 200，start → structure → final → saved → done，v11 → **v12**，正文 1113 字符，未再出现已发现的无依据自采通稿、早约一天、采集成本判断；run_id `91e1a8a1-ac41-4907-820f-983e221aeaa3`。

- `media-scraper/logs/real-poc/*.json`：原文、失败 URL、首推/重复推/补全文 HTTP 结果。
- `news-workbench/logs/real-poc-isolation.json`：28 个 URL 实际入库、测试保留数、默认 API 排除核对。
- `news-workbench/logs/real-poc-business.json`：真实识别、选稿、首页和历史响应。
- `news-workbench/logs/acceptance/review-http.json`：完整生成、补充要求重生成及版本保存 run_id。
- `news-workbench/logs/real-review-correction.json`：真实浏览器语义纠错后的完整重生成与保存。
- `news-workbench/logs/test-isolation/`：标记前快照、manifest、旧测试全文归档。

回滚：先停止采集，依据 `labels-before.json` 按 id 恢复标签；代码按本轮差异回退。测试隔离脚本默认不执行 SQL，显式 `--apply` 才写入，已移除用固定评报 id 重复标记的规则，避免把同日已更新的真实评报重新隐藏。新增的兼容列不需要 DROP。真实文章不自动删除；必要时按 PoC 日志由主系统采用可逆隔离，禁止物理删除。

下一步：仍只在三家范围内补充地方新闻、真实开栏公告等定向样本；兼容图解、规范来源/作者/版面字段，完成真实新栏目正例与编辑审校后再扩采。自动调度部署另行验证，不把手动 PoC 当成自动上线。

## 本轮修改文件

- 独立服务：`app/core/worker.py`、`app/core/ingest_client.py`、`app/scrapers/base.py`、`app/scrapers/oeeee.py`、`poc_ingest_real.py`、`README.md`。
- 主系统数据隔离与契约：`src/lib/ingest-contract.ts`、`src/lib/ingest.ts`、`src/lib/clue-pipeline.ts`、`src/lib/clue-engine.ts`、`src/lib/weekly-briefing.ts`、`src/storage/database/shared/schema.ts`、`scripts/mock-ingest.ts`。
- 主系统评报：`src/lib/review-engine.ts`、`src/lib/review-draft.ts`、`src/lib/review-followup.ts`、`src/app/api/admin/review/generate/route.ts`。
- 默认查询：`src/app/api/leads/route.ts`、`src/app/api/home/preview/route.ts`、`src/app/api/review/route.ts`、`src/app/api/review/[id]/route.ts`、`src/app/api/review/[id]/followup/route.ts`。
- 执行/核对：`scripts/isolate-test-data.mjs`、`scripts/verify-real-poc.mjs`、`scripts/verify-real-isolation.mjs`、`scripts/correct-real-review-http.mjs`；报告入口 `PROJECT-STATUS.md`、`docs/ACCEPTANCE-REPORT.md` 与本报告。
- 本地忽略配置：独立服务 `.env` 的本地 ingest 地址/令牌和关闭自动任务配置；没有将密钥写入源码或提交 Git。
