import test from 'node:test';
import assert from 'node:assert/strict';
import { reportMatchesSource, sourceSnapshot } from './source-runner.mjs';

test('all five source fields and both execution IDs must match', () => {
  const source = sourceSnapshot({sourceId:'s',mediaId:'m',sourceType:'epaper',sourceUrl:'https://paper.example/',crawlMethod:'epaper'});
  const report = {...source,run_id:'r',attempt_id:'a'};
  assert.equal(reportMatchesSource(report,source,'r','a'), true);
  for (const field of ['source_id','media_id','source_url','source_type','crawl_method','run_id','attempt_id']) {
    assert.equal(reportMatchesSource({...report,[field]:'other'},source,'r','a'), false, field);
  }
  assert.equal(reportMatchesSource(null,source,'r','a'), false);
});
