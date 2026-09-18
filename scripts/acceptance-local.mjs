// Existing functionality only. --mutations runs the user-authorized HTTP tests.
// Secrets stay in memory/environment and are redacted from the local journal.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
for (const file of ['.env.local','.env']) if (fs.existsSync(file)) dotenv.config({path:file,quiet:true});
const base = process.env.BASE_URL || 'http://127.0.0.1:3001';
const runId = randomUUID();
const directory = path.join('logs','acceptance',runId);
fs.mkdirSync(directory,{recursive:true});
const report = {run_id:runId,checkedAt:new Date().toISOString(),base,results:[]};
const secrets = Object.entries(process.env).filter(([key,value])=>/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(key)&&value?.length>5).map(([,value])=>value);
const clean = value => JSON.parse(JSON.stringify(value,(_key,part)=>typeof part==='string' ? secrets.reduce((text,secret)=>text.split(secret).join('[REDACTED]'),part) : part));
function record(name,pass,evidence) {
  report.results.push(clean({name,status:pass?'PASS':'FAIL',evidence}));
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2));
  console.log(`${pass?'PASS':'FAIL'} ${name}`);
}
let cookie;
async function request(route,body,timeout=90000,method=body===undefined?'GET':'POST') {
  const response = await fetch(`${base}${route}`,{method,
    headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeout),redirect:'manual'});
  const raw = await response.text();
  let data; try {data=JSON.parse(raw);} catch {data={htmlBytes:raw.length,hasNextError:raw.includes('__next_error__')};}
  return {status:response.status,data,response};
}
const login = await request('/api/auth/login',{username:process.env.AUDIT_USERNAME||'admin',password:process.env.AUDIT_PASSWORD});
cookie = login.response.headers.get('set-cookie')?.split(';')[0];
if (!cookie || login.status!==200) throw new Error(`Existing account login failed (${login.status}); set AUDIT_PASSWORD`);
record('登录',true,{http:login.status});
const calendar = await request('/api/calendar?view=month');
record('新闻日历 API 200',calendar.status===200,{http:calendar.status,error:calendar.data.error,total:calendar.data.total});
record('当前30天应有历史节点',calendar.status===200 && calendar.data.total>=12,{total:calendar.data.total,expectedAtLeast:12});
if (calendar.data.items?.length) {
  const detail = await request(`/api/calendar/${calendar.data.items[0].id}`);
  record('节点详情',detail.status===200&&!!detail.data.item?.event_name,{http:detail.status,name:detail.data.item?.event_name});
} else record('节点详情',false,{reason:'日历没有可验收的可见节点；依赖结构兼容和历史导入'});
if (process.argv.includes('--mutations')) {
  const created=await request('/api/admin/calendar',{event_name:`验收临时节点-${runId}`,event_type:'dynamic',
    event_date:new Date().toISOString().slice(0,10),source_type:'manual',importance:'B',region:'national'});
  const id=created.data.item?.id;
  record('日历新增验收节点',created.status===200&&!!id,{http:created.status,id,error:created.data.error});
  if (id) {
    const edited=await request(`/api/admin/calendar/${id}`,{event_name:`验收已编辑节点-${runId}`},90000,'PATCH');
    record('日历编辑',edited.status===200&&edited.data.item?.event_name===`验收已编辑节点-${runId}`,{http:edited.status});
    const disabled=await request(`/api/admin/calendar/${id}`,{enabled:false},90000,'PATCH');
    const hidden=await request('/api/calendar?view=month');
    record('日历停用后隐藏',disabled.status===200&&hidden.status===200&&!hidden.data.items.some(row=>row.id===id),{http:disabled.status});
    const deleted=await request(`/api/admin/calendar/${id}`,{delete_reason:'duplicate'},90000,'DELETE');
    const refreshed=await request('/api/calendar?view=month');
    const detail=await request(`/api/calendar/${id}`);
    record('日历软删除后不再展示',deleted.status===200&&refreshed.status===200&&!refreshed.data.items.some(row=>row.id===id)&&detail.status===404,
      {http:deleted.status,detailHttp:detail.status,id,note:'临时记录软删除保留，不物理清理'});
  } else for (const name of ['日历编辑','日历停用后隐藏','日历软删除后不再展示']) record(name,false,{reason:'临时节点创建失败；没有修改线上既有节点'});
}
for (const route of ['/calendar','/','/leads','/review','/admin/scheduler']) {
  const result=await request(route); record(`页面 ${route}`,result.status===200&&!result.data.hasNextError,{http:result.status});
}
const home = await request('/api/home/preview');
record('首页预览 HTTP',home.status===200,{http:home.status});
record('首页未来7天具体节点',home.status===200&&!home.data.calendar_warning&&home.data.upcoming?.length>0,
  {warning:home.data.calendar_warning,items:home.data.upcoming});
