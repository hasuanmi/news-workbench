import {NextRequest} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {supabase} from '@/lib/db';
import {getLocalTriggers} from '@/lib/local-triggers';
import fs from 'node:fs';
import path from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function read(file:string){try{return JSON.parse(fs.readFileSync(path.join(process.cwd(),file),'utf8'));}catch{return null;}}
export async function GET(req:NextRequest){
  const auth=await requireAdmin(req);if('error' in auth)return auth.error;
  const scrape=read('logs/scheduler/media_then_clues-latest.json');
  const identification=read('logs/clue-runs/latest.json');
  const triggers=await getLocalTriggers();
  let scrapeStatus=scrape?.status??'unknown';
  if(scrape&&!scrape.ended_at){let alive=false;try{if(scrape.pid){process.kill(scrape.pid,0);alive=true;}}catch{}if(!alive&&triggers.clue_identify?.state!=='Running')scrapeStatus='interrupted';}
  const db=supabase();
  const {count,error}=await db.from('article').select('id',{count:'exact',head:true}).eq('is_test',false).eq('clue_processed',false).gte('publish_time',new Date(Date.now()-86400000).toISOString());
  const mediaSteps=(scrape?.steps??[]).filter((s:{name:string})=>s.name==='media_fetch');
  const { data: monitorMedia, error: monitorError } = await db.from('media').select('id, media_name').eq('monitor_clue', true);
  const connectedMediaCount = monitorError ? 0 : (monitorMedia?.length ?? 0);
  const mediaNames = monitorError ? [] : (monitorMedia ?? []).map((m: {media_name?: string}) => m.media_name).filter((n): n is string => !!n);
  return Response.json({connectedMediaCount,mediaNames,scrape:{status:scrapeStatus,phase:scrape?.phase??null,startedAt:scrape?.started_at??null,endedAt:scrape?.ended_at??null,articles:mediaSteps.reduce((n:number,s:{articles?:number})=>n+(s.articles??0),0),successfulMedia:mediaSteps.filter((s:{ok?:boolean})=>s.ok).length,error:scrape?.error??null,osResult:triggers.clue_identify?.lastResult??null},pendingArticles24h:error?null:count,pendingError:error?.message??null,monitorError:monitorError?.message??null,identification:identification?{runId:identification.run_id,startedAt:identification.started_at,executed:identification.executed,...identification.summary,processed:identification.processed,errors:identification.errors}:null});
}
