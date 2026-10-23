import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticB2,bindSyntheticAsianEvidence} from './fixtures/goals-b2.mjs';
import {bindSyntheticB1Source} from './fixtures/goals-b1.mjs';
import {prepareB2Mapping,asianEvidenceTemplate} from '../scripts/lib/diagnostic-goals-b2/mapping.mjs';
import {prepareB1Mapping} from '../scripts/lib/diagnostic-goals-b1/mapping.mjs';
import {buildB2Diagnostic} from '../scripts/lib/diagnostic-goals-b2/diagnostic.mjs';
import {settlementAt,settlementProbabilities,evForGrid} from '../scripts/lib/engine/markets.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
import {quantile} from '../scripts/lib/goals/metrics.mjs';

const asian=s=>s.report.selections.find(q=>q.marketType==='spreads'&&q.line===-.25&&q.outcome==='2');
test('B2 retains exact B1 mappings and source identity; 1X2/BTTS require the same immutable source chain',async()=>{
 const s=await syntheticB2(),before=digest(s),a=prepareB1Mapping(s).audit,b=prepareB2Mapping(s).audit;
 assert.equal(digest(s),before);
 const bById=new Map(b.records.map(r=>[r.quoteId,r]));for(const r of a.records)assert.deepEqual(bById.get(r.quoteId).spec,r.spec);
 for(const type of ['1x2','bothteamsscore']){const rows=b.records.filter(r=>s.report.selections.find(q=>q.quoteId===r.quoteId).marketType===type);assert.ok(rows.length>0);assert.ok(rows.every(r=>r.state==='VERIFIED_SOURCE_MAPPING'));}
 assert.equal(b.records.filter(r=>r.spec?.family==='asianHandicap').length,18);
 assert.ok(b.records.every(r=>r.eligibleForSelector===false));
 const bad=structuredClone(s);bad.fixtures[0].participant1Id=0;assert.throws(()=>prepareB2Mapping(bad),/HASH_MISMATCH/);
});
test('no Asian mapping is inferred from labels 1/2 or legacy settlementMapping without exact evidence',async()=>{
 const s=await syntheticB2(),q=asian(s),without=prepareB2Mapping({...s,asianEvidence:null});
 assert.equal(without.resolve(q,{quoteId:q.quoteId,line:q.line,side:'away'}),null);
 assert.ok(without.audit.records.filter(r=>r.sourceLine<0&&r.rawOutcome==='2').some(r=>r.reasons.includes('B2_SIGNED_SIDE_EVIDENCE_MISSING_OR_INVALID')));
 const blank=asianEvidenceTemplate(s,q);assert.equal(prepareB2Mapping({...s,asianEvidence:blank}).resolve(q),null);
 const verified=prepareB2Mapping(s);assert.deepEqual(verified.resolve(q),{family:'asianHandicap',line:.25,side:'away'});
 const selected=bindSyntheticAsianEvidence(s,{basis:'SELECTED_SIDE'});assert.deepEqual(prepareB2Mapping(selected).resolve(q),{family:'asianHandicap',line:-.25,side:'away'});
});
test('Asian evidence refuses wrong source hashes, sides, signed lines, stale time, invalid rules and duplicate attestations',async()=>{
 for(const change of [e=>e.reportSha256='b'.repeat(64),e=>e.catalogSha256='b'.repeat(64),e=>e.fixturesSha256='b'.repeat(64),
  (e,m)=>m.side='home',(e,m)=>m.selectedSignedLine=-.25,(e,m)=>m.sourceLineBasis='GUESS',(e,m)=>m.identitySha256='a'.repeat(64),
  (e,m)=>m.verifiedAtUtc='2026-10-16T12:00:00Z',(e,m)=>m.verifiedAtUtc='2026-10-16T14:00:00Z',
  (e,m)=>m.rulesUrl='https://unrelated.invalid/rules',(e,m)=>m.rulesSha256='',(e,m)=>m.extraTimeExcluded=false,
  (e,m)=>m.reviewer=7,(e,m)=>e.records.push({...m}),e=>e.records=[null],e=>e.records={}]){
  const s=await syntheticB2(),q=asian(s),m=s.asianEvidence.records.find(r=>r.quoteId===q.quoteId);change(s.asianEvidence,m);
  assert.equal(prepareB2Mapping(s).resolve(q),null);
 }
});
test('source-side, line, IDs, FT period, player identity, ambiguities and missing fields cannot be substituted',async()=>{
 for(const change of [q=>q.participantIds.reverse(),q=>q.fixture.reverse(),q=>q.line=.75,q=>q.marketId='wrong',q=>q.outcomeId='wrong',q=>q.outcome='Away',
  q=>q.period='p1',q=>q.marketName='Asian handicap',q=>q.playerKey='77',q=>q.participantIds=null]){
  const s=await syntheticB2(),q=asian(s);change(q);assert.equal(prepareB2Mapping(s).resolve(q),null);
 }
 const duplicate=await syntheticB2(),q=asian(duplicate);duplicate.report.selections.push({...q});assert.equal(prepareB2Mapping(duplicate).resolve(q),null);
 const inverse=await syntheticB2(),f=inverse.fixtures[0];[f.participant1Name,f.participant2Name]=[f.participant2Name,f.participant1Name];
 // Even a newly coherent raw chain cannot override the frozen forecast home/away identity.
 inverse.report=buildReport(inverse.fixtures,inverse.catalog,{round:inverse.report.round,observedAt:inverse.report.fetchedAtUtc,source:'synthetic_test'});
 const rebound=bindSyntheticAsianEvidence(inverse);assert.ok(prepareB2Mapping(rebound).audit.records.filter(r=>r.fixtureId===f.fixtureId).every(r=>r.state==='REFUSED'));
});
test('integer/half/quarter Asian settlements preserve refunds, half-win/loss and payoff EV for both sides',()=>{
 const cases=[[-1,2,1,'push'],[-.5,1,1,'loss'],[-.25,1,1,'halfLoss'],[.25,1,1,'halfWin'],[.5,1,1,'win'],[.75,0,1,'halfLoss'],[-.75,2,1,'halfWin']];
 for(const [line,h,a,wanted] of cases){assert.equal(settlementAt(h,a,{family:'asianHandicap',side:'home',line}),wanted);assert.equal(settlementAt(a,h,{family:'asianHandicap',side:'away',line}),wanted);}
 const grid=[[.1,.2],[.3,.4]],price=2.1;
 const opposite={win:'loss',halfWin:'halfLoss',push:'push',halfLoss:'halfWin',loss:'win'};
 // Opposite signed sides must always exchange payoff categories, including a shared push.
 for(let home=0;home<8;home++)for(let away=0;away<8;away++)for(let quarter=-20;quarter<=20;quarter++){
  const line=quarter/4,left=settlementAt(home,away,{family:'asianHandicap',side:'home',line});
  assert.equal(settlementAt(home,away,{family:'asianHandicap',side:'away',line:-line}),opposite[left]);
 }
 for(const side of ['home','away'])for(const line of [-1,-.75,-.5,-.25,0,.25,.5,.75,1]){
  const spec={family:'asianHandicap',side,line},p=settlementProbabilities(grid,spec);
  assert.ok(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)<1e-12);
  const expected=p.win*(price-1)+p.halfWin*(price-1)/2-p.halfLoss/2-p.loss;
  assert.ok(Math.abs(evForGrid(grid,spec,price)-expected)<1e-12);
 }
});
test('B2 diagnostics carry unchanged grid probabilities and bootstrap intervals, never selector approval or app delivery',async()=>{
 const s=await syntheticB2(),before=digest(s),d=buildB2Diagnostic(s);
 const q=asian(s),r=d.pricedRecords.find(r=>r.quoteId===q.quoteId&&r.kind==='dc');
 assert.deepEqual(r.probabilities,settlementProbabilities(s.journal.entries[0].forecasts.dc.grid,r.spec));
 const grids=s.journal.entries[0].forecasts.dc.bootstrapGrids,samples=grids.map(g=>settlementProbabilities(g,r.spec));
 for(const state of Object.keys(r.probabilities))assert.deepEqual(r.probabilityIntervals95[state],[quantile(samples.map(p=>p[state]),.025),quantile(samples.map(p=>p[state]),.975)]);
 const ev=grids.map(g=>evForGrid(g,r.spec,r.currentPrice));assert.deepEqual(r.evInterval95,[quantile(ev,.025),quantile(ev,.975)]);
 assert.equal(digest(s),before);assert.equal(d.counts.selectorEligible,0);assert.equal(d.appDeliveryAllowed,false);
 const stale=buildB2Diagnostic({...s,now:'2026-10-16T13:30:00Z'});assert.ok(stale.pricedRecords.every(r=>r.currentPrice===null));
 const inactive=await syntheticB2();asian(inactive).active=false;const bound=bindSyntheticAsianEvidence(bindSyntheticB1Source(inactive)),result=buildB2Diagnostic(bound);
 assert.ok(result.pricedRecords.filter(r=>r.quoteId===asian(bound).quoteId).every(r=>r.currentPrice===null&&r.classification==='INSUFFICIENT_DATA'));
});
