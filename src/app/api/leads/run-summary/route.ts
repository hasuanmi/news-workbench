import {NextRequest} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {supabase} from '@/lib/db';
import {getLocalTriggers} from '@/lib/local-triggers';
import {buildClueIdentifyFilter, clueTimeRangeLabel, clueTimeRangeStart, CLUE_IDENTIFY_TIME_RANGE} from '@/lib/clue-identify-config';
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
  const mediaSteps=(scrape?.steps??[]).filter((s:{name:string})=>s.name==='media_fetch');
  // 监测媒体总数：仅统计开启线索监测的媒体（精简摘要卡所需，不再展开 135 家名单）
  const { count: connectedCount, error: monitorError } = await db.from('media').select('id',{count:'exact',head:true}).eq('monitor_clue', true);
  const connectedMediaCount = monitorError ? 0 : (connectedCount ?? 0);
  const successfulMedia=mediaSteps.filter((s:{status?:string})=>s.status==='success').length;
  const failedMedia=mediaSteps.filter((s:{status?:string})=>s.status==='failed').length;

  // 待识别文章：与实际 clue_identify 任务使用同一份过滤条件
  // （timeRange=3d、媒体范围=monitor_clue 名单、is_test=false、clue_processed=false、limit 100，与 runCluePipeline 完全一致）
  const pendingFilter = await buildClueIdentifyFilter();
  const pendingWindowLabel = clueTimeRangeLabel(pendingFilter.timeRange ?? CLUE_IDENTIFY_TIME_RANGE);
  const pendingStart = clueTimeRangeStart(pendingFilter.timeRange ?? CLUE_IDENTIFY_TIME_RANGE);
  let pendingArticles: number | null = null;
  let pendingError: string | null = null;
  try {
    let q = db
      .from('article')
      .select('id')
      .eq('is_test', false)
      .eq('clue_processed', false)
      .order('publish_time', { ascending: false })
      .limit(100);
    if (pendingStart) q = q.gte('publish_time', pendingStart.toISOString());
    if (pendingFilter.customMediaIds?.length) q = q.in('media_id', pendingFilter.customMediaIds);
    const { data: pendingRows, error: pErr } = await q;
    if (pErr) pendingError = pErr.message;
    else pendingArticles = pendingRows?.length ?? 0;
  } catch (e) {
    pendingError = e instanceof Error ? e.message : String(e);
  }
  const pendingMediaScope = pendingFilter.customMediaIds?.length ?? 0;

  return Response.json({
    connectedMediaCount,
    scrape:{
      status:scrapeStatus,
      phase:scrape?.phase??null,
      startedAt:scrape?.started_at??null,
      endedAt:scrape?.ended_at??null,
      articles:mediaSteps.reduce((n:number,s:{articles?:number})=>n+(s.articles??0),0),
      successfulMedia,
      failedMedia,
      error:scrape?.error??null,
      osResult:triggers.clue_identify?.lastResult??null,
    },
    pendingArticles,
    pendingWindow: pendingFilter.timeRange,
    pendingWindowLabel,
    pendingMediaScope,
    pendingError,
    identification: identification?{runId:identification.run_id,startedAt:identification.start_at,executed:identification.executed,...identification.summary,processed:identification.processed,errors:identification.errors}:null,
  });
}
