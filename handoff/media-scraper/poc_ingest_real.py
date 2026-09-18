"""One medium only: real public HTML -> article-v1 -> HTTP; no business AI or Supabase."""
import asyncio, json, sys, hashlib
from dataclasses import asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from app.core.ingest_client import IngestClient
from app.scrapers.registry import get_scrapers
from app.core.worker import _filter_stubs

async def main():
    media=sys.argv[1];limit=int(sys.argv[2]) if len(sys.argv)>2 else 5
    client=IngestClient();queue=await client.get_queue()
    names={'广州日报':'广州日报报业集团','南方日报':'南方日报','南方都市报':'南方都市报'}
    source=next((s for s in queue if (s.get('media_name') or s.get('mediaName'))==names[media] and (s.get('source_type') or s.get('sourceType'))=='website'),None)
    if not source:raise RuntimeError('No matching website source in ingest queue')
    source_id=source.get('source_id') or source.get('sourceId')
    scraper=get_scrapers(media=media)[0][1]
    report={'media':media,'source_id':source_id,'started_at':datetime.now(timezone.utc).isoformat(),'attempted':0,'articles':[],'failures':[]}
    payload=[]
    try: stubs=_filter_stubs(await scraper.list_articles())
    except Exception as e:stubs=[];report['failures'].append({'stage':'list','reason':str(e)})
    report['discovered']=len(stubs)
    for stub in stubs[:limit]:
        report['attempted']+=1
        try:
            art=await scraper.fetch_detail(stub['url'])
            if not art.title or not art.content or len(art.content)<50:raise ValueError('Missing title or substantive body')
            raw=asdict(art);report['articles'].append(raw)
            stamp=None
            if art.publish_time and not art.publish_time.startswith('1970'):
                stamp=datetime.fromisoformat(art.publish_time).replace(tzinfo=timezone(timedelta(hours=8))).isoformat()
            payload.append({'source_id':source_id,'title':art.title,'url':art.url,'external_id':'real-'+hashlib.sha256(art.url.encode()).hexdigest()[:32],'publish_time':stamp,'content':art.content,'word_count':art.word_count,'column_name':art.column_name,'edition_no':art.edition_no,'edition_name':art.edition_name,'source_type':'website','scrape_method':'html','crawl_time':datetime.now(timezone.utc).isoformat()})
        except Exception as e:report['failures'].append({'stage':'detail','url':stub['url'],'reason':str(e)})
        await asyncio.sleep(1)
    if payload:
        if '--enrichment' in sys.argv:
            # Real source text only: prove that a later full fetch enriches the same URL.
            # Never downgrade existing full bodies: the main ingest enrichment guard owns this.
            item=payload[-1]
            partial={**item,'content':item['content'][:100],'word_count':len(item['content'][:100])}
            report['partial_ingest']=await client.push_articles([{'source_id':source_id,'success':True,'articles':[partial]}])
        results=[{'source_id':source_id,'success':True,'articles':payload}]
        report['ingest']=await client.push_articles(results)
        if '--scheduled' not in sys.argv:
            report['repeat_ingest']=await client.push_articles(results)
    report['successful_bodies']=len(payload);report['failed']=len(report['failures'])
    directory=Path('logs/real-poc');directory.mkdir(parents=True,exist_ok=True)
    filename=directory/f"{media}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    filename.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='articles'},ensure_ascii=False,indent=2));print(str(filename))

if __name__=='__main__':asyncio.run(main())
