// HTTP generation/followup verification. Existing report must remain intact on failure.
import fs from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
const base=process.env.BASE_URL||'http://127.0.0.1:3001';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({username:'admin',password:process.env.AUDIT_PASSWORD})});
const cookie=login.headers.get('set-cookie')?.split(';')[0];
if(!cookie) throw new Error('Existing-account login failed');
const headers={Cookie:cookie,'Content-Type':'application/json'};
const get=async route=>(await fetch(`${base}${route}`,{headers,signal:AbortSignal.timeout(30000)})).json();
const list=await get('/api/review');
let id;
const journal={run_id:randomUUID(),results:[]};
async function stream(route,body) {
  const response=await fetch(`${base}${route}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(150000)});
  const raw=await response.text();
  const events=raw.split('\n').filter(line=>line.startsWith('data: ')&&line!=='data: [DONE]').flatMap(line=>{try{return[JSON.parse(line.slice(6))];}catch{return[];}});
  return{http:response.status,phases:[...new Set(events.map(event=>event.phase).filter(Boolean))],
    error:events.find(event=>event.error)?.error,finalChars:events.reduce((total,event)=>total+(event.delta?.length||event.content?.length||0),0),
    modules:events.find(event=>event.phase==='structure')?.modules?.map(row=>row.type),saved:events.some(event=>event.phase==='saved')};
}
const generated=await stream('/api/admin/review/generate',{reportDate:new Date().toISOString().slice(0,10)});
journal.results.push({name:'从本期选稿生成评报',status:generated.saved&&!generated.error?'PASS':'FAIL',evidence:generated});
if(generated.saved) id=(await get('/api/review')).reviews?.find(row=>row.report_date===new Date().toISOString().slice(0,10))?.id;
if(id){
  const before=await get(`/api/review/${id}`);
  const output=await stream(`/api/review/${id}/followup`,{input:'验收补充要求：请重新生成完整每日评报，保留今日重点、同题观察、同行亮点与广州日报分析，最终评报用连贯段落，不要只回答补充问题。'});
  const after=await get(`/api/review/${id}`);
  journal.results.push({name:'补充要求后完整重生成并保存',status:output.saved&&!output.error?'PASS':'FAIL',evidence:output});
  journal.results.push({name:output.error?'重生成失败保留原评报':'完整重生成持久化版本递增',status:output.error?hash(before.review)===hash(after.review)?'PASS':'FAIL':after.review?.version>before.review?.version&&!!after.review?.final_summary?'PASS':'FAIL',
    evidence:{reviewId:id,beforeVersion:before.review?.version,afterVersion:after.review?.version,unchanged:hash(before.review)===hash(after.review)}});
}
fs.mkdirSync('logs/acceptance',{recursive:true});fs.writeFileSync('logs/acceptance/review-http.json',JSON.stringify(journal,null,2));
console.log(JSON.stringify(journal,null,2));
