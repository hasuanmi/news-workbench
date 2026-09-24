import {NextRequest} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {supabase} from '@/lib/db';
import {getLocalTriggers} from '@/lib/local-triggers';
import {buildClueIdentifyFilter, buildClueIdentifyQuery, clueTimeRangeLabel, CLUE_IDENTIFY_TIME_RANGE} from '@/lib/clue-identify-config';
import fs from 'node:fs';
import path from 'node:path';
import { diagnoseScrapeRun, hasQueueConnectionFailure } from '@/lib/scrape-diagnosis';
import { summarizeSourceSteps } from '@/lib/source-run-summary';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function read(file:string){try{return JSON.parse(fs.readFileSync(path.join(process.cwd(),file),'utf8'));}catch{return null;}}
function readLogTail() {
  let fd: number | undefined;
  try {
    fd = fs.openSync(path.join(process.cwd(), 'logs/scheduler/media-fetch.log'), 'r');
    const size = fs.fstatSync(fd).size, length = Math.min(size, 131072);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } catch { return ''; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
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
  const sourceSummary = summarizeSourceSteps(mediaSteps);
  const diagnosis = diagnoseScrapeRun(scrape, scrape ? hasQueueConnectionFailure(readLogTail(), scrape) : false);
  const aiStep = (scrape?.steps ?? []).find((step: { name: string }) => step.name === 'clue_identify');
  const identificationTime = Date.parse(identification?.start_at ?? '');
  const sameRun = aiStep && identificationTime >= Date.parse(aiStep.started_at) &&
    (!aiStep.ended_at || identificationTime <= Date.parse(aiStep.ended_at));

  // 待识别文章：与实际 clue_identify 任务使用同一份过滤条件，单独统计真实总数
  // （count:'exact' + head:true，不受 limit 钳制，页面显示真实积压，例如“待识别文章 192 篇（近3天）”）
  const pendingFilter = await buildClueIdentifyFilter();
  const pendingWindowLabel = clueTimeRangeLabel(pendingFilter.timeRange ?? CLUE_IDENTIFY_TIME_RANGE);
  let pendingArticles: number | null = null;
  let pendingError: string | null = null;
  try {
    const { count, error } = (await buildClueIdentifyQuery(db, {
      count: true,
      mediaIds: pendingFilter.customMediaIds,
    })) as { count: number | null; error: { message: string } | null };
    if (error) throw new Error('待识别文章数量暂时无法读取');
    pendingArticles = count ?? 0;
  } catch (e) {
    pendingError = e instanceof Error ? e.message : String(e);
  }
  const pendingMediaScope = pendingFilter.customMediaIds?.length ?? 0;

  return Response.json({
    connectedMediaCount,
    scrape:{
      diagnosis,
      runId: scrape?.run_id ?? null,
      status:scrapeStatus,
      phase:scrape?.phase??null,
      startedAt:scrape?.started_at??null,
      endedAt:scrape?.ended_at??null,
      ...sourceSummary,
      error:scrape?.error??null,
      osResult:triggers.clue_identify?.lastResult??null,
    },
    pendingArticles,
    pendingWindow: pendingFilter.timeRange,
    pendingWindowLabel,
    pendingMediaScope,
    pendingError,
    identification: sameRun && identification?{runId:identification.run_id,startedAt:identification.start_at,executed:identification.executed,...identification.summary,processed:identification.processed,errors:identification.errors}:null,
  });
}
