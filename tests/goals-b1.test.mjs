import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticB1,bindSyntheticB1Source} from './fixtures/goals-b1.mjs';
import {buildB1Diagnostic} from '../scripts/lib/diagnostic-goals-b1/diagnostic.mjs';
import {prepareB1Mapping} from '../scripts/lib/diagnostic-goals-b1/mapping.mjs';
import {settlementAt,settlementProbabilities,evForGrid} from '../scripts/lib/engine/markets.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
const row=(s,type)=>s.report.selections.find(q=>q.marketType===type);
test('B1 maps only the exact source-bound Double Chance labels, preserving original 2X and all input hashes',async()=>{
 const s=await syntheticB1(),before=digest(s),d=buildB1Diagnostic(s);
 assert.equal(digest(s),before);const dc=d.mappingB1.records.filter(r=>r.spec?.family==='doubleChance');assert.equal(dc.length,3);
 assert.deepEqual(dc.map(r=>[r.rawOutcome,r.canonicalOutcome]),[['1X','1X'],['2X','X2'],['12','12']]);
 assert.ok(dc.every(r=>!r.eligibleForSelector));assert.equal(d.counts.selectorEligible,0);
 for(const r of d.pricedRecords.filter(r=>r.spec.family==='doubleChance'))assert.deepEqual(r.probabilities,settlementProbabilities(s.journal.entries[0].forecasts.dc.grid,r.spec));
});
test('catalog/snapshot/source hashes, season and complete fixture identity cannot be substituted',async()=>{
 const s=await syntheticB1();for(const change of [v=>v.catalog[0].marketName='WRONG',v=>v.fixtures[0].startTime='2026-10-21T00:00:00Z',v=>v.report.source.fixturesSha256='a'.repeat(64)]){
  const v=structuredClone(s);change(v);assert.throws(()=>prepareB1Mapping(v),/HASH_MISMATCH/);
 }
 assert.throws(()=>prepareB1Mapping({...s,report:{...s.report,round:{...s.report.round,matchday:8}}}),/ROUND_MISMATCH/);
 assert.throws(()=>prepareB1Mapping({...s,report:{...s.report,round:{...s.report.round,fixtureIds:s.report.round.fixtureIds.slice(1)}}}),/FIXTURE_SET/);
});
test('modified fixture/outcome/market IDs, line, source price and home/away identity are refused without fuzzy matching',async()=>{
 const s=await syntheticB1();for(const change of [q=>q.outcomeId='wrong',q=>q.marketId='wrong',q=>q.line=1.25,q=>q.price=99,
  q=>q.fixture.reverse(),q=>q.participantIds.reverse(),q=>q.period='p1',q=>q.marketName='Double chance full time',q=>q.outcome='X1',q=>delete q.participantIds]){
  const v=structuredClone(s),q=row(v,'doublechance');change(q);const a=prepareB1Mapping(v).audit.records.find(r=>r.quoteId===q.quoteId);
  assert.equal(a.state,'REFUSED');assert.ok(a.reasons.length);
 }
});
test('duplicate quotes, ambiguous source IDs, missing fields, player rows and corrupted outcome definitions never become mapped offers',async()=>{
 const s=await syntheticB1(),q=row(s,'doublechance');s.report.selections.push({...q});
 assert.ok(prepareB1Mapping(s).audit.records.filter(r=>r.quoteId===q.quoteId).every(r=>r.state==='REFUSED'));
 const duplicate=await syntheticB1();duplicate.fixtures.push(structuredClone(duplicate.fixtures[0]));duplicate.report.source.fixturesSha256=digest(duplicate.fixtures);
 assert.ok(prepareB1Mapping(duplicate).audit.records.filter(r=>r.fixtureId===duplicate.fixtures[0].fixtureId).every(r=>r.reasons.includes('B1_SOURCE_IDS_NOT_UNIQUE')));
 const ambiguous=await syntheticB1(),definition=ambiguous.catalog.find(d=>d.marketType==='doublechance');definition.outcomes.push({...definition.outcomes[0]});ambiguous.report.source.catalogSha256=digest(ambiguous.catalog);
 assert.ok(prepareB1Mapping(ambiguous).audit.records.filter(r=>r.marketId===String(definition.marketId)).every(r=>r.reasons.includes('B1_PROVIDER_IDENTITY_INCOMPLETE')));
 for(const change of [q=>q.playerProp=true,q=>q.playerKey='player',q=>q.line=null,q=>q.outcome=undefined]){
  const v=await syntheticB1(),q=row(v,'doublechance');change(q);assert.equal(prepareB1Mapping(v).audit.records.find(r=>r.quoteId===q.quoteId).state,'REFUSED');
 }
});
test('team1 is home and team2 is away; inverse source identities and unsupported names cannot swap them',async()=>{
 const s=await syntheticB1(),a=prepareB1Mapping(s).audit;
 for(const r of a.records.filter(r=>r.spec?.family==='teamTotals'))assert.equal(r.spec.side,r.marketId==='902'?'home':'away');
 const q=row(s,'teamtotals-team1');q.marketName='Over Under Team 2';assert.equal(prepareB1Mapping(s).audit.records.find(r=>r.quoteId===q.quoteId).state,'REFUSED');
 const inverse=await syntheticB1(),f=inverse.fixtures[0];[f.participant1Name,f.participant2Name]=[f.participant2Name,f.participant1Name];[f.participant1Id,f.participant2Id]=[f.participant2Id,f.participant1Id];
 inverse.report=buildReport(inverse.fixtures,inverse.catalog,{round:inverse.report.round,observedAt:inverse.report.fetchedAtUtc,source:'synthetic_test'});
 assert.ok(prepareB1Mapping(inverse).audit.records.filter(r=>r.fixtureId===f.fixtureId).every(r=>r.reasons.includes('B1_FROZEN_FIXTURE_OR_HOME_AWAY_MISMATCH')));
});
test('totals complements, monotonicity, integer pushes, quarters and DNB refunds retain exact payoff/EV arithmetic',async()=>{
 const s=await syntheticB1(),g=s.journal.entries[0].forecasts.dc.grid;
 let previous=1;for(const line of [1.5,2.5,3.5]){const over=settlementProbabilities(g,{family:'totals',line,outcome:'Over'}),under=settlementProbabilities(g,{family:'totals',line,outcome:'Under'});assert.ok(Math.abs(over.win+under.win-1)<1e-12);assert.ok(over.win<previous);previous=over.win;}
 const over2=settlementProbabilities(g,{family:'totals',line:2,outcome:'Over'}),under2=settlementProbabilities(g,{family:'totals',line:2,outcome:'Under'});
 assert.ok(Math.abs(over2.win+under2.win+over2.push-1)<1e-12);assert.ok(over2.push>0);
 assert.equal(settlementAt(1,1,{family:'totals',line:2.25,outcome:'Over'}),'halfLoss');
 assert.equal(settlementAt(1,1,{family:'totals',line:2.25,outcome:'Under'}),'halfWin');
 assert.equal(settlementAt(1,1,{family:'drawNoBet',side:'home'}),'push');assert.equal(evForGrid([[1]],{family:'drawNoBet',side:'away'},3),0);
 const dnb=settlementProbabilities(g,{family:'drawNoBet',side:'home'});assert.equal(evForGrid(g,{family:'drawNoBet',side:'home'},2.2),dnb.win*2.2+dnb.push-1);
 const home=settlementProbabilities([[0,0,0],[0,0,1],[0,0,0]],{family:'teamTotals',side:'home',line:1.5,outcome:'Under'});assert.equal(home.win,1);
});
test('stale prices, inactive quotes and future observations cannot produce a usable B1 price or ranking',async()=>{
 const s=await syntheticB1(),q=row(s,'drawnobet');q.active=false;const coherent=bindSyntheticB1Source(s),d=buildB1Diagnostic(coherent);
 assert.ok(d.pricedRecords.filter(r=>r.spec.family==='drawNoBet'&&r.spec.side==='home').every(r=>r.currentPrice===null&&r.classification==='INSUFFICIENT_DATA'));
 const stale=buildB1Diagnostic({...coherent,now:'2026-10-16T13:30:00Z'});assert.ok(stale.pricedRecords.every(r=>r.currentPrice===null));
 const old=await syntheticB1();row(old,'drawnobet').changedAt='2026-10-12T00:00:00Z';const oldBound=bindSyntheticB1Source(old),oldReport=buildB1Diagnostic(oldBound);
 assert.ok(oldReport.pricedRecords.filter(r=>r.spec.family==='drawNoBet'&&r.spec.side==='home').every(r=>r.currentPrice===null));
 assert.throws(()=>prepareB1Mapping({...coherent,now:'2026-10-16T12:47:00Z'}),/FUTURE/);
});
