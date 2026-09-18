# 抓取服务接入契约（article-v1）

主系统把「媒体数据采集」抽象为**独立数据源接口**。新闻线索、每日评报、文章入库等业务逻辑只依赖本契约定义的统一文章结构，**不依赖任何具体媒体网站的 HTML 结构或爬虫实现**。

独立部署的「外部抓取服务」只负责抓取原始文章，按本契约回推即可直接使用，无需改动主系统。

- API 版本：`1.0`
- 文章结构版本（schema_version）：`article-v1`

---

## 1. 基础信息

| 项 | 值 |
|---|---|
| 接入基址 | `https://<主系统域名>`（本地：`http://localhost:5000`） |
| 文章回推 | `POST /api/ingest/articles` |
| 数据源队列（拉模式，可选） | `GET /api/ingest/queue` |
| 健康检查 | `GET /api/ingest/health`（无需鉴权） |
| 鉴权方式 | 请求头 `Authorization: Bearer <INGEST_API_TOKEN>`（兼容 `X-Ingest-Token`） |
| 内容类型 | `application/json; charset=utf-8` |

> Token 为配置项 `ingest.api_token`（后台「系统配置」可轮换），默认 `your-random-ingest-token`。
> 环境变量名：`INGEST_API_TOKEN`（兼容 `INGEST_TOKEN`）。

---

## 2. 统一文章结构（article-v1）

对外字段使用 **snake_case**。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `source_id` | string | **是** | 数据源唯一 ID，来自 `GET /api/ingest/queue`。业务关联一律以此为准 |
| `title` | string | **是** | 文章标题（≤500 字，超长截断） |
| `url` | string | **是** | 原文链接，必须为 `http/https`。`external_id` 缺失时作为去重依据 |
| `media_name` | string | 否 | 媒体名称，**仅用于展示与日志，不参与业务关联** |
| `external_id` | string | 否 | 外部文章唯一标识（同一 `source_id` 内唯一，≤128 字符）。**优先用于去重与更新**；缺失时退回 URL/content hash |
| `publish_time` | string | 否 | 发布时间，ISO8601 含时区，如 `2026-09-16T08:30:00+08:00`。非法值容错（回退抓取时间，不报错） |
| `crawl_time` | string | 否 | 实际抓取时间，ISO8601；缺省由服务端记当前时间。与发布时间区分 |
| `content` | string | 否 | 正文。可为空（仅有标题+链接也可入库） |
| `author` | string | 否 | 作者 |
| `section` | string | 否 | 版面/栏目名 |
| `word_count` | number | 否 | 字数；缺省由正文（去空白字符数）计算 |
| `source_type` | string | 否 | `website` / `epaper` / `other` |
| `column_name` | string | 否 | 栏目名（新闻线索「新栏目」识别参考） |
| `edition_no` / `edition_name` | string | 否 | 版面号 / 版名 |
| `series_name` / `special_name` / `special_url` | string | 否 | 系列名 / 专题名 / 专题页链接 |
| `is_front_page` / `is_full_page` / `is_cross_page` | boolean | 否 | 头版 / 整版 / 跨版标记 |
| `scrape_method` | string | 否 | `html` / `playwright` / `rss` / `manual` |
| `first_seen_at` | string | 否 | 首次发现时间 ISO8601 |

### 字段约束 / 容错

- 缺 `source_id` / `title`、`url` 缺失或非 http(s) → 该篇判 `invalid` 跳过，**不影响同批其他文章**。
- `publish_time` / `crawl_time` 非法 → 容错回退，不判失败；响应 `perSource.warnings` 给出提示。
- 正文为空：只要标题与链接合法即入库（计 `inserted`）。
- 字段命名兼容旧版 camelCase（如 `publishedAt`、`sourceId`），但新接入请统一 snake_case。

---

## 3. POST /api/ingest/articles（正式接入接口）

### 请求

支持一次上报多个数据源结果。顶层 `results` 为数组，每个元素是一个数据源的本批结果。

