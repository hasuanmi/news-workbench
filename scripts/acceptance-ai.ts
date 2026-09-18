// Bounded in-memory checks of existing engines. No database writes or imports.
import fs from "node:fs";
import dotenv from "dotenv";
import { analyzeArticle } from "../src/lib/clue-engine";
import { buildDraft } from "../src/lib/review-draft";
import type { ReviewArticle, ReviewConditions } from "../src/lib/review-engine";
for (const file of [".env.local", ".env"]) if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
const results: {name:string;status:string;evidence:unknown}[] = [];
const record = (name:string, pass:boolean, evidence:unknown) => {
  results.push({name,status:pass?"PASS":"FAIL",evidence});
  console.log(`${pass?"PASS":"FAIL"} ${name}`);
};
const article = {id:"fixture",media_id:"fixture-media",media_name:"南方日报",publish_time:"2026-09-17T01:00:00Z",url:"https://example.test/fixture"};
async function main() {
for (const [name,title,content,expected] of [
  ["新栏目开栏语","开栏语｜全新推出“湾区创新观察”", "编者的话（开栏）：即日起本报全新开设固定栏目“湾区创新观察”，每周一期，持续记录科技企业的创新故事。这是本栏首期上线，欢迎读者关注。",true],
  ["旧栏目日常稿", "湾区创新观察｜企业研发投入增长", "本栏目创办于2018年，已连续刊发八年。本期延续以往栏目，采访企业研发团队，报道最新投入情况，没有新开设栏目。",false],
] as const) {
  try {const analysis=await analyzeArticle({...article,title,content});record(name,analysis.is_clue===expected,{analysis});}
  catch(error) {record(name,false,{error:error instanceof Error?error.message:String(error)});}
}
const make = (id:string,media_name:string,title:string,snippet:string):ReviewArticle=>({id,media_id:media_name,media_name,title,snippet,
  url:`https://example.test/${id}`,publish_time:article.publish_time,word_count:2200,section:"要闻",is_key_report:true});
const articles=[
  make("gz","广州日报报业集团","广州出台公交票价优惠新政策","广州出台公交票价优惠新政策，本报记者采访广州通勤乘客，关注出行成本。"),
  make("nf","南方日报","广州公交优惠政策实施，通勤成本下降","广州出台同一公交票价优惠新政策，本报记者走访公交企业，分析政策影响。"),
  make("nd-exclusive","南方都市报","独家调查：深圳充电桩收费乱象","本报独家调查深圳社区充电桩收费问题，广州日报当天没有对应题材。"),
  make("xin-reprint","新快报","新华社：全国重大会议召开","新华社北京9月17日电：全国重大会议召开，各地部署贯彻落实。本稿为新华社通稿全文转载。"),
];
const conditions:ReviewConditions={date:article.publish_time,mediaIds:[],minWordCount:2000,highlightFlags:[],dimensions:["topic","angle"],topics:[],scanMissing:true};
try {
  const draft=await buildDraft(conditions,"2026-09-17",articles,["广州日报报业集团"]);
  record("同题分组（内存）",draft.same_topic.some(group=>["gz","nf"].every(id=>group.articles.some(row=>row.article_id===id))),{draft});
  record("同行独有（内存）",draft.peer_highlights.some(row=>row.article_id==="nd-exclusive"),{});
  record("新华社转载排除原创比较（内存）",!draft.same_topic.some(group=>group.articles.some(row=>row.article_id==="xin-reprint"))&&
    !draft.peer_highlights.some(row=>row.article_id==="xin-reprint")&&draft.xinhua_background.some(row=>row.article_id==="xin-reprint"),{});
} catch(error) {record("选稿分组（内存）",false,{error:error instanceof Error?error.message:String(error)});}
fs.mkdirSync("logs/acceptance",{recursive:true});
fs.writeFileSync("logs/acceptance/ai-quality.json",JSON.stringify({checkedAt:new Date().toISOString(),scope:"in-memory; not HTTP persistence acceptance",results},null,2));
}
main().catch(() => { console.error("AI quality check failed; inspect local configuration"); process.exitCode=1; });
