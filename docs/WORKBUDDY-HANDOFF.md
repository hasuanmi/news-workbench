# WorkBuddy稳定基线交接：codex-handoff-20260918

主仓库news-workbench：Next.js + Supabase主业务；独立正式采集服务的完整源码快照在`handoff/media-scraper/`。旧`scraper/`副本仅兼容与差异比对，不能作为正式服务扩展。没有合并两个服务的运行时或继续开发业务功能。

## 克隆后目录

为了复用现有Windows运行脚本，请将`handoff/media-scraper/`复制到主仓库旁的`../media-scraper/`。正式结构为两个相邻目录：`news-workbench/`与`media-scraper/`。快照不含独立仓库`.git`、虚拟环境、数据、日志、真实环境变量或证书；原本地独立仓库保留，未伪造其GitHub远端。

主系统复制`.env.example`为本地环境配置，填写真实Supabase与DeepSeek等配置。抓取服务复制自己的`.env.example`，配置本地MAIN_API_BASE及匹配ingest token。凭据通过私下安全方式交接，不能从GitHub恢复。SSL证书按部署文档重新取得，在本地填写PGSSLROOTCERT，不能关闭TLS验证。共享数据库已执行A/B，不要自动重复初始化或清理。

安装依赖、生产构建、恢复Python环境后，可用`node scripts/run-local.mjs start`启动。Windows自动任务及`logs/scheduler/runtime.json`是机器本地配置，不会随git迁移；新机器需运行`powershell -NoProfile -File scripts/register-daily-tasks.ps1`重新注册。保持北京时间07:30日历、08:30三家抓取后识别；要求开机且登录。

## 当前结论

- 日历仅calendar_event正式源，enabled且未软删除即可按日期和用户条件展示，review_status不作为门槛。
- 三家真实HTTP采集、去重及抓取后自动识别已有Windows补跑证据，空输入有skipped日志和明确文案，线索页有真实运行摘要。
- 最近生产构建与TypeScript检查通过；本次交接仅整理忽略规则、示例配置、源码快照及文档，未继续业务开发。
- 单篇正文兼容失败、真实新栏目正例覆盖不足、评报AI归属判断可靠性限制仍按已有报告保留，不宣称全部业务语义完美。

详见[任务修复](CLUE-TASK-REPAIR.md)、[真实PoC](REAL-MEDIA-POC.md)、[自动任务](AUTOMATIC-TASKS.md)、[数据库验收](DATABASE-ACCEPTANCE-UPDATE.md)。SQL与执行/回退脚本保留于docs/db-review及scripts；实际run日志、真实凭据、本机证书均不提交。

交接tag指向稳定基线提交。基线未改写历史；GitHub上已有旧默认账号或示例令牌的历史不属于本次清理范围，不自动旋转共享库密钥。
