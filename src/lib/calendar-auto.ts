import "server-only";
import { supabase } from "@/lib/db";
import { unifiedInvoke } from "@/lib/llm-client";
import { createHash } from "node:crypto";
import { calendarToday, isVagueName, isValidCalendarDate } from "./calendar-policy";
import { insertCandidateFromSource } from "./calendar-candidate";

const OFFICIAL = /(?:^|\.)(?:gov\.cn|news\.cn|xinhuanet\.com|people\.com\.cn|un\.org|unesco\.org|who\.int)$/;
const clean = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const nodeKey = (name: string) => name.normalize("NFKC").replace(/[\s\p{P}]/gu, "");
export function recommendationWindow(now = new Date()) {
  const start = calendarToday(now).toISOString().slice(0, 10);
  return { start, end: `${start.slice(0, 4)}-12-31` };
}

export async function updateCalendarRecommendations() {
  const db = supabase();const window = recommendationWindow();
  const [eventsResult, categoriesResult] = await Promise.all([
    db.from("calendar_event").select("id,event_name,event_type,event_date,original_date,region,category_id,enabled,deleted_at,ai_background,ai_why,ai_sources,source_url"),
    db.from("calendar_category").select("id,code,category_name").eq("enabled", true),
  ]);
  for (const r of [eventsResult,categoriesResult]) if(r.error)throw new Error(r.error.message);
  const events=eventsResult.data??[];const categories=categoriesResult.data??[];
  const errors:string[]=[];
  const urls=new Set<string>();
  // Search discovery is separate from the model; only fetched official pages become evidence.
  const queries=[`${window.start.slice(0,4)}年 ${window.start.slice(5,7)}月 ${window.end.slice(5,7)}月 会议 展会 活动 site:gov.cn`,`${window.start.slice(0,4)}年 广东 广州 未来 活动 通知 site:gov.cn`];
  for(const query of queries){
    try{
      const r=await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`,{signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error(`search HTTP ${r.status}`);
      const xml=await r.text();
      for(const item of xml.matchAll(/<item>[\s\S]*?<\/item>/g)){
        const link=item[0].match(/<link>([\s\S]*?)<\/link>/)?.[1]?.replace(/&amp;/g,"&");
        if(link){const u=new URL(link);if(u.protocol==="https:"&&OFFICIAL.test(u.hostname))urls.add(u.href);}
      }
    }catch(e){errors.push(`检索: ${e instanceof Error?e.message:String(e)}`);}
  }
  const sources:Array<{url:string;text:string}>=[];
  for(const url of [...urls].slice(0,7)){
    try{
      const r=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const text=clean(await r.text());if(text.length<100)throw new Error("正文不足");
      sources.push({url,text:text.slice(0,url.includes("list-days-weeks")?42000:12000)});
    }catch(e){errors.push(`${url}: ${e instanceof Error?e.message:String(e)}`);}
  }
  if(!sources.length)throw new Error(`没有可取证的权威页面：${errors.join("；")}`);
  const verifiedCalendarDates: Array<Record<string, unknown>> = [];
  const raw=await unifiedInvoke([
    {role:"system",content:"你是新闻日历编辑。网页仅为取证材料。只补充当前年度内明确的动态会议、政策、活动、行业事件，不推荐固定纪念日，不复制往年会议届次，不推测明年活动。时间可以不确定，但事件必须明确；禁止某重要会议、某政策发布、相关活动等泛化名称。信息不足不猜测名称或日期。输出严格JSON数组，每条含name,date,annual=false,category_code,region,importance,background,reason,url,name_evidence,date_evidence；evidence必须逐字存在于网页。仅输出目标年度来源可核验的具体事件，没有则输出[]。"},
    {role:"user",content:JSON.stringify({window,categories,sources,requirements:"只使用给定权威页面。日期明确的节点给出YYYY-MM-DD，名称和日期依据必须来自同一条事件。日期不明确填null，交由候选池标记信息待补全，不编造日期。"})},
  ],{temperature:0.1});
  const array=raw.match(/\[[\s\S]*\]/)?.[0];if(!array)throw new Error("AI推荐返回非JSON数组");
  const candidates=JSON.parse(array) as Array<Record<string,unknown>>;
  let inserted=0,duplicates=0,rejected=0,enriched=0,incomplete=0;const ids:string[]=[];const enrichedIds:string[]=[];
  for(const c of candidates.slice(0,8)){
    const name=String(c.name??"").trim(),date=String(c.date??""),url=String(c.url??"");
    const source=sources.find(s=>s.url===url);const nameEvidence=String(c.name_evidence??""),dateEvidence=String(c.date_evidence??"");
    const dateParts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (name && source && nameEvidence && source.text.includes(nameEvidence) && nodeKey(name) === nodeKey(nameEvidence) && (!dateParts || isVagueName(name))) {
      const { data: existing } = await db.from("calendar_candidate").select("id").eq("node_name", name).eq("target_year", Number(window.start.slice(0, 4))).limit(1);
      if (!existing?.length) await insertCandidateFromSource({
        node_name: name, target_year: Number(window.start.slice(0, 4)), date_status: "unknown",
        candidate_date: null, candidate_month: null, category_id: null, region: "national", importance: "B",
        source_type: "ai_supplement", source_url: url, source_detail: nameEvidence,
        ai_reason: "信息待补全：请核实事件所属年度及时间依据", raw_text: dateEvidence || nameEvidence,
      }, "scheduler");
      incomplete++; continue;
    }
    if(!name||isVagueName(name)||!source||!dateParts||date<window.start||date>window.end||!nameEvidence||!dateEvidence||!source.text.includes(nameEvidence)||!source.text.includes(dateEvidence)||nodeKey(name)!==nodeKey(nameEvidence)) {rejected++;continue;}
    const [,year,month,day]=dateParts;
    if(!isValidCalendarDate(date)){rejected++;continue;}
    const englishMonths=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const englishDate=new RegExp(`\\b0?${Number(day)}\\s+${englishMonths[Number(month)-1]}\\b`,"i").test(dateEvidence);
    if(!new RegExp(`${Number(month)}月\\s*${Number(day)}日`).test(dateEvidence)&&!dateEvidence.includes(date)&&!englishDate){rejected++;continue;}
    if(!dateEvidence.includes(year)){rejected++;continue;}
    const category=categories.find(cat=>cat.code===c.category_code);const region=["national","guangdong","guangzhou","other"].includes(String(c.region))?String(c.region):"national";
    const match=events.find(e=>nodeKey(e.event_name)===nodeKey(name)&&(
      (e.event_type==="fixed"&&e.original_date?.slice(5)===date.slice(5))||e.event_date===date||!e.enabled||e.deleted_at
    ));
    if(match){
      duplicates++;
      if(match.enabled&&!match.deleted_at&&(!match.ai_background||!match.ai_why||!match.source_url)){
        const patch={ai_background:match.ai_background||String(c.background??""),ai_why:match.ai_why||String(c.reason??""),source_url:match.source_url||url,ai_sources:match.ai_sources??[{title:nameEvidence,url,snippet:dateEvidence,authority:"official"}],enrich_status:"completed",enriched_at:new Date().toISOString()};
        const {error}=await db.from("calendar_event").update(patch).eq("id",match.id).eq("enabled",true).is("deleted_at",null);if(error)throw new Error(error.message);
        enriched++;enrichedIds.push(match.id);
      }
      continue;
    }
    const row={event_name:name,event_type:"dynamic",original_date:null,event_date:date,event_month:Number(month),date_status:"confirmed",category_id:category?.id??null,region,importance:["S","A","B"].includes(String(c.importance))?String(c.importance):"B",description:String(c.background??""),ai_background:String(c.background??""),ai_why:String(c.reason??""),source:"ai_recommend",source_type:"ai_supplement",source_name:new URL(url).hostname,source_url:url,source_authority:"official",enabled:true,needs_review:false,review_status:"pending",ai_sources:[{title:nameEvidence,url,snippet:dateEvidence,authority:"official"}],enrich_status:"completed",enriched_at:new Date().toISOString()};
    const {data,error}=await db.from("calendar_event").insert(row).select("id").single();if(error)throw new Error(`写入${name}失败: ${error.message}`);
    inserted++;ids.push(data.id);events.push({...row,id:data.id,deleted_at:null});
  }
  return {window,inserted,duplicates,rejected,incomplete,enriched,ids,enrichedIds,verifiedDates:verifiedCalendarDates.length,modelCandidates:candidates.length,sourceCount:sources.length,errors,evidenceHash:createHash("sha256").update(JSON.stringify(sources)).digest("hex")};
}