```json
{
  "schema_version": "article-v1",
  "results": [
    {
      "source_id": "92e85ed8-b831-405b-acf6-9e74fad05e15",
      "success": true,
      "error": null,
      "articles": [
        {
          "source_id": "92e85ed8-b831-405b-acf6-9e74fad05e15",
          "media_name": "信息时报",
          "external_id": "ext-20260916-0001",
          "title": "开栏的话：把镜头对准社区",
          "url": "https://www.xxsb.example/20260916/column001.html",
          "publish_time": "2026-09-16T07:20:00+08:00",
          "crawl_time": "2026-09-16T08:05:00+08:00",
          "content": "即日起，本报推出「湾区社区观察」栏目……",
          "section": "社区",
          "column_name": "湾区社区观察",
          "source_type": "website"
        }
      ]
    },
    {
      "source_id": "<失败的数据源ID>",
      "success": false,
      "error": "连接超时"
    }
  ]
}
```

### 批量大小限制

| 限制 | 默认值 |
|---|---|
| 单批数据源结果数 | ≤ 50 |
| 整批文章总数 | ≤ 1000 |
| 单数据源单批建议 | ≤ 200 |

超出返回 `400 batch_too_large`，请拆批推送。

### 去重 / 幂等 / 更新规则

按以下顺序处理每篇文章：

1. **external_id 优先**：同一 `source_id` 下 `external_id` 已存在 → 命中同一篇。
2. **URL/content hash 兜底**：无 `external_id` 时，用 `url`（无 url 用 `标题+正文前200字`）的 SHA-256 查重。
3. 命中同一篇且内容 hash 相同 → `duplicated`（幂等跳过，**重复推送不会重复生成文章**）。
4. 命中同一篇但**新版本正文更完整**（字数比原记录多 ≥100 字且增长 ≥25%）→ 更新原记录，计 `updated`，不新建。适用于「先抓到简讯、后续补全全文」。
5. 未命中 → 新插入，计 `inserted`。

> 该接口幂等：同一份数据重复推送，结果稳定（首次 inserted，之后 duplicated / updated），可安全重试。

### 响应

`200`（HTTP 层成功；单篇/单源失败体现在计数与 `perSource` 中，不影响整批）：

```json
{
  "success": true,
  "schema_version": "article-v1",
  "sources": 2,
  "successSources": 1,
  "failedSources": 1,
  "inserted": 12,
  "updated": 1,
  "duplicated": 3,
  "invalid": 1,
  "failed": 0,
  "perSource": [
    {
      "sourceId": "92e85ed8-...",
      "ok": true,
      "inserted": 12,
      "updated": 1,
      "duplicated": 3,
      "invalid": 1,
      "failed": 0,
      "warnings": ["存在被跳过的非法文章（invalid_url）"]
    },
    { "sourceId": "...", "ok": false, "error": "连接超时" }
  ]
}
```

| 顶层计数 | 含义 |
|---|---|
| `inserted` | 新入库篇数 |
| `updated` | 命中同一篇且正文补全更新篇数 |
| `duplicated` | 完全重复跳过篇数 |
| `invalid` | 字段非法被跳过篇数（缺标题/source_id、url 缺失或非法等） |
| `failed` | 尝试入库但数据库异常的篇数 |
| `successSources` / `failedSources` | 成功 / 失败的数据源数量 |

### 副作用

每次推送会更新对应 `media_source` 的抓取状态：`crawl_status`（ok/warning/error）、`last_success_at`、`last_ingest_at`、`last_ingest_count`（最近入库/更新篇数）、`fail_count`、`last_error`，并写一条 `task_log`（workflow=`ingest`）。

---

## 4. GET /api/ingest/queue（拉模式，可选）

外部抓取服务也可采用「主系统编排、外部执行」的拉模式：先拉取启用中的数据源队列，再逐源抓取并回推。

- 鉴权：Bearer token。
- 响应：`{ "success": true, "version": "1.0", "schema_version": "article-v1", "count": N, "sources": [{ "source_id", "media_id", "media_name", "source_type", "source_url", "crawl_method", "last_ingest_at" }] }`，仅返回 `enabled=true` 的数据源，按 `last_ingest_at` 升序（最久未抓的在前）。每个字段同时提供 snake_case 与 camelCase 两种命名。

---

## 5. GET /api/ingest/health（健康检查）

无需鉴权，供探活 / 负载均衡。

```json
{
  "status": "ok",
  "version": "1.0",
  "schema_version": "article-v1",
  "checks": { "database": "ok", "ingest_enabled": true }
}
```

- `database`：数据库是否可用（`ok` / `error`）。
- `ingest_enabled`：是否存在启用中的数据源。
- `status=degraded`（database=error）时 HTTP 状态码为 `503`；`ingest_enabled=false` 仅提示，不视为故障。

