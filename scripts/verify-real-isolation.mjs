// Read-only evidence for real-media PoC and default business-data isolation.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
for(const p of ['.env.local','.env']) if(fs.existsSync(p)) dotenv.config({path:p,quiet:true});
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const directory='scraper/logs/real-poc';
const reports=fs.readdirSync(directory).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))).filter(r=>r.ingest?.success);
const urls=[...new Set(reports.flatMap(r=>r.articles.map(a=>a.url)))];
const {data:rows,error}=await db.from('article').select('id,url,source_id,media_id,is_test,content,word_count,publish_time,column_name').in('url',urls);
if(error) throw new Error(error.message);
const {data:media}=await db.from('media').select('id,media_name');
const {data:testArticles}=await db.from('article').select('id').eq('is_test',true);
const journal={checked_at:new Date().toISOString(),retainedTestArticles:testArticles.length,media:[],results:[]};
for(const name of ['广州日报','南方日报','南方都市报']){
  const rs=reports.filter(r=>r.media===name);const set=new Set(rs.flatMap(r=>r.articles.map(a=>a.url)));const stored=rows.filter(a=>set.has(a.url));
  journal.media.push({name,uniqueArticles:set.size,stored:stored.length,inserted:rs.reduce((n,r)=>n+r.ingest.inserted+(r.partial_ingest?.inserted||0),0),updated:rs.reduce((n,r)=>n+r.ingest.updated,0),duplicates:rs.reduce((n,r)=>n+r.ingest.duplicated,0),detailFailures:rs.flatMap(r=>r.failures),storedMedia:[...new Set(stored.map(a=>media.find(m=>m.id===a.media_id)?.media_name))],testCount:stored.filter(a=>a.is_test).length,missingBodies:stored.filter(a=>!a.content).length});
}
const base='http://localhost:3001';
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.AUDIT_PASSWORD})});
const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Login failed');
for(const route of ['/api/calendar','/api/leads','/api/home/preview','/api/review','/api/review/draft?date=2026-09-17','/api/ingest/health']){
  const response=await fetch(base+route,{headers:{Cookie:cookie}});const data=await response.json();
  const copy=JSON.parse(JSON.stringify(data));if(copy.draft?.draft)delete copy.draft.draft.conditions;
  const text=JSON.stringify(copy);const hasTestReference=testArticles.some(a=>text.includes(a.id))||/https?:[^"\s]*(?:example\.test|mock-ingest\.local)/i.test(text);
  journal.results.push({route,http:response.status,testReference:hasTestReference,status:response.ok&&!hasTestReference?'PASS':'FAIL'});
}
const {data:review}=await db.from('daily_review').select('id,version,sections,final_summary,is_test').eq('report_date','2026-09-17').single();
if(review){
  const sections=typeof review.sections==='string'?JSON.parse(review.sections):review.sections;const{conditions,...content}=sections;const text=JSON.stringify(content);
  const {data:draftRow}=await db.from('review_draft').select('draft').eq('report_date','2026-09-17').eq('is_test',false).single();
  const draft=typeof draftRow.draft==='string'?JSON.parse(draftRow.draft):draftRow.draft;
  const background=new Set(draft.xinhua_background.map(a=>a.url));
  const comparisonUrls=(sections.same_topic?.topics??[]).flatMap(t=>t.comparison.map(a=>a.url));
  const peerUrls=(sections.peer_highlights?.items??[]).map(a=>a.url);
  journal.review={id:review.id,version:review.version,is_test:review.is_test,chars:review.final_summary?.length,testArticleReference:testArticles.some(a=>text.includes(a.id)),mockUrl:/https?:[^"\s]*(?:example\.test|mock-ingest\.local)/i.test(text),rawMarkdown:/###|\*\*/.test(review.final_summary),xinhuaInOriginalComparison:comparisonUrls.some(url=>background.has(url)),xinhuaInPeers:peerUrls.some(url=>background.has(url)),unselectedPeer:peerUrls.some(url=>!draft.peer_highlights.some(a=>a.url===url))};
}
fs.writeFileSync('logs/real-poc-isolation.json',JSON.stringify(journal,null,2));console.log(JSON.stringify(journal,null,2));
