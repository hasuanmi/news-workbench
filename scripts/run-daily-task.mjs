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
const base=process.env.LOCAL_MAIN_API_BASE||`http://127.0.0.1:${process.env.PORT||3001}`;
const headers={Authorization:`Bearer ${secret}`,'Content-Type':'application/json'};
async function ready(){try{const r=await fetch(base+'/api/ingest/health',{headers,signal:AbortSignal.timeout(10000)});return r.ok;}catch{return false;}}
async function execute(name){journal.phase=name;const step={name,status:'running',started_at:new Date().toISOString()};journal.steps.push(step);save();try{const response=await fetch(`${base}/api/cron/${name}`,{method:'POST',headers,signal:AbortSignal.timeout(1800000)});const result=await response.json();Object.assign(step,{ended_at:new Date().toISOString(),http:response.status,result,status:response.ok&&result.success?'success':'failed'});save();if(!response.ok||!result.success)throw new Error(result.error||result.summary||`HTTP ${response.status}`);}catch(e){Object.assign(step,{status:'failed',error:e.message,ended_at:new Date().toISOString()});save();throw e;}}
try{
  if(!secret)throw new Error('CRON_SECRET missing');
  journal.phase='main_health';save();
  if(!await ready()){
    const log=fs.openSync(path.join(folder,'main-server.log'),'a');
    const child=spawn(process.execPath,['scripts/run-local.mjs','start'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log],env:process.env});child.unref();fs.closeSync(log);
    let healthy=false;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,2000));if(await ready()){healthy=true;break;}}
    if(!healthy)throw new Error('Local main app not ready; see main-server.log');
  }
  const target=job==='media_then_clues'?'clue_identify':'calendar_recommend';
  journal.phase='task_switch';save();
  const enabledResponse=await fetch(`${base}/api/cron/${target}`,{headers,signal:AbortSignal.timeout(20000)});
  if(!enabledResponse.ok)throw new Error(`Read task switch HTTP ${enabledResponse.status}`);
  if((await enabledResponse.json()).enabled===false){journal.status='skipped';}
  else {
  if(job==='media_then_clues'){
    const scraper=path.resolve(root,'../media-scraper');const python=path.join(scraper,'.venv/Scripts/python.exe');
    let pushed=0;
    for(const media of ['广州日报','南方日报','南方都市报']){
      journal.phase=`fetch:${media}`;const step={name:'media_fetch',media,status:'running',started_at:new Date().toISOString()};journal.steps.push(step);save();
      try {
      const filesBefore=new Set(fs.readdirSync(path.join(scraper,'logs/real-poc')));
      const log=fs.openSync(path.join(folder,'media-fetch.log'),'a');
      let code;try{code=await new Promise((resolve,reject)=>{const child=spawn(python,['poc_ingest_real.py',media,'10','--scheduled'],{cwd:scraper,windowsHide:true,stdio:['ignore',log,log]});const timer=setTimeout(()=>{child.kill();reject(new Error(`${media} timed out`));},600000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);resolve(code);});});}finally{fs.closeSync(log);}
      const added=fs.readdirSync(path.join(scraper,'logs/real-poc')).filter(f=>!filesBefore.has(f)&&f.startsWith(media+'-')).sort().at(-1);
      const report=added?JSON.parse(fs.readFileSync(path.join(scraper,'logs/real-poc',added),'utf8')):null;
      const ok=code===0&&report?.ingest?.success===true&&report.ingest.failed===0;
      Object.assign(step,{status:ok?'success':'failed',ended_at:new Date().toISOString(),code,ok,report:added,articles:report?.successful_bodies??0,ingest:report?.ingest,failures:report?.failures??[]});save();if(ok)pushed++;
      } catch(error){Object.assign(step,{status:'failed',ok:false,error:error.message,ended_at:new Date().toISOString()});save();}
    }
    if(!pushed)throw new Error('No media completed successful HTTP ingest; identification not triggered');
    await execute('clue_identify');
    if(pushed<3)throw new Error(`Only ${pushed}/3 media pushed; real successful articles were identified`);
  }else await execute('calendar_recommend');
  journal.status='success';
  }
}catch(error){journal.status='failed';journal.error=error.message;for(const step of journal.steps.filter(s=>s.status==='running'))Object.assign(step,{status:'failed',error:error.message,ended_at:new Date().toISOString()});process.exitCode=1;}
finally{journal.ended_at=new Date().toISOString();save();fs.unlinkSync(lock);console.log(JSON.stringify({run_id:journal.run_id,job,status:journal.status,error:journal.error}));}