---

## 6. 超时 / 重试 / 错误码

### 超时建议

- 抓取服务单次请求超时建议 **30 秒**；大批量请拆批。
- 主系统对单源采用「失败隔离」：一个源失败不影响其他源与主系统页面。

### 重试规则（抓取服务侧）

- 网络错误 / `5xx` / `401` 外的 `4xx`：指数退避重试（如 5s / 30s / 2min，最多 3 次）。
- `401`：检查 token，不要盲目重试。
- 由于接口幂等，**重试可安全重放同一批数据**，不会产生重复文章。

### 错误码

| HTTP | code | 含义 |
|---|---|---|
| 400 | `invalid_json` | 请求体不是合法 JSON |
| 400 | `empty_results` | `results` 为空 |
| 400 | `batch_too_large` | 超过批量上限 |
| 401 | `unauthorized` | ingest token 无效 |
| 200 | —（计数 `invalid`） | 单篇字段非法被跳过 |
| 200 | —（`perSource.error`） | 单源/单篇入库失败，已隔离 |
| 503 | —（health） | 数据库不可用 |

---

## 7. 数据源抓取状态字段（主系统「媒体与数据源」页）

| 字段 | 含义 | 更新方 |
|---|---|---|
| `crawl_status` | untested / ok / warning / error | ingest 接口 |
| `last_success_at` | 最近一次成功时间 | ingest 接口 |
| `last_ingest_at` | 最近一次成功推送时间 | ingest 接口 |
| `last_ingest_count` | 最近一次入库/更新篇数 | ingest 接口 |
| `fail_count` | 连续失败次数（成功后清零） | ingest 接口 |
| `last_error` | 最近错误信息（≤1000 字） | ingest 接口 / success=false 回传 |

抓取失败请在对应 `results` 元素中回传 `"success": false, "error": "原因"`，主系统据此记录状态。

---

## 8. 联调：Mock 抓取服务

真实抓取服务未接入前，使用随仓库提供的脚本完整模拟（走真实 HTTP，不直写数据库）：

```bash
# 主系统运行后：
pnpm tsx scripts/mock-ingest.ts
# 可选环境变量：
#   BASE_URL=https://域名  INGEST_TOKEN=xxx  pnpm tsx scripts/mock-ingest.ts
```

脚本覆盖：6 家评报媒体、线索重点媒体、同题报道、广州日报缺失同行有、新华社转载、新栏目开栏语、旧栏目、长文/短文、重复文章、缺正文、无效链接、时间异常、external_id 后续补全更新。

后台「系统管理 → 媒体与数据源」也提供「模拟推送」按钮（走同一 `ingestArticles` 链路）与「查看已入库文章」。

---

## 9. 真实抓取服务接入时只需配置的参数

主系统侧代码无需改动，接入一个真实独立抓取服务时仅需约定/配置以下信息：

| 参数 | 配置位置 | 说明 |
|---|---|---|
| 主系统基址 `BASE_URL` | 抓取服务侧 | 主系统对外域名（如 `https://<主系统域名>`），拼接 `/api/ingest/*` |
| 接入令牌 `INGEST_API_TOKEN` | 主系统后台「系统配置」`ingest.api_token`（或环境变量 `INGEST_API_TOKEN`），抓取服务侧同步配置 | Bearer Token；双方一致即可，可随时在后台轮换 |
| 数据源清单 | 主系统后台「媒体与数据源」维护，抓取服务 `GET /api/ingest/queue` 拉取 | 每个源的 `source_id`（业务关联唯一身份）、`source_url`、`source_type`、`crawl_method`、启停 `enabled`。新增媒体/站点只需在后台建源并启用，抓取服务下次拉队列即可见 |
| 推送内容 | 抓取服务按第 2 节字段映射 | 至少保证 `source_id`/`title`/`url`；建议带 `external_id`（源站文章唯一 ID）、`publish_time`、`crawl_time`、`content`、`word_count`、`column_name`、版面标记 |

接入步骤：① 抓取服务启动时 `GET /api/ingest/health` 探活；②（拉模式）`GET /api/ingest/queue` 取启用源；③ 抓完按 `article-v1` 结构 `POST /api/ingest/articles` 回推，失败源以 `success:false` 回传。鉴权、去重、幂等、补全更新、状态回填、线索识别、评报全部由主系统自动完成，抓取服务无需理解业务。
