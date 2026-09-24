// Main-system verification: read-only DB evidence, then existing HTTP workflows.
import fs from 'node:fs';import path from 'node:path';import dotenv from 'dotenv';import {createClient} from '@supabase/supabase-js';
for(const p of ['.env.local','.env'])if(fs.existsSync(p))dotenv.config({path:p,quiet:true});
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const folder='scraper/logs/real-poc';const reports=['广州日报','南方日报','南方都市报'].map(name=>JSON.parse(fs.readFileSync(path.join(folder,fs.readdirSync(folder).filter(file=>file.startsWith(name+'-')).sort().at(-1)),'utf8')));
const journal={checked_at:new Date().toISOString(),mapping:[],business:{}};const save=()=>fs.writeFileSync('logs/real-poc-business.json',JSON.stringify(journal,null,2));
const {data:media}=await db.from('media').select('id,media_name');
for(const report of reports){const {data,error}=await db.from('article').select('id,source_id,media_id,url,title,publish_time,is_test,word_count').in('url',report.articles.map(a=>a.url));journal.mapping.push({media:report.media,source_id:report.source_id,ingest:report.ingest,stored:data?.map(a=>({...a,media_name:media.find(m=>m.id===a.media_id)?.media_name})),error:error?.message});}save();
const ids=media.filter(m=>['广州日报报业集团','广州日报','南方日报','南方都市报'].includes(m.media_name)).map(m=>m.id);
const base='http://localhost:3001';const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.AUDIT_PASSWORD})});const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Login failed');const headers={Cookie:cookie,'Content-Type':'application/json'};
const request=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});return{http:r.status,data:await r.json()};};
if(process.argv.includes('--business')){
  journal.business.identify=await request('/api/admin/leads/identify',{timeRange:'custom',customStart:'2026-09-16T16:00:00Z',customEnd:'2026-09-17T15:59:59Z',mediaScope:'custom',customMediaIds:ids,clueTypes:['new_column']});save();
  journal.business.draft=await request('/api/review/draft',{date:'2026-09-17',customRequirement:'本次只比较广州日报（数据库名称广州日报报业集团）、南方日报、南方都市报的真实原文。严禁将测试、Mock或example.test内容作为来源。仅在有原文证据时判断同题、同行独有和新华社转载；没有证据明确说明。'});save();
}
journal.business.leads=await request('/api/leads');journal.business.home=await request('/api/home/preview');journal.business.reviews=await request('/api/review');save();
console.log(JSON.stringify({mapping:journal.mapping.map(m=>({media:m.media,stored:m.stored?.length,storedMedia:[...new Set(m.stored?.map(a=>a.media_name))],testArticles:m.stored?.filter(a=>a.is_test).length,error:m.error})),identifyHttp:journal.business.identify?.http,identifyStats:journal.business.identify?.data.stats,draftHttp:journal.business.draft?.http,draftArticleCount:journal.business.draft?.data.articleCount,leadCount:journal.business.leads.data.total,reviewCount:journal.business.reviews.data.total}));
