// Real Windows-task entry: ensure local main app, then invoke authenticated business HTTP.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';
import {spawn}from'node:child_process';import{randomUUID}from'node:crypto';import dotenv from'dotenv';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
for(const p of ['.env.local','.env'])if(fs.existsSync(p))dotenv.config({path:p,quiet:true});
const job=process.argv[2];if(!['calendar_recommend','media_then_clues'].includes(job))throw new Error('Unknown local task');
const folder=path.join(root,'logs/scheduler');fs.mkdirSync(folder,{recursive:true});
const lock=path.join(folder,`${job}.lock`);
try{const pid=Number(fs.readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive){console.log('Task already running');process.exit(1);}fs.unlinkSync(lock);}catch(e){if(e.code!=='ENOENT')throw e;}
const fd=fs.openSync(lock,'wx');fs.writeSync(fd,String(process.pid));fs.closeSync(fd);
const latest=path.join(folder,`${job}-latest.json`);
if(fs.existsSync(latest)){const previous=JSON.parse(fs.readFileSync(latest,'utf8'));if(!previous.ended_at){previous.status='interrupted';previous.error='Previous worker stopped before writing completion';previous.recovered_at=new Date().toISOString();fs.writeFileSync(path.join(folder,`${previous.run_id}.json`),JSON.stringify(previous,null,2));}}
const journal={run_id:randomUUID(),pid:process.pid,job,status:'running',phase:'starting',trigger:process.argv.includes('--task')?'Windows Task Scheduler':'manual CLI',started_at:new Date().toISOString(),steps:[]};
const save=()=>{for(const name of [`${job}-latest.json`,`${journal.run_id}.json`]){const temp=path.join(folder,`${name}.${journal.run_id}.tmp`);fs.writeFileSync(temp,JSON.stringify(journal,null,2));fs.renameSync(temp,path.join(folder,name));}};save();
const secret=process.env.CRON_SECRET||process.env.CRON_TOKEN;
const ingestToken=process.env.INGEST_API_TOKEN||process.env.CRON_SECRET;
const base=process.env.LOCAL_MAIN_API_BASE||`http://127.0.0.1:${process.env.PORT||3001}`;
const cleanEnv=(baseEnv=process.env)=>{const e={...baseEnv};for(const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy'])delete e[k];return e;};
const headers={Authorization:`Bearer ${secret}`,'Content-Type':'application/json'};
const ingestHeaders={Authorization:`Bearer ${ingestToken}`,'Content-Type':'application/json'};
async function ready(){try{const r=await fetch(base+'/api/ingest/health',{headers,signal:AbortSignal.timeout(10000)});return r.ok;}catch{return false;}}
async function execute(name){journal.phase=name;const step={name,status:'running',started_at:new Date().toISOString()};journal.steps.push(step);save();try{const response=await fetch(`${base}/api/cron/${name}`,{method:'POST',headers,signal:AbortSignal.timeout(1800000)});const result=await response.json();Object.assign(step,{ended_at:new Date().toISOString(),http:response.status,result,status:response.ok&&result.success?'success':'failed'});save();if(!response.ok||!result.success)throw new Error(result.error||result.summary||`HTTP ${response.status}`);}catch(e){Object.assign(step,{status:'failed',error:e.message,ended_at:new Date().toISOString()});save();throw e;}}
try{
  if(!secret)throw new Error('CRON_SECRET missing');
  journal.phase='main_health';save();
  if(!await ready()){
    const log=fs.openSync(path.join(folder,'main-server.log'),'a');
    const child=spawn(process.execPath,['scripts/run-local.mjs','start'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log],env:cleanEnv()});child.unref();fs.closeSync(log);
    let healthy=false;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,2000));if(await ready()){healthy=true;break;}}
    if(!healthy)throw new Error('Local main app not ready; see main-server.log');
  }
  const target=job==='media_then_clues'?'clue_identify':'calendar_recommend';
  journal.phase='task_switch';save();
  const enabledResponse=await fetch(`${base}/api/cron/${target}`,{headers,signal:AbortSignal.timeout(60000)});
  if(!enabledResponse.ok)throw new Error(`Read task switch HTTP ${enabledResponse.status}`);
  if((await enabledResponse.json()).enabled===false){journal.status='skipped';}
  else {
  if(job==='media_then_clues'){
    const scraper=path.resolve(root,'../media-scraper');const python=path.join(scraper,'.venv/Scripts/python.exe');
    // 抓取子进程必须走代理才能访问外网新闻站；但 localhost:3001 的 ingest 回推要走直连，
    // 故显式注入 HTTP(S)_PROXY 并设 NO_PROXY=localhost,127.0.0.1（主服务本身不代理，避免 502）。
    const SCRAPER_PROXY=process.env.SCRAPER_PROXY||'http://127.0.0.1:7897';
    const scraperEnv={...process.env,HTTP_PROXY:SCRAPER_PROXY,HTTPS_PROXY:SCRAPER_PROXY,http_proxy:SCRAPER_PROXY,https_proxy:SCRAPER_PROXY,NO_PROXY:'localhost,127.0.0.1'};
    // 代理预热：抓取前确认代理可用，避免首轮因代理未就绪/冷启动而大规模失败（系统性问题修复）。
    // 历史 run 在启动后前 ~5 分钟出现 code:0/1/-1 集中失败、随后恢复，正是代理冷启动 + 并发突增所致。
    const proxyReachable=(url)=>new Promise((resolve)=>{const c=spawn('curl',['-s','-o','NUL','-w','%{http_code}','--max-time','15','-x',SCRAPER_PROXY,url],{windowsHide:true});let out='';c.stdout.on('data',d=>out+=d);c.on('error',()=>resolve(false));c.on('exit',code=>resolve(code===0&&out.trim()==='200'));});
    const PROXY_TEST_URLS=['https://www.baidu.com','https://www.thepaper.cn','https://www.people.com.cn'];
    let proxyOk=false;
    for(let i=0;i<6 && !proxyOk;i++){for(const u of PROXY_TEST_URLS){if(await proxyReachable(u)){proxyOk=true;break;}}if(!proxyOk)await new Promise(r=>setTimeout(r,5000));}
    if(!proxyOk)throw new Error('抓取前代理未就绪（'+SCRAPER_PROXY+'）；放弃本次抓取以免浪费额度');
    // 配置驱动：读取当前启用且类型为 website 的抓取队列（media_source），不再硬编码媒体名单。
    // 监测范围由 media.monitor_clue=true 决定；本任务只负责「把队列里该抓的都抓一遍」。
    const qResp=await fetch(`${base}/api/ingest/queue`,{headers:ingestHeaders,signal:AbortSignal.timeout(60000)});
    if(!qResp.ok)throw new Error(`拉取抓取队列失败 HTTP ${qResp.status}`);
    const queue=(await qResp.json()).sources||[];
    const targets=queue.filter(s=>(s.sourceType||s.source_type)==='website' && s.enabled!==false);
    if(!targets.length)throw new Error('抓取队列为空（无启用 website 源）');
    const perMedia=[]; let pushed=0;
    const CONC=Math.max(1,Number(process.env.SCRAPE_CONCURRENCY||4));   // 并发上限，避免 135 家无限并发
    const TIMEOUT_MS=Number(process.env.SCRAPE_PER_SOURCE_MS||600000); // 单源超时（默认 10 分钟）
    async function runOne(src){
      const mediaName=src.mediaName||src.media_name;
      const step={name:'media_fetch',media:mediaName,status:'running',started_at:new Date().toISOString()};journal.steps.push(step);save();
      const attempt=async()=>{
        const filesBefore=new Set(fs.readdirSync(path.join(scraper,'logs/real-poc')));
        const log=fs.openSync(path.join(folder,'media-fetch.log'),'a');
        let code;
        try{code=await new Promise((resolve,reject)=>{const child=spawn(python,['poc_ingest_real.py',mediaName,'10','--scheduled'],{cwd:scraper,windowsHide:true,stdio:['ignore',log,log],env:scraperEnv});const timer=setTimeout(()=>{child.kill();reject(new Error(`${mediaName} 超时`));},TIMEOUT_MS);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',c=>{clearTimeout(timer);resolve(c);});});}finally{fs.closeSync(log);}
        const added=fs.readdirSync(path.join(scraper,'logs/real-poc')).filter(f=>!filesBefore.has(f)&&f.startsWith(mediaName+'-')).sort().at(-1);
        const report=added?JSON.parse(fs.readFileSync(path.join(scraper,'logs/real-poc',added),'utf8')):null;
        const ok=code===0&&report?.ingest?.success===true&&report.ingest.failed===0;
        return {ok,code,report,added};
      };
      // 失败重试：上限 3 次。仅对“非 0 退出 / 超时 / 进程异常”（代理或网络瞬断）做重试；
      // 解析类 0 文章（code:0 但无正文）属稳定失败，不重试以免浪费时间。
      let res; const MAX_ATTEMPTS=3;
      for(let attemptNo=0; attemptNo<MAX_ATTEMPTS; attemptNo++){
        res=await attempt();
        if(res.ok) break;
        const transient = res.code !== 0 || !!res.error;
        if(!transient) break;
        if(attemptNo < MAX_ATTEMPTS-1) await new Promise(r=>setTimeout(r, 4000*(attemptNo+1)));
      }
      if(!res) res={ok:false,error:'retry exhausted'};
      const ok=!!res.ok; const report=res.report;
      Object.assign(step,{status:ok?'success':'failed',ended_at:new Date().toISOString(),code:res.code,ok,report:res.added,articles:report?.successful_bodies??0,ingest:report?.ingest,failures:report?.failures??[],error:res.error});save();
      perMedia.push({media:mediaName,ok,articles:report?.successful_bodies??0}); if(ok)pushed++;
    }
    // 并发池：每批最多 CONC 个，跑完一批再下一批
    for(let i=0;i<targets.length;i+=CONC){ await Promise.all(targets.slice(i,i+CONC).map(runOne)); }
    journal.perMedia=perMedia;
    journal.scrapedTotal=targets.length; journal.scrapedOk=pushed;
    if(!pushed)throw new Error('没有任何媒体完成成功抓取；未触发线索识别');
    await execute('clue_identify');
  }else await execute('calendar_recommend');
  journal.status='success';
  }
}catch(error){journal.status='failed';journal.error=error.message;for(const step of journal.steps.filter(s=>s.status==='running'))Object.assign(step,{status:'failed',error:error.message,ended_at:new Date().toISOString()});process.exitCode=1;}
finally{journal.ended_at=new Date().toISOString();save();fs.unlinkSync(lock);console.log(JSON.stringify({run_id:journal.run_id,job,status:journal.status,error:journal.error}));}
