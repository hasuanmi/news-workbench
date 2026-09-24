import fs from 'node:fs';import assert from 'node:assert/strict';import dotenv from 'dotenv';import pg from 'pg';
for(const p of ['.env.local','.env'])if(fs.existsSync(p))dotenv.config({path:p,quiet:true});
const apply=process.argv.includes('--apply');const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const preview=read('docs/source-dedup-execution-preview-2026-09-24.json');const snapshot=read('logs/scheduler/source-dedup-snapshot-2026-09-24.json');
const duplicates=new Map(preview.groups.flatMap(g=>g.disable_source_ids.map(id=>[id,g.keep_source_id])));
const latest=new Map();for(const file of preview.evidence_files){const run=read('logs/scheduler/'+file);for(const s of run.steps||run.cases||[]){if(!s.source_id)continue;const t=s.ended_at||run.ended_at;if(!latest.has(s.source_id)||t>latest.get(s.source_id).at)latest.set(s.source_id,{...s,at:t,run_id:run.run_id});}}
const connectionString=process.env.DATABASE_URL||process.env.SUPABASE_DB_URL;const expected=new URL(process.env.SUPABASE_URL||process.env.COZE_SUPABASE_URL).hostname.split('.')[0];const uri=new URL(connectionString);
if(uri.hostname!==`db.${expected}.supabase.co`&&!(uri.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(uri.username).endsWith(`.${expected}`)))throw Error('DB identity mismatch');
const db=new pg.Client({connectionString,ssl:{rejectUnauthorized:true,...(process.env.PGSSLROOTCERT?{ca:fs.readFileSync(process.env.PGSSLROOTCERT,'utf8')}:{})},connectionTimeoutMillis:15000});
const report={mode:apply?'apply':'preview',started_at:new Date().toISOString(),rows:[]};
try{await db.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");if(apply)await db.query('LOCK TABLE public.media_source IN SHARE ROW EXCLUSIVE MODE');
const sources=(await db.query('SELECT * FROM public.media_source ORDER BY id')).rows;
const articleFingerprint=async()=> (await db.query("SELECT count(*)::int AS count, md5(string_agg(id || ':' || coalesce(source_id,''), ',' ORDER BY id)) AS association_hash FROM public.article")).rows[0];
const before=await articleFingerprint();assert.equal(sources.length,snapshot.sources.length,'source inventory changed');
for(const s of sources){const old=snapshot.sources.find(x=>x.id===s.id);assert(old);for(const k of ['media_id','source_url','source_type','crawl_method','enabled'])assert.equal(s[k],old[k],`snapshot changed ${s.id} ${k}`);
let status,reason,verified=null;const run=latest.get(s.id);
if(duplicates.has(s.id)){status='duplicate';reason=`同媒体、同规范化 URL、同 source_type 重复；保留 ${duplicates.get(s.id)}`;}
else if(!s.enabled){status='manual_disabled';reason='保留原人工停用状态';}
else if(run?.ok===true){status='active';verified=run.at;reason=`逐源真实抓取与入库成功；run ${run.run_id}`;}
else {status='needs_fix';reason=run?`逐源抓取失败：${run.error_code||run.error||'unknown'}；run ${run.run_id}`:s.crawl_method==='manual'?'当前为 manual 抓取配置，未通过自动采集验证':s.id==='0407a3e1-3357-4131-9ddf-867f2b0a450e'?'电子报绑定测试通过，但内容验收未通过，等待修复日期/模板解析':'尚无当前逐源真实抓取成功证据，待验证/修复';}
report.rows.push({source_id:s.id,media_id:s.media_id,source_type:s.source_type,source_status:status,enabled:status==='active',status_reason:reason,duplicate_of:duplicates.get(s.id)||null,verified_at:verified});}
const counts=Object.fromEntries(['active','needs_fix','duplicate','manual_disabled'].map(k=>[k,report.rows.filter(s=>s.source_status===k).length]));report.summary={...counts,total:sources.length,retained_media:new Set(sources.map(s=>s.media_id)).size,active_media:new Set(report.rows.filter(s=>s.enabled).map(s=>s.media_id)).size,active_website:report.rows.filter(s=>s.enabled&&s.source_type==='website').length,active_epaper:report.rows.filter(s=>s.enabled&&s.source_type==='epaper').length,articles:before.count};
const active=report.rows.filter(s=>s.enabled);const keys=active.map(s=>{const src=sources.find(x=>x.id===s.source_id);return JSON.stringify([src.media_id,new URL(src.source_url.trim()).href,src.source_type]);});assert.equal(new Set(keys).size,keys.length,'duplicate active sources');assert.equal(counts.duplicate,101);
if(apply){const backup='logs/scheduler/source-lifecycle-backup-2026-09-24.json';if(fs.existsSync(backup))throw Error('Backup exists; inspect before rerun');fs.writeFileSync(backup,JSON.stringify({sources,articles:before},null,2));
await db.query(fs.readFileSync('sql/0009_source_lifecycle.sql','utf8'));
for(const s of report.rows)await db.query(`UPDATE public.media_source SET source_status=$2,enabled=$3,status_reason=$4,duplicate_of=$5,verified_at=$6,updated_at=now() WHERE id=$1`,[s.source_id,s.source_status,s.enabled,s.status_reason,s.duplicate_of,s.verified_at]);
await db.query(`ALTER TABLE public.media_source ADD CONSTRAINT media_source_lifecycle_valid CHECK(source_status IN ('active','needs_fix','duplicate','manual_disabled')), ADD CONSTRAINT media_source_lifecycle_enabled CHECK(enabled=(source_status='active')), ADD CONSTRAINT media_source_active_verified CHECK(source_status<>'active' OR (verified_at IS NOT NULL AND duplicate_of IS NULL AND ((source_type='website' AND crawl_method='html') OR (source_type='epaper' AND crawl_method='epaper')))), ADD CONSTRAINT media_source_duplicate_target CHECK(source_status<>'duplicate' OR (duplicate_of IS NOT NULL AND duplicate_of<>id))`);
assert.deepEqual(await articleFingerprint(),before,'article associations changed');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.media_source')).rows[0].n,sources.length);
await db.query("NOTIFY pgrst, 'reload schema'");await db.query('COMMIT');report.applied=true;
}else await db.query('ROLLBACK');
report.article_associations_unchanged=true;fs.writeFileSync('docs/source-lifecycle-'+(apply?'applied':'preview')+'-2026-09-24.json',JSON.stringify(report,null,2));console.log(JSON.stringify({mode:report.mode,applied:report.applied||false,summary:report.summary,article_associations_unchanged:true}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await db.end();}
