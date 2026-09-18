// Existing persistence schema only. Default is read-only; --apply executes approved B.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
for (const file of ['.env.local','.env']) if(fs.existsSync(file)) dotenv.config({path:file,quiet:true});
const runId=randomUUID();
const folder=path.join('logs','business-schema',runId);
fs.mkdirSync(folder,{recursive:true});
const report={run_id:runId,started_at:new Date().toISOString(),mode:process.argv.includes('--apply')?'apply':'dry-run',schemaApplied:false};
const save=()=>fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(report,null,2));
const snapshot=(name,data)=>fs.writeFileSync(path.join(folder,`${name}.json`),JSON.stringify(data,null,2));
const connectionString=process.env.DATABASE_URL||process.env.SUPABASE_DB_URL||process.env.PGDATABASE_URL;
let client;
try {
  if(!connectionString) throw new Error('Missing DATABASE_URL / SUPABASE_DB_URL; REST credentials cannot execute SQL');
  const expected=new URL(process.env.SUPABASE_URL||process.env.COZE_SUPABASE_URL).hostname.split('.')[0];
  const uri=new URL(connectionString);
  if(uri.hostname!==`db.${expected}.supabase.co` && !(uri.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(uri.username).endsWith(`.${expected}`))) throw new Error('SQL connection identity does not match configured Supabase project');
  client=new pg.Client({connectionString,ssl:{rejectUnauthorized:true,...(process.env.PGSSLROOTCERT?{ca:fs.readFileSync(process.env.PGSSLROOTCERT,'utf8')}:{})},connectionTimeoutMillis:15000,application_name:'news-workbench-business-b'});
  await client.connect();
  report.identity=(await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  const columns=(await client.query(`SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN
    ('news_clue','daily_review','news_clue_article','review_draft','daily_review_revision') ORDER BY table_name,ordinal_position`)).rows;
  snapshot('schema-before',columns);
  for(const table of ['news_clue','daily_review']) {
    const id=columns.find(row=>row.table_name===table && row.column_name==='id');
    if(id?.data_type!=='character varying'||id.character_maximum_length!==36) throw new Error(`Preflight: ${table}.id must be varchar(36)`);
  }
  const counts=(await client.query('SELECT (SELECT count(*) FROM public.news_clue) AS clues,(SELECT count(*) FROM public.daily_review) AS reviews')).rows[0];
  report.existingCountsBefore=counts;
  const newTables=['news_clue_article','review_draft','daily_review_revision'];
  report.preflight={existingNewTables:newTables.filter(table=>columns.some(row=>row.table_name===table)),recentArticleAtMissing:!columns.some(row=>row.table_name==='news_clue'&&row.column_name==='recent_article_at')};
  const recent=columns.find(row=>row.table_name==='news_clue'&&row.column_name==='recent_article_at');
  if(recent && recent.data_type!=='timestamp with time zone') throw new Error('Existing recent_article_at has incompatible type');
  if(report.preflight.existingNewTables.length) throw new Error('Schema changed: inspect existing persistence tables before applying B; never drop or overwrite');
  const sql=fs.readFileSync('docs/db-review/business-schema.proposed.sql','utf8');
  report.sqlHash=createHash('sha256').update(sql).digest('hex');
  save();
  if(report.mode==='apply') {
    report.commitAttempted=true;save();
    await client.query(sql);
    report.schemaApplied=true;save();
    snapshot('schema-after',(await client.query(`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('news_clue','news_clue_article','review_draft','daily_review_revision') ORDER BY table_name,ordinal_position`)).rows);
    report.newTableCounts=(await client.query('SELECT (SELECT count(*) FROM public.news_clue_article) AS links,(SELECT count(*) FROM public.review_draft) AS drafts,(SELECT count(*) FROM public.daily_review_revision) AS revisions')).rows[0];
    report.status='PASS';
  } else report.status='DRY_RUN';
} catch(error) {
  if(client) await client.query('ROLLBACK').catch(()=>{});
  report.status=report.schemaApplied?'POSTCHECK_FAILED':report.commitAttempted?'COMMIT_STATUS_UNCERTAIN':'BLOCKED';
  // Do not persist pg errors or URLs; they can contain credentials.
  report.error=String(error.message).startsWith('Missing ')||String(error.message).startsWith('Preflight:')||String(error.message).startsWith('Schema changed:')||String(error.message).startsWith('Existing ')||String(error.message).startsWith('SQL connection identity')?error.message:'SQL connection/execution failed; inspect database state before retry';
  process.exitCode=2;
} finally {if(client) await client.end().catch(()=>{});save();}
console.log(JSON.stringify({...report,manifest:path.join(folder,'manifest.json')}));
