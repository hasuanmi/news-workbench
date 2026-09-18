// Reversible test labels only; preserve all existing rows, with a run journal.
import fs from 'node:fs';import {randomUUID} from 'node:crypto';import dotenv from 'dotenv';import pg from 'pg';
for(const p of ['.env.local','.env'])if(fs.existsSync(p))dotenv.config({path:p,quiet:true});
if(!process.argv.includes('--apply')){console.log('Read the existing run journals first. Explicit --apply is required; this script never deletes data.');process.exit(0);}
const run=randomUUID();const dir=`logs/test-isolation/${run}`;fs.mkdirSync(dir,{recursive:true});
const uri=new URL(process.env.DATABASE_URL);if(decodeURIComponent(uri.username)!=='postgres.reusdpelytqggjyhfsyh')throw new Error('Database identity mismatch');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(process.env.PGSSLROOTCERT,'utf8')}});
await client.connect();try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
for(const table of ['article','news_clue','review_draft','daily_review'])await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS test_run_id varchar(64)`);
const before={};for(const table of ['article','news_clue','review_draft','daily_review'])before[table]=(await client.query(`SELECT id,is_test,test_run_id FROM public.${table}`)).rows;
fs.writeFileSync(`${dir}/labels-before.json`,JSON.stringify(before,null,2));
const out={run_id:run};
out.articles=(await client.query(`UPDATE public.article SET is_test=true,test_run_id=COALESCE(test_run_id,$1) WHERE is_test=false AND (url ~* '^https?://([^/]+\\.)?example\\.test[/:]' OR url ~* '^https?://mock-ingest\\.local[/:]' OR title LIKE '%Mock验收%' OR external_id LIKE 'mock-%' OR external_id LIKE 'clue-%') RETURNING id`,[run])).rows;
out.clues=(await client.query(`UPDATE public.news_clue c SET is_test=true,test_run_id=COALESCE(c.test_run_id,$1) WHERE c.is_test=false AND (EXISTS(SELECT 1 FROM public.article a WHERE a.id=c.article_id AND a.is_test) OR EXISTS(SELECT 1 FROM public.news_clue_article l JOIN public.article a ON a.id=l.article_id WHERE l.clue_id=c.id AND a.is_test)) RETURNING c.id`,[run])).rows;
for(const table of ['review_draft','daily_review'])out[table]=(await client.query(`UPDATE public.${table} t SET is_test=true,test_run_id=COALESCE(t.test_run_id,$1) WHERE t.is_test=false AND (EXISTS(SELECT 1 FROM public.article a WHERE a.is_test AND position(a.id IN to_jsonb(t)::text)>0)) RETURNING id`,[run])).rows;
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify({...out,status:'COMMIT_PENDING'},null,2));await client.query("NOTIFY pgrst,'reload schema'");await client.query('COMMIT');fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify({...out,status:'PASS'},null,2));console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k,v])=>[k,Array.isArray(v)?v.length:v]))));
}catch(e){await client.query('ROLLBACK');console.log('Test isolation failed; transaction rolled back');process.exitCode=1;}finally{await client.end();}
