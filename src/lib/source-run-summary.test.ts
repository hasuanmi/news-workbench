import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSourceSteps } from './source-run-summary';

test('source IDs deduplicate while multiple sources remain one medium', () => {
  const base = {name: 'media_fetch', media_id: 'm1', source_type: 'website', crawl_method: 'html'};
  const result = summarizeSourceSteps([
    {...base, source_id: 's1', status: 'failed'},
    {...base, source_id: 's1', status: 'success', articles: 2},
    {...base, source_id: 's2', status: 'failed'},
  ]);
  assert.equal(result.successfulSources, 1);
  assert.equal(result.failedSources, 1);
  assert.equal(result.successfulMedia, 1);
  assert.equal(result.articles, 2);
  assert.deepEqual(result.sources.map(s => s.source_id), ['s1', 's2']);
});

test('legacy tasks are not reported as verified source coverage', () => {
  const result = summarizeSourceSteps([{name: 'media_fetch', media: 'A', status: 'success'}]);
  assert.equal(result.sourceIdentityVerified, false);
  assert.equal(result.successfulSources, null);
  assert.equal(result.successfulTasks, 1);
});
