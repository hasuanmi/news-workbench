// Correct observed, unsupported attribution using the existing full-regeneration HTTP workflow.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const base='http://localhost:3001';
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.AUDIT_PASSWORD})});
const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Login failed');
const headers={Cookie:cookie,'Content-Type':'application/json'};
const reviews=await(await fetch(base+'/api/review',{headers})).json();const review=reviews.reviews.find(r=>r.report_date==='2026-09-17');
const input='请重新生成完整四区块评报并纠正已发现的无依据表述：广州日报“有力有序协调推进全面依法治国任务落实”没有取得原始署名证据，删除“自采”“自采通稿”“已有原创增量”等归因，改为“刊载同题稿，原创性质未核实”。该日记录的00:00仅是旧解析日期精度不足，两家网页发表日期均为北京时间9月17日，删除“早约一天”等时间先后结论。未取得原始署名、版面、采编成本证据，不将其他稿件断言为自采或原创，不推断纸报排面，不断言采集成本可控。正文字符数包含提取格式，不用字数差异推断报道深度或呈现差异。两篇具有“新华社北京9月15日电”的金砖特稿保留为共同背景，不参与原创比较。同行有无只指本轮库内采集样本。保留已提供的真实标题与URL，不增加媒体、链接、数据或事实。输出完整四区块和完整连贯最终评报，不只回答纠错要求，不使用Markdown裸标记。';
const response=await fetch(`${base}/api/review/${review.id}/followup`,{method:'POST',headers,body:JSON.stringify({input}),signal:AbortSignal.timeout(180000)});
const raw=await response.text();const events=raw.split('\n').filter(l=>l.startsWith('data: ')).flatMap(l=>{try{return[JSON.parse(l.slice(6))];}catch{return[];}});
const after=await(await fetch(`${base}/api/review/${review.id}`,{headers})).json();
const final=after.review.final_summary;
const journal={run_id:randomUUID(),http:response.status,phases:[...new Set(events.map(e=>e.phase).filter(Boolean))],error:events.find(e=>e.error)?.error,beforeVersion:review.version,afterVersion:after.review.version,chars:final.length,unsupportedClaim:/自采通稿|早约一天|早一天|采集成本可控/.test(final),saved:events.some(e=>e.phase==='saved')};
fs.writeFileSync('logs/real-review-correction.json',JSON.stringify(journal,null,2));console.log(JSON.stringify(journal));
