import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planHistoryImport } from './plan-history-calendar.mjs';
const history = (id, patch = {}) => ({ id, node_name:'测试纪念日', year:2026, event_date:'2026-09-23',
  date_status:'confirmed', region:'guangzhou', category_id:'cat', enabled:true, ...patch });
test('Batch duplicates share one event; date, region, category differences remain distinct', () => {
  const result = planHistoryImport([history('1'), history('2', {node_name:'测试 纪念日'}),
    history('3',{event_date:'2026-09-24'}),history('4',{region:'guangdong'}),history('5',{category_id:null})],[],[]);
  assert.equal(result.summary.counts.insert,4); assert.equal(result.summary.counts.link_batch_duplicate,1);
});
test('Strong reference preserves edited, disabled and soft-deleted events', () => {
  for (const state of [{enabled:false},{enabled:true,deleted_at:'2026-09-17T00:00:00Z'}]) {
    const event = {id:'existing',event_name:'编辑后的不同名字',event_date:'2026-10-01',...state};
    const result = planHistoryImport([history('1')],[event],[],[{history_node_id:'1',calendar_event_id:'existing'}]);
    assert.equal(result.plan[0].action,'link_existing_reference'); assert.equal(result.summary.counts.insert,undefined);
  }
});
test('Multiple matches and duplicate undated names are held, never arbitrarily merged', () => {
  const events = ['a','b'].map(id=>({id,event_name:'测试纪念日',event_type:'dynamic',event_date:'2026-09-23',
    date_status:'confirmed',region:'guangzhou',category_id:'cat'}));
  assert.equal(planHistoryImport([history('1')],events,[]).plan[0].action,'hold_ambiguous_exact');
  const undated = [history('1',{date_status:'unknown',event_date:null}),history('2',{date_status:'unknown',event_date:null})];
  assert.equal(planHistoryImport(undated,[],[]).summary.counts.hold_ambiguous_undated,2);
});
test('Disabled histories, invalid dates and missing referenced event are not imported', () => {
  const result = planHistoryImport([history('1',{enabled:false}),history('2',{event_date:'2026-02-31'}),history('3')],[],[],
    [{history_node_id:'3',calendar_event_id:'missing'}]);
  assert.deepEqual(result.plan.map(row=>row.action),['skip_disabled','hold_invalid','hold_dangling_reference']);
});
test('Approved snapshot: 108 new events and 12 in the 30-day window', () => {
  const read = name => JSON.parse(fs.readFileSync(`logs/takeover-baseline/${name}-readonly.json`,'utf8'));
  if (!fs.existsSync('logs/takeover-baseline/calendar-readonly.json')) return;
  const result = planHistoryImport(read('calendar_history_node'),read('calendar'),read('calendar_candidate'));
  assert.equal(result.summary.counts.insert,108); assert.equal(result.summary.proposedNewEventsInCurrent30Days,12);
});
