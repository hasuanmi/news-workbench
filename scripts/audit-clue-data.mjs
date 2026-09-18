// Read-only diagnosis; does not run scraping, AI, or alter processed flags.
import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
for(const file of ['.env.local','.env'])dotenv.config({path:file,quiet:true});
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(process.env.PGSSLROOTCERT,'utf8')},connectionTimeoutMillis:15000});
await client.connect();await client.query('BEGIN READ ONLY');
async function all(table,select='*'){return (await client.query(`SELECT ${select} FROM public.${table}`)).rows;}
const articles=await all('article','id,title,url,content,media_id,source_id,publish_time,created_at,clue_processed,is_test');
const sources=await all('media_source');const media=await all('media','id,media_name,enabled');
const logs={data:(await client.query("SELECT * FROM public.task_log WHERE workflow_name='clue_identify' ORDER BY start_time DESC LIMIT 12")).rows};
const config={data:(await client.query("SELECT value FROM public.app_config WHERE key='clue.identify_rules'")).rows[0]};
await client.query('COMMIT');await client.end();
const now=new Date();const isReal=a=>a.is_test===false&&!/example\.test|mock-ingest\.local/i.test(a.url||'');
const real=articles.filter(isReal);const byMedia=media.map(m=>{const rows=real.filter(a=>a.media_id===m.id);const result={name:m.media_name,enabled:m.enabled,total:rows.length};for(const [label,hours]of [['24h',24],['3d',72],['7d',168]]){const recent=rows.filter(a=>new Date(a.publish_time)>=new Date(+now-hours*3600000));result[label]=recent.length;result[`${label}Unprocessed`]=recent.filter(a=>a.clue_processed===false).length;}return result;}).filter(m=>m.total).sort((a,b)=>b['7d']-a['7d']);
const windows={};for(const [label,hours]of [['24h',24],['3d',72],['7d',168]]){const cutoff=new Date(+now-hours*3600000);const inWindow=articles.filter(a=>new Date(a.publish_time)>=cutoff);const realWindow=inWindow.filter(isReal);const unprocessed=realWindow.filter(a=>a.clue_processed===false);windows[label]={start:cutoff.toISOString(),all:inWindow.length,real:realWindow.length,test:inWindow.filter(a=>a.is_test===true).length,processed:realWindow.filter(a=>a.clue_processed===true).length,unprocessed:unprocessed.length,afterLimit:Math.min(100,unprocessed.length),mediaCount:new Set(unprocessed.map(a=>a.media_id)).size,shortBodyUnder100:unprocessed.filter(a=>(a.content||'').length<100).length,missingTitleOrUrl:unprocessed.filter(a=>!a.title||!a.url).length,disabledSourceArticles:unprocessed.filter(a=>sources.find(s=>s.id===a.source_id)?.enabled===false).length,realOutsideWindow:real.length-realWindow.length};}
const journal={checkedAt:now.toISOString(),sources:{total:sources.length,enabled:sources.filter(s=>s.enabled===true).length,disabled:sources.filter(s=>s.enabled===false).length,byMedia:media.map(m=>({name:m.media_name,total:sources.filter(s=>s.media_id===m.id).length,enabled:sources.filter(s=>s.media_id===m.id&&s.enabled===true).length})).filter(m=>m.total)},articles:{total:articles.length,real:real.length,test:articles.filter(a=>a.is_test===true).length},windows,byMedia,latestLogs:logs.data,defaultRules:config.data?.value};
fs.mkdirSync('logs/clue-audit',{recursive:true});fs.writeFileSync('logs/clue-audit/latest.json',JSON.stringify(journal,null,2));console.log(JSON.stringify(journal,null,2));
