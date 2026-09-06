/**
 * 配置种子脚本：日历分类 / 线索类型 / 评报维度 / 全局参数 / 默认管理员
 * 用法：pnpm tsx scripts/seed-config.ts
 * 幂等：使用 upsert，可重复执行
 */
import { getSupabaseClient } from "../src/storage/database/supabase-client";

async function main() {
  const client = getSupabaseClient();

  // 1. 日历分类 C01-C08
  const categories = [
    { code: "C01", category_name: "重要节日与纪念日", sort_order: 1, description: "元旦、春节、国庆、烈士纪念日、全民国家安全教育日等" },
    { code: "C02", category_name: "党史/新中国史/重大历史节点", sort_order: 2, description: "建党、长征胜利、十一届三中全会、香港澳门回归、抗美援朝等" },
    { code: "C03", category_name: "总书记重要讲话、论述及活动", sort_order: 3, description: "重要讲话周年、重要思想提出周年、考察广东/广州等" },
    { code: "C04", category_name: "重大会议与政策", sort_order: 4, description: "全国两会、中央全会、省市重要会议、法律法规、重大政策" },
    { code: "C05", category_name: "国家战略与区域发展", sort_order: 5, description: "粤港澳大湾区、南沙、横琴、前海、自贸区等" },
    { code: "C06", category_name: "行业/主题节点", sort_order: 6, description: "生态、科技、教育、医疗、农业、网络安全、文化、体育、国防等" },
    { code: "C07", category_name: "广东/广州重大节点", sort_order: 7, description: "广东广州重大事件、重要政策、重大工程、城市发展、本地历史节点" },
    { code: "C08", category_name: "重大展会/会议/活动", sort_order: 8, description: "广交会、服贸会、珠海航展、大型城市活动、重大国际国内会议" },
  ];
  for (const c of categories) {
    const { error } = await client.from("calendar_category").upsert(c, { onConflict: "code" });
    if (error) throw new Error(`分类写入失败 ${c.code}: ${error.message}`);
  }
  console.log(`✓ 日历分类 ${categories.length} 条`);

  // 2. 新闻线索类型
  const clueTypes = [
    { code: "new_column", type_name: "新栏目", sort_order: 1, description: "新推出的持续性固定栏目" },
    { code: "series", type_name: "系列报道", sort_order: 2, description: "围绕同一主题连续推出的一组报道" },
    { code: "special_topic", type_name: "专题", sort_order: 3, description: "围绕重大主题形成的专题聚合" },
    { code: "feature_plan", type_name: "特色策划", sort_order: 4, description: "连续整版、跨版专题、大型调查、融媒体策划、重大主题特别报道" },
  ];
  for (const t of clueTypes) {
    const { error } = await client.from("clue_type").upsert(t, { onConflict: "code" });
    if (error) throw new Error(`线索类型写入失败 ${t.code}: ${error.message}`);
  }
  console.log(`✓ 线索类型 ${clueTypes.length} 条`);

  // 3. 评报维度
  const dimensions = [
    { code: "topic", dimension_name: "选题/主题", priority: 1, description: "当天各媒体重点关注什么、是否形成共同主题、哪些选题新闻价值高", prompt_instruction: "分析当天各媒体重点关注什么，是否形成共同主题，哪些选题具有较高新闻价值。" },
    { code: "timeliness", dimension_name: "时效性", priority: 2, description: "最新进展是否及时、数据是否更新、是否持续跟进", prompt_instruction: "比较各媒体对同一事件的报道时效：最新进展是否及时、数据是否更新、是否持续跟进。" },
    { code: "angle", dimension_name: "报道角度", priority: 3, description: "不同媒体从什么角度切入同一个新闻", prompt_instruction: "分析不同媒体报道同一新闻时的切入角度差异（如灾后救助 vs 原因追踪）。" },
    { code: "depth", dimension_name: "内容深度", priority: 4, description: "采访、数据、背景、原因、延展、人物、案例", prompt_instruction: "比较报道的内容深度：采访、数据、背景、原因分析、延展、人物、案例的充分程度。" },
    { code: "form", dimension_name: "表现形式", priority: 5, description: "整版、跨版、图表、图示、视频、直播、融媒体形式", prompt_instruction: "比较表现形式：整版、跨版、图表、图示、视频、直播等融媒体手段的运用。" },
    { code: "unique_value", dimension_name: "独有价值/选题遗漏", priority: 6, description: "同行有而广州日报未重点覆盖、但值得关注的报道", prompt_instruction: "重点识别：其他同城媒体重点报道、但广州日报没有重点覆盖的内容，这是评报核心组成。" },
  ];
  for (const d of dimensions) {
    const { error } = await client.from("review_dimension").upsert(d, { onConflict: "code" });
    if (error) throw new Error(`评报维度写入失败 ${d.code}: ${error.message}`);
  }
  console.log(`✓ 评报维度 ${dimensions.length} 条`);

  // 4. 全局配置（业务阈值全部可配，工作流禁止硬编码）
  const configs = [
    { key: "calendar.horizon_days", value: 14, description: "新闻日历默认展示未来天数" },
    { key: "calendar.home_days", value: 7, description: "首页展示未来天数" },
    { key: "review.word_count_threshold", value: 2000, description: "重点报道候选字数阈值" },
    { key: "ai.confidence_auto", value: 0.85, description: "置信度≥此值自动进入候选结果" },
    { key: "ai.confidence_review", value: 0.6, description: "置信度≥此值进入人工审核，低于此值不展示" },
    { key: "cron.clue_publish", value: "0 9 * * *", description: "每日新闻线索发布时间(09:00)" },
    { key: "cron.dynamic_node", value: "0 6 * * *", description: "动态新闻节点发现(每日06:00)" },
    { key: "cron.weekly_brief", value: "0 10 * * 1", description: "每周媒体简报(周一10:00)" },
    { key: "cron.daily_review", value: "30 10 * * *", description: "每日评报生成(默认10:30，待电子报更新时间确认后调整)" },
    { key: "cron.crawl", value: "0 8 * * *", description: "媒体文章抓取(每日08:00)" },
    { key: "review.media_names", value: ["广州日报", "南方日报", "南方都市报", "新快报", "羊城晚报", "信息时报"], description: "每日评报默认媒体名单" },
    { key: "crawl.request_interval_ms", value: 10000, description: "单数据源抓取最小间隔(毫秒)" },
  ];
  for (const cfg of configs) {
    const { error } = await client.from("app_config").upsert(cfg, { onConflict: "key" });
    if (error) throw new Error(`配置写入失败 ${cfg.key}: ${error.message}`);
  }
  console.log(`✓ 全局配置 ${configs.length} 条`);
  console.log("提示：账号由 scripts/seed-users.ts 初始化（admin/editor，密码 newsdesk2026）");
}

main()
  .then(() => {
    console.log("种子数据写入完成");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