record('首页具体新栏目',home.data.latest_leads?.some(row=>!!row.column_name&&row.column_name!=='未命名新栏目'),{items:home.data.latest_leads});
const leads = await request('/api/leads?scope=all');
record('新闻线索查询',leads.status===200,{http:leads.status,total:leads.data.total,keys:Object.keys(leads.data)});
const reviews = await request('/api/review');
const latest = reviews.data.reviews?.[0];
record('最近一期评报历史',reviews.status===200&&!!latest,{http:reviews.status,latest});
if (latest) {
  const detail=await request(`/api/review/${latest.id}`);
  record('评报完整内容读取',detail.status===200&&!!detail.data.review?.final_summary,
    {http:detail.status,length:detail.data.review?.final_summary?.length,modules:detail.data.review?.modules?.map(row=>row.type)});
}
const draft=await request(`/api/review/draft?date=${new Date().toISOString().slice(0,10)}`);
record('本期选稿读取（允许首次尚未生成）',draft.status===200||draft.status===404,{http:draft.status,error:draft.data.error,note:'404仅表示首次尚未生成；持久化另行检查'});
const llm=await request('/api/admin/llm/test',{baseUrl:process.env.DEFAULT_LLM_BASE_URL,apiKey:process.env.DEFAULT_LLM_API_KEY,model:process.env.DEFAULT_LLM_MODEL},90000);
record('本地 DeepSeek 实际调用',llm.status===200&&llm.data.success===true,{http:llm.status,success:llm.data.success,error:llm.data.error});
const health=await request('/api/ingest/health');
record('ingest health',health.status===200&&health.data.status==='ok',{http:health.status,checks:health.data.checks});
if (process.argv.includes('--mutations')) {
  const remote=process.env.SUPABASE_URL||process.env.COZE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  const response=await fetch(`${remote}/rest/v1/app_config?select=value&key=eq.ingest.api_token`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('Unable to read existing ingest token');
  const config=await response.json();
  const token=typeof config[0]?.value==='string'?config[0].value:process.env.INGEST_API_TOKEN;
  if (token) secrets.push(token);
  const exitCode=await new Promise(resolve=>{
    const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/mock-ingest.ts'],{env:{...process.env,BASE_URL:base,INGEST_TOKEN:token,ACCEPTANCE_RUN_ID:runId},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output=''; child.stdout.on('data',chunk=>output+=chunk); child.stderr.on('data',chunk=>output+=chunk);
    child.on('error',error=>{output+=error.message;resolve(-1);});
    child.on('close',code=>{fs.writeFileSync(path.join(directory,'mock-ingest.log'),clean(output));resolve(code);});
  });
  record('真实 HTTP Mock ingest / 去重 / 补全更新',exitCode===0,{exitCode,log:'mock-ingest.log'});
  // A tiny, bounded source/time scope: do not scan all production articles.
  const identify=await request('/api/admin/leads/identify',{timeRange:'custom',customStart:new Date().toISOString(),customEnd:new Date().toISOString(),clueTypes:['new_column']});
  record('线索识别 HTTP 入口（空时间窗）',identify.status===200,{http:identify.status,stats:identify.data.stats,error:identify.data.error,note:'入口检查；不代表新栏目识别通过'});
  if (llm.data.success===true) {
    const created=await request('/api/review/draft',{date:new Date().toISOString().slice(0,10)},180000);
    record('本期选稿实际生成',created.status===200,{http:created.status,error:created.data.error,articleCount:created.data.articleCount});
    const persisted=await request(`/api/review/draft?date=${new Date().toISOString().slice(0,10)}`);
    record('本期选稿持久化读取',persisted.status===200,{http:persisted.status,error:persisted.data.error});
  } else record('本期选稿实际生成',false,{reason:'DeepSeek 实际调用失败；未进行依赖该配置的生成'});
  const job=await request('/api/admin/scheduler/run',{job:'clue_identify'},180000);
  record('定时任务手动执行一次',job.status===200&&job.data.success===true,{http:job.status,result:job.data});
}
const schedule=await request('/api/admin/scheduler');
record('任务最近执行 / 下次执行 / 状态字段',schedule.status===200&&schedule.data.jobs?.every(row=>
  Object.hasOwn(row,'lastRunAt')&&Object.hasOwn(row,'lastRunStatus')&&Object.hasOwn(row,'nextRunAt')),
  {http:schedule.status,jobs:schedule.data.jobs,message:schedule.data.message});
console.log(JSON.stringify({run_id:runId,path:path.join(directory,'results.json'),passed:report.results.filter(row=>row.status==='PASS').length,
  failed:report.results.filter(row=>row.status==='FAIL').length}));
