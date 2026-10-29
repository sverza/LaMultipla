import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {syntheticReferenceExploration} from './fixtures/reference-exploration.mjs';
import {exploreInternational,validateReferenceBindings,validateReferenceCalendar} from '../scripts/lib/reference-odds/exploratory.mjs';
import {hashValue,hashBytes} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
async function vector(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lm-reference-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return syntheticReferenceExploration(root);}
const run=f=>exploreInternational(f.input());
test('Reference E2E: real adapter and frozen-grid projections produce only a synthetic international shortlist',async t=>{
 const f=await vector(t),before=structuredClone(f.input()),a=run(f),b=run(f);
 assert.deepEqual(a,b);assert.deepEqual(f.input(),before);assert.equal(a.state,'INTERNATIONAL_EXPLORATORY_SHORTLIST');
 assert.equal(a.counts.referenceSelections,12);assert.ok(a.combinations.length>0);assert.equal(a.universe.expectedFixtures,10);
 assert.equal(a.wholeRoundEvaluated,false);assert.equal(a.unassessedFixtureIds.length,7);assert.equal(a.italianTicket.blocksReferenceDiagnostics,false);
 for(const c of a.combinations){assert.equal(new Set(c.fixtureIds).size,c.fixtureIds.length);assert.equal(c.actualCombinedPrice,null);
  assert.equal(c.jointProbability,null);assert.equal(c.verifiedCombinedEV,null);assert.equal(c.admissible,false);assert.equal(c.actualStakeEUR,0);}
 assert.ok(a.records.every(r=>r.models.dc.probability!==null&&r.models.bivariate.probability!==null));
 assert.ok(a.records.every(r=>r.models.dc.model.id==='dc-v2'&&r.models.bivariate.model.id==='bivariate-v2'
  &&r.models.dc.model.version===f.journal.modelVersion));
 assert.ok(a.records.every(r=>r.quoteProvenance.rawReference.ref.includes('SYNTHETIC')));
});
test('Reference universe: nine of ten with the missing fixture inside the slot cannot yield a complete analysis',async t=>{
 const f=await vector(t);f.data.matches.shift();const r=run(f);
 assert.equal(r.universe.presentExpectedFixtures,9);assert.equal(r.universe.missingFixtureIds.length,1);assert.equal(r.state,'ANALYSIS_INCOMPLETE');
 assert.equal(r.counts.referenceSelections,0);assert.equal(r.counts.expectedSlotBoards,6);assert.equal(r.counts.observedSlotBoards,4);
});
test('Reference slot: an unobserved outside-slot fixture stays in the denominator without masquerading as a full-round evaluation',async t=>{
 const f=await vector(t);f.data.matches.pop();const r=run(f);assert.equal(r.universe.expectedFixtures,10);assert.equal(r.universe.complete,false);
 assert.equal(r.state,'INTERNATIONAL_EXPLORATORY_SHORTLIST');assert.equal(r.wholeRoundEvaluated,false);assert.equal(r.roundAnalysisState,'ROUND_NOT_FULLY_EVALUATED');
});
test('Reference data: incomplete BTTS and complete suspended totals preserve different diagnostic reasons',async t=>{
 const f=await vector(t);f.data.matches[0].quotes.shift();f.data.matches[1].quotes[2].suspended=true;const r=run(f);
 const incomplete=r.boardStates.find(b=>b.fixtureId===f.manifest.events[0].fixtureId&&b.family==='BTTS');
 const closed=r.boardStates.find(b=>b.fixtureId===f.manifest.events[1].fixtureId&&b.family==='TOTAL_GOALS');
 assert.equal(incomplete.structuralCompleteness,'INCOMPLETE');assert.ok(incomplete.reasons.includes('BOARD_STRUCTURALLY_INCOMPLETE'));
 assert.equal(closed.structuralCompleteness,'COMPLETE');assert.ok(closed.reasons.includes('SELECTION_SUSPENDED'));
 assert.ok(!closed.reasons.includes('BOARD_STRUCTURALLY_INCOMPLETE'));assert.equal(r.state,'ANALYSIS_INCOMPLETE');
});
test('Reference identities: home/away and kickoff conflicts cannot join an otherwise complete quote board',async t=>{
 const f=await vector(t);[f.data.matches[0].home,f.data.matches[0].away]=[f.data.matches[0].away,f.data.matches[0].home];
 const r=run(f);assert.equal(r.universe.incoherentFixtureIds.length,1);assert.equal(r.state,'ANALYSIS_INCOMPLETE');assert.equal(r.combinations.length,0);
 const b=structuredClone(f.bindings);b.events[0].home='SYNTHETIC MISMATCH';assert.throws(()=>validateReferenceBindings(f.manifest,b),/IDENTITY/);
});
test('Reference timeline: stale quotes, stale forecast and cutoff slots remain excluded, never NO_BET',async t=>{
 const f=await vector(t);const r=exploreInternational(f.input('2026-10-30T13:21:00.000Z'));
 assert.equal(r.state,'ANALYSIS_INCOMPLETE');assert.equal(r.combinations.length,0);assert.ok(r.exclusions.includes('QUOTE_OBSERVATION_EXPIRED'));
 const q=exploreInternational(f.input('2026-10-31T13:21:00.000Z'));assert.ok(q.exclusions.includes('FORECAST_EXPIRED'));
});
test('Reference integrity: altered boards, unknown source kind, incomplete forecast and forged slot are rejected',async t=>{
 const f=await vector(t),i=f.input();i.boards.boards[0].outcomes[0].price=99;assert.throws(()=>exploreInternational(i),/CONTRACT/);
 assert.throws(()=>exploreInternational({...f.input(),sourceKind:'VERIFIED_LOCAL_FREEZE_ARCHIVE'}),/SOURCE_KIND/);
 assert.throws(()=>exploreInternational({...f.input(),slot:{id:'fake',fixtureIds:['unknown']}}),/SLOT/);
 const j=structuredClone(f.journal);j.entries.pop();assert.throws(()=>exploreInternational({...f.input(),journal:j}));
});
test('Reference Frechet: exact lower zero survives; no independence probability or verified combo EV',async t=>{
 const f=await vector(t),r=run(f);assert.ok(r.combinations.some(c=>c.frechetBounds[0]===0));
 for(const c of r.combinations){const p=c.selectionIds.map(id=>r.records.find(x=>x.id===id).models.dc.probability);
  assert.deepEqual(c.frechetBounds,[Math.max(0,p.reduce((s,v)=>s+v,0)-(p.length-1)),Math.min(...p)]);
  assert.equal(c.jointProbability,null);assert.equal(c.simultaneousInterval,false);}
});
test('Reference board provenance: alternate native groups are not price-selected or fused automatically',async t=>{
 const f=await vector(t);const m=f.data.matches[0];m.group_status['10202']=structuredClone(m.group_status['981']);
 m.quotes.push(...m.quotes.filter(q=>q.group_id==='981').map(q=>({...q,group_id:'10202',market_id:'10202',group_name:'Alternative Total Goals',sel_id:q.sel_id+'alt'})));
 const r=run(f);assert.ok(r.boardStates.some(b=>b.reasons.includes('MULTIPLE_NATIVE_BOARDS_REQUIRE_EXPLICIT_MAPPING')));assert.equal(r.state,'ANALYSIS_INCOMPLETE');
});
test('Reference mathematical cap: stable budget exhaustion is explicit incomplete exploration',async t=>{
 const f=await vector(t),input=f.input();input.slot.fixtureIds=f.manifest.events.map(e=>e.fixtureId);
 const r=exploreInternational(input);assert.equal(r.counts.truncated,true);assert.equal(r.counts.attempted,20000);assert.equal(r.state,'ANALYSIS_INCOMPLETE');
 assert.equal(r.canonicalSha256,hashValue((({canonicalSha256,...c})=>{void canonicalSha256;return c;})(r)));
});
test('Reference uncertainty: a DC central estimate outside frozen bootstrap excludes it; comparator is never a fallback',async t=>{
 const f=await vector(t),e=f.journal.entries[0],g=e.forecasts.dc.grid.map(row=>row.map(()=>0));g[0][0]=1;e.forecasts.dc.grid=g;
 const {entrySha256,...content}=e;void entrySha256;e.entrySha256=hashValue(content);
 const r=run(f),records=r.records.filter(x=>x.fixture.fixtureId===e.fixtureId);
 assert.ok(records.length>0);assert.ok(records.every(x=>!x.referenceComputable));
 assert.ok(records.every(x=>x.models.bivariate.probability!==null));
 assert.ok(records.every(x=>x.exclusions.includes('PRIMARY_UNCERTAINTY_INSUFFICIENT_OR_CENTRAL_OUTSIDE_INTERVAL')));
});
test('Reference quote ordering: a price captured before freeze completion is not a current post-freeze input',async t=>{
 const f=await vector(t),r=exploreInternational({...f.input(),freezeCompletedAtUtc:'2026-10-30T12:50:30.000Z'});
 assert.ok(r.exclusions.includes('QUOTE_BEFORE_COMPLETED_FREEZE'));assert.equal(r.combinations.length,0);assert.equal(r.state,'ANALYSIS_INCOMPLETE');
});
test('Reference CC0 calendar: existing validator reconciles season, round, teams and Rome wall time without invented provider IDs',async t=>{
 const f=await vector(t),r=validateReferenceCalendar(f.manifest,f.b.calendar.source,f.readAtUtc);
 assert.equal(r.matchedFixtures,10);assert.equal(r.comparisonTimeZone,'Europe/Rome');
});
test('Reference CC0 calendar: missing, duplicate and changed wall-time rows remain fail-closed',async t=>{
 const f=await vector(t);for(const mutate of [d=>d.matches.pop(),d=>d.matches.push({...d.matches[0]}),d=>{d.matches[0].time='19:00';}]){
  const source=structuredClone(f.b.calendar.source),data=JSON.parse(source.body);mutate(data);source.body=JSON.stringify(data);source.bodySha256=hashBytes(source.body);
  assert.throws(()=>validateReferenceCalendar(f.manifest,source,f.readAtUtc));
 }
});
test('Reference freshness: source/calendar observation ages remain independent of the forecast and latest price change',async t=>{
 const f=await vector(t);for(const calendar of [null,{...f.input().calendar,officialObservedAtUtc:'2026-10-29T12:00:00.000Z'},
  {...f.input().calendar,cc0ObservedAtUtc:'2026-10-29T12:00:00.000Z'},
  {...f.input().calendar,providerIdentitiesObservedAtUtc:'2026-10-30T11:49:00.000Z'}]){
  const r=exploreInternational({...f.input(),calendar});assert.equal(r.state,'ANALYSIS_INCOMPLETE');assert.equal(r.combinations.length,0);
  assert.ok(r.exclusions.some(e=>e.startsWith('CALENDAR_')));
 }
});
