/**
 * 模拟「独立抓取服务」端到端联调脚本
 * ============================================================
 * 本脚本模拟未来独立部署的外部抓取服务：通过【正式 HTTP 接口】把文章推回主系统，
 * 全程不直连数据库，因此可验证真实接入链路是否可用。
 *
 * 运行方式：
 *   # 先确保主系统已在本地 5000 端口运行（或通过 BASE_URL 指定）
 *   pnpm tsx scripts/mock-ingest.ts
 *
 *   BASE_URL=https://your-domain pnpm tsx scripts/mock-ingest.ts
 *   INGEST_TOKEN=newsdesk-ingest-2026 pnpm tsx scripts/mock-ingest.ts
 *
 * 流程（与未来真实抓取服务完全一致）：
 *   1) GET  /api/ingest/health   探活
 *   2) GET  /api/ingest/queue    拉取启用中的数据源队列（Bearer）
 *   3) 按媒体名定位 6 家评报媒体 + 线索重点媒体 + 新华社数据源
 *   4) POST /api/ingest/articles 批量回推（Bearer），覆盖全部边界场景
 *
 * 覆盖场景：6 家评报媒体 / 同题报道 / 广州日报缺失同行有 / 新华社转载 /
 *           新栏目开栏语 / 旧栏目 / 长文 / 短文 / 重复文章 / 缺正文 /
 *           无效链接 / 时间字段异常 / external_id 后续补全更新。
 * ============================================================
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");
const TOKEN = process.env.INGEST_TOKEN ?? "newsdesk-ingest-2026";
const SCHEMA_VERSION = "article-v1";

// 以脚本运行当天为基准日，保证评报「按日期筛选」可命中
const TODAY = new Date();
function iso(hour: number, minute = 0): string {
  return new Date(
    TODAY.getFullYear(),
    TODAY.getMonth(),
    TODAY.getDate(),
    hour,
    minute
  ).toISOString();
}

interface Dto {
  source_id: string;
  media_name?: string;
  title: string;
  url: string;
  external_id?: string | null;
  publish_time?: string | null;
  crawl_time?: string | null;
  content?: string | null;
  section?: string | null;
  word_count?: number | null;
  source_type?: string | null;
  column_name?: string | null;
  is_front_page?: boolean;
  is_full_page?: boolean;
  is_cross_page?: boolean;
  // 故意制造异常的字段（仅边界场景使用）
  [k: string]: unknown;
}

const log = {
  info: (m: string) => console.log(`\x1b[36m${m}\x1b[0m`),
  ok: (m: string) => console.log(`\x1b[32m${m}\x1b[0m`),
  warn: (m: string) => console.log(`\x1b[33m${m}\x1b[0m`),
  err: (m: string) => console.log(`\x1b[31m${m}\x1b[0m`),
};

/** 生成约 n 字的仿真正文（围绕主题，含本地案例/数据/采访要素） */
function body(topic: string, n: number, seed = ""): string {
  const paras = [
    `本报讯（记者 模拟报道）围绕「${topic}」，记者近日走访多地进行实地采访。${seed}相关部门负责人介绍，当前各项工作正按计划稳步推进，已取得阶段性成效。`,
    `在广州市天河区一处现场，工作人员向记者展示了最新进展，配套措施逐项落地，周边居民和市场主体普遍反映办事更便利、获得感增强。本地企业提供的数据显示，相关指标同比改善明显，一批具有代表性的案例正在形成可复制经验。`,
    `受访专家表示，这一举措体现了问题导向与民生导向，建议进一步加强部门协同、完善长效机制。业内人士认为，随着政策红利持续释放，相关领域有望保持向好态势，对区域高质量发展形成有力支撑。`,
  ];
  let s = "";
  let i = 0;
  while (s.replace(/\s+/g, "").length < n) {
    s += paras[i % paras.length] + "\n";
    i++;
  }
  // 截断到约 n 字
  return s.replace(/\s+/g, "").slice(0, n);
}

async function main(): Promise<void> {
  log.info(`== 0. 健康检查 GET ${BASE_URL}/api/ingest/health ==`);
  const healthRes = await fetch(`${BASE_URL}/api/ingest/health`);
  const health = (await healthRes.json()) as Record<string, unknown>;
  console.log(JSON.stringify(health));
  if (health.status !== "ok") throw new Error("健康检查未通过，主系统可能未就绪");
  log.ok("health ok");

  log.info(`== 1. 拉取数据源队列 GET ${BASE_URL}/api/ingest/queue ==`);
  const queueRes = await fetch(`${BASE_URL}/api/ingest/queue`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (queueRes.status === 401) throw new Error("ingest token 无效（401）");
  const queue = (await queueRes.json()) as {
    sources?: Array<{ source_id: string; media_name: string; source_type?: string }>;
  };
  const sources = queue.sources ?? [];
  log.info(`队列中启用数据源 ${sources.length} 个`);

  const findSource = (name: string, type?: string): string => {
    const hit = sources.find(
      (s) => s.media_name === name && (!type || s.source_type === type)
    );
    if (!hit) throw new Error(`队列中找不到数据源：${name}${type ? `(${type})` : ""}`);
    return hit.source_id;
  };

  // 6 家每日评报媒体（广州日报在库中名为「广州日报报业集团」）
  const gz = findSource("广州日报报业集团", "website");
  const nf = findSource("南方日报", "website");
  const nd = findSource("南方都市报", "website");
  const xk = findSource("新快报", "website");
  const yc = findSource("羊城晚报", "website");
  const xs = findSource("信息时报", "website");
  // 线索重点媒体 + 新华社
  const xinhua = findSource("新华社", "website");
  const people = sources.find((s) => s.media_name === "人民日报")?.source_id ?? nf;

  const bySource = new Map<string, Dto[]>();
  const add = (sourceId: string, a: Dto): void => {
    if (!bySource.has(sourceId)) bySource.set(sourceId, []);
    bySource.get(sourceId)!.push(a);
  };
  const tag = (s: string): string =>
    `${s}-${TODAY.getFullYear()}${String(TODAY.getMonth() + 1).padStart(2, "0")}${String(
      TODAY.getDate()
    ).padStart(2, "0")}`;

  log.info("== 2. 构造场景化 Mock 文章 ==");

  // 场景 A：同题报道（4 家媒体同主题，不同切入角度；广州日报也有，避免落入同行独有）
  const sameTopic = "广州出台新一轮支持制造业当家若干措施";
  [
    { sid: gz, media: "广州日报", angle: "聚焦本地企业落地与车间一线见闻" },
    { sid: nf, media: "南方日报", angle: "从全省政策体系解读战略意图" },
    { sid: nd, media: "南方都市报", angle: "关注中小企业获得感与办事流程简化" },
    { sid: yc, media: "羊城晚报", angle: "结合民生就业与产业链配套分析" },
  ].forEach((m, i) =>
    add(m.sid, {
      source_id: m.sid,
      media_name: m.media,
      external_id: tag(`same-topic-${i}`),
      title: sameTopic,
      url: `https://example.test/${m.media}/same-topic-${TODAY.getTime()}-${i}`,
      publish_time: iso(8 + i, 10),
      crawl_time: iso(9 + i),
      section: "要闻",
      is_front_page: i === 0,
      source_type: "website",
      content: body(sameTopic + "。" + m.angle, 1400 + i * 120, m.angle + "。"),
    })
  );

  // 场景 B：同行独有（南都、新快报有，广州日报没有）
  const peerOnly = "粤港澳大湾区数据跨境流动试点扩容";
  add(nd, {
    source_id: nd,
    media_name: "南方都市报",
    external_id: tag("peer-only-nd"),
    title: peerOnly,
    url: `https://example.test/nd/peer-only-${TODAY.getTime()}`,
    publish_time: iso(7, 40),
    crawl_time: iso(8),
    section: "经济",
    is_full_page: true,
    source_type: "website",
    content: body(peerOnly, 1600, "记者梳理了试点扩容的具体清单与企业申请路径。"),
  });
  add(xk, {
    source_id: xk,
    media_name: "新快报",
    external_id: tag("peer-only-xk"),
    title: peerOnly,
    url: `https://example.test/xk/peer-only-${TODAY.getTime()}`,
    publish_time: iso(8, 5),
    crawl_time: iso(9),
    section: "产经",
    source_type: "website",
    content: body(peerOnly, 1300, "新快报从跨境电商企业视角展开调查。"),
  });

  // 场景 C：新华社转载（多家媒体转同一通稿 → 新华社共同背景，不做原创比较）
  const xinhuaTopic = "国务院部署进一步稳增长一揽子政策举措";
  add(xinhua, {
    source_id: xinhua,
    media_name: "新华社",
    external_id: tag("xinhua-origin"),
    title: xinhuaTopic,
    url: `https://example.test/xinhua/origin-${TODAY.getTime()}`,
    publish_time: iso(6, 30),
    crawl_time: iso(7),
    section: "受权发布",
    source_type: "website",
    content: "新华社北京电 " + body(xinhuaTopic, 1200, "国务院近日印发通知。"),
  });
  add(nf, {
    source_id: nf,
    media_name: "南方日报",
    external_id: tag("xinhua-repost-nf"),
    title: xinhuaTopic,
    url: `https://example.test/nf/repost-${TODAY.getTime()}`,
    publish_time: iso(7),
    crawl_time: iso(8),
    section: "要闻",
    source_type: "website",
    content: "据新华社电 " + body(xinhuaTopic, 1150, ""),
  });
  // 另外两家媒体原样转载同一通稿（满足"多家转载"→共同背景）
  [
    { sid: yc, media: "羊城晚报" },
    { sid: xk, media: "新快报" },
  ].forEach((m, i) =>
    add(m.sid, {
      source_id: m.sid,
      media_name: m.media,
      external_id: tag(`xinhua-repost-${i}`),
      title: xinhuaTopic,
      url: `https://example.test/${m.media}/repost-${TODAY.getTime()}-${i}`,
      publish_time: iso(7, 5 + i),
      crawl_time: iso(8, 10 + i),
      section: "要闻",
      source_type: "website",
      content: "新华社" + m.media + "电 " + body(xinhuaTopic, 1100, ""),
    })
  );

  // 场景 D：新栏目开栏语（信息时报新开「湾区社区观察」，当天 2 篇同栏目，含开栏的话）
  const col = "湾区社区观察";
  add(xs, {
    source_id: xs,
    media_name: "信息时报",
    external_id: tag("column-open"),
    title: "开栏的话：把镜头对准社区里的每一份烟火气",
    url: `https://example.test/xs/column-open-${TODAY.getTime()}`,
    publish_time: iso(7, 20),
    crawl_time: iso(8),
    section: "社区",
    column_name: col,
    source_type: "website",
    content:
      "即日起，本报推出「" +
      col +
      "」栏目。开栏的话：社区是城市治理的最小单元，也是观察民生温度的最佳窗口。我们将走进广州各个街道社区，记录基层治理的创新实践与居民身边的变化。" +
      body(col + "栏目首篇", 900),
  });
  add(xs, {
    source_id: xs,
    media_name: "信息时报",
    external_id: tag("column-2"),
    title: "老旧小区议事厅里，居民自己说了算",
    url: `https://example.test/xs/column-2-${TODAY.getTime()}`,
    publish_time: iso(9, 30),
    crawl_time: iso(10),
    section: "社区",
    column_name: col,
    source_type: "website",
    content: "「" + col + "」" + body("社区居民议事会运行机制", 1000),
  });

  // 场景 E：旧栏目（人民日报长期存在的「人民时评」，不应识别为新栏目）
  add(people, {
    source_id: people,
    media_name: "人民日报",
    external_id: tag("old-column"),
    title: "人民时评：以高质量发展扎实推进中国式现代化",
    url: `https://example.test/people/old-column-${TODAY.getTime()}`,
    publish_time: iso(6, 0),
    crawl_time: iso(7),
    section: "人民时评",
    column_name: "人民时评",
    source_type: "website",
    content: body("高质量发展评论", 1100),
  });

  // 场景 F：长文（广州日报，远超最低字数，应入选评报）
  add(gz, {
    source_id: gz,
    media_name: "广州日报报业集团",
    external_id: tag("long-article"),
    title: "深度观察：广州科技创新轴崛起的十年答卷",
    url: `https://example.test/gz/long-${TODAY.getTime()}`,
    publish_time: iso(8, 30),
    crawl_time: iso(9),
    section: "深度",
    is_cross_page: true,
    source_type: "website",
    content: body("广州科技创新轴十年发展", 2600, "本组报道含多组独家数据与科研团队采访。"),
  });

  // 场景 G：短文（广州日报，字数过低，应被最低字数规则过滤）
  add(gz, {
    source_id: gz,
    media_name: "广州日报报业集团",
    external_id: tag("short-article"),
    title: "今日天气：多云有阵雨",
    url: `https://example.test/gz/short-${TODAY.getTime()}`,
    publish_time: iso(7),
    crawl_time: iso(8),
    section: "天气",
    source_type: "website",
    content: "今日多云，局部有阵雨，气温26至32度。",
  });

  // 场景 H：缺正文（仅标题+链接，应仍可入库）
  add(nf, {
    source_id: nf,
    media_name: "南方日报",
    external_id: tag("no-content"),
    title: "广东省举行重大项目集中开工活动（图文快讯）",
    url: `https://example.test/nf/no-content-${TODAY.getTime()}`,
    publish_time: iso(10),
    crawl_time: iso(10, 30),
    source_type: "website",
    content: null,
  });

  // 场景 I：无效链接（非 http(s)，应判 invalid 跳过，不影响整批）
  add(nf, {
    source_id: nf,
    media_name: "南方日报",
    title: "不应入库的无效链接文章",
    url: "ftp://invalid.example.com/x" as unknown as string,
    publish_time: iso(10),
  });

  // 场景 J：时间字段异常（乱格式，应容错：publish_time 回退、不报错）
  add(xk, {
    source_id: xk,
    media_name: "新快报",
    external_id: tag("bad-time"),
    title: "城市慢行系统改造获市民点赞",
    url: `https://example.test/xk/bad-time-${TODAY.getTime()}`,
    publish_time: "昨天早上八点半" as unknown as string,
    crawl_time: "not-a-date" as unknown as string,
    source_type: "website",
    content: body("城市慢行系统与绿道建设", 1000),
  });

  // 场景 K：external_id 后续补全/更新——先推一个正文很短的版本
  const updateExtId = tag("will-enrich");
  const updateUrl = `https://example.test/yc/enrich-${TODAY.getTime()}`;
  add(yc, {
    source_id: yc,
    media_name: "羊城晚报",
    external_id: updateExtId,
    title: "广州港南沙港区再添新航线（简讯）",
    url: updateUrl,
    publish_time: iso(9),
    crawl_time: iso(9, 30),
    section: "快讯",
    source_type: "website",
    content: "广州港南沙港区新增一条外贸航线。",
  });

  // ---- 第一次推送 ----
  log.info("== 3. 第一次推送 POST /api/ingest/articles（含全部场景） ==");
  const results = Array.from(bySource.entries()).map(([source_id, articles]) => ({
    source_id,
    success: true,
    articles,
  }));
  const resp1 = await postArticles(results);
  console.log(JSON.stringify(agg(resp1), null, 2));

  // ---- 第二次推送：重复文章（完全相同）+ external_id 补全更新 ----
  log.info("== 4. 第二次推送：验证幂等重复 + external_id 补全更新 ==");
  const second: Array<{ source_id: string; success: boolean; articles: Dto[] }> = [];

  // 4.1 完全重复：把广州日报的长文原样再推一次（应 duplicated）
  const gzArts = bySource.get(gz)!;
  const dupLong = gzArts.find((a) => a.external_id === tag("long-article"))!;
  second.push({ source_id: gz, success: true, articles: [dupLong] });

  // 4.2 同 URL 重复（不带 external_id，靠 URL hash 判重）
  const noContent = bySource.get(nf)!.find((a) => a.external_id === tag("no-content"))!;
  second.push({
    source_id: nf,
    success: true,
    articles: [{ ...noContent, external_id: null }],
  });

  // 4.3 external_id 相同，新版本正文更完整（应 updated，而非 duplicated）
  second.push({
    source_id: yc,
    success: true,
    articles: [
      {
        source_id: yc,
        media_name: "羊城晚报",
        external_id: updateExtId,
        title: "广州港南沙港区再添新航线 外贸通道持续加密",
        url: updateUrl,
        publish_time: iso(9),
        crawl_time: iso(11),
        section: "经济",
        source_type: "website",
        content: body("广州港南沙港区新增外贸航线与区域物流效能提升", 1800, "记者采访港口集团与多家外贸企业。"),
      },
    ],
  });

  const resp2 = await postArticles(second);
  console.log(JSON.stringify(agg(resp2), null, 2));

  // ---- 断言 ----
  log.info("== 5. 结果断言 ==");
  const a1 = agg(resp1);
  const a2 = agg(resp2);
  const checks: Array<{ name: string; pass: boolean }> = [
    { name: "第一次推送有新入库", pass: a1.inserted > 0 },
    { name: "无效链接被计为 invalid", pass: a1.invalid >= 1 },
    { name: "第一次推送无致命 failed", pass: a1.failed === 0 },
    { name: "重复推送被识别为 duplicated", pass: a2.duplicated >= 2 },
    { name: "external_id 补全更新命中 updated", pass: a2.updated >= 1 },
  ];
  let allPass = true;
  for (const c of checks) {
    if (c.pass) log.ok(`  [PASS] ${c.name}`);
    else {
      log.err(`  [FAIL] ${c.name}`);
      allPass = false;
    }
  }
  if (!allPass) process.exitCode = 1;
  log.info("完成。接下来可在主系统触发：新闻线索识别 → 每日评报选稿/生成。");
}

interface IngestResp {
  inserted: number;
  updated: number;
  duplicated: number;
  invalid: number;
  failed: number;
  perSource?: Array<{ inserted?: number; updated?: number; duplicated?: number; invalid?: number; failed?: number }>;
}

async function postArticles(
  results: Array<{ source_id: string; success: boolean; articles: Dto[] }>
): Promise<IngestResp> {
  const res = await fetch(`${BASE_URL}/api/ingest/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ schema_version: SCHEMA_VERSION, results }),
  });
  const json = (await res.json()) as IngestResp & { error?: string };
  if (!res.ok) throw new Error(`推送失败 HTTP ${res.status}: ${json.error ?? ""}`);
  return json;
}

function agg(r: IngestResp): IngestResp {
  if (Array.isArray(r.perSource) && r.inserted === undefined) {
    return r.perSource.reduce<IngestResp>(
      (acc, p) => ({
        inserted: acc.inserted + (p.inserted ?? 0),
        updated: acc.updated + (p.updated ?? 0),
        duplicated: acc.duplicated + (p.duplicated ?? 0),
        invalid: acc.invalid + (p.invalid ?? 0),
        failed: acc.failed + (p.failed ?? 0),
      }),
      { inserted: 0, updated: 0, duplicated: 0, invalid: 0, failed: 0 }
    );
  }
  return r;
}

main().catch((e) => {
  log.err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
