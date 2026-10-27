import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {syntheticCompositionFixture} from './fixtures/mm-composition.mjs';
import {composeSyntheticExploration} from '../scripts/lib/mm-simulator-v1/composition.mjs';
import {hashValue} from '../scripts/lib/mm-simulator-v1/contracts.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const deepFreeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(deepFreeze);}return v;};
const run=f=>composeSyntheticExploration(f.input);
const failures=r=>r.combinations.flatMap(c=>c.scenarioGateFailures);
const safety=r=>{for(const v of [r,...r.candidates??[],...r.combinations??[],...r.combinations?.flatMap(c=>c.legs)??[]]){
 assert.equal(v.operationallyApproved,false);assert.equal(v.scientificallyValidated,false);assert.equal(v.actualStakeEUR,0);assert.equal(v.admissible,false);}};

test('M3-A: real M1/M2 validators, exact frozen-grid marginals, independent synthetic ticket and Frechet; no actual admission',async()=>{
 const f=await syntheticCompositionFixture(),r=run(f);assert.equal(r.state,'SYNTHETIC_CRITERIA_SATISFIED_NOT_ADMISSIBLE');safety(r);
 const c=r.combinations.find(c=>!c.scenarioGateFailures.length);assert.ok(c);near(c.jointProbabilityBounds[0],.9);near(c.jointProbabilityBounds[1],.95);
 near(c.jointSensitivityEnvelope[0],.8);near(c.conditionalSyntheticNetPerUnitBounds[0],.12);
 assert.equal(c.syntheticTicketPrice,1.4);assert.equal(c.actualTicketPrice,null);assert.notEqual(c.syntheticTicketPrice,1.2*1.2);
 assert.equal(c.jointProbability,null);assert.equal(c.jointConfidenceInterval,null);assert.equal(c.marginalIntervalsSimultaneous,false);
 assert.equal(r.policyActivated,false);assert.ok(c.admissionBlockers.includes('POLICY_NOT_APPROVED'));
 assert.equal(c.legs[0].record.models.bivariate.model.id,'bivariate-v2');assert.equal(c.legs[0].record.priceLabel,'STORICO — NON OFFERTA ATTUALE');
 assert.equal(r.source.journalSha256,hashValue(f.journal));assert.equal(r.source.boardSnapshotSha256,f.input.boards.canonicalSha256);
});
test('M3-A: no same-fixture pairing across outcomes or families; explicit reasons preserved',async()=>{
 const r=run(await syntheticCompositionFixture());assert.ok(r.constraintExclusions.some(c=>c.reasons.includes('SAME_FIXTURE_MULTIPLE_SELECTIONS')));
 assert.ok(r.combinations.every(c=>new Set(c.legs.map(l=>l.record.event.id)).size===c.legs.length));
});
test('M3-A: immutable deep-frozen inputs and repeated output byte/hash determinism',async()=>{
 const f=await syntheticCompositionFixture(),before=JSON.stringify(f.input);deepFreeze(f.input);const a=run(f),b=run(f);
 assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify(f.input),before);
 a.combinations[0].legs[0].record.event.home.name='edited output';assert.equal(JSON.stringify(f.input),before);
 assert.equal(a.source.modelCodeSha256,f.study.modelCodeSha256);
});
test('M3-A: missing policy still permits mathematics, never promotion; caller cannot activate approval',async()=>{
 const f=await syntheticCompositionFixture();f.input.scenario=null;const r=run(f);assert.equal(r.state,'ANALYSIS_INCOMPLETE');
 assert.ok(r.combinations.some(c=>c.jointProbabilityBounds.length===2));assert.ok(failures(r).includes('POLICY_SCENARIO_MISSING_OR_INVALID'));safety(r);
 f.input.scenario={approvalState:'APPROVED'};assert.equal(run(f).state,'INPUT_INVALID');
 delete f.input.scenario;f.input.approvedPolicy=true;assert.equal(run(f).state,'INPUT_INVALID');
});
test('M3-A: missing context, lineup review or inconsistent context is incomplete, not NO_BET',async()=>{
 for(const edit of [f=>{f.input.context=null;},f=>{f.input.context.evidence.facts=[];},f=>{f.input.context.entries[0].home='incorrect';}]){
  const f=await syntheticCompositionFixture();edit(f);const r=run(f);assert.equal(r.state,'ANALYSIS_INCOMPLETE');assert.ok(failures(r).includes('CONTEXT_REVIEW_REQUIRED'));}
});
test('M3-A: actual context validators reject absent probable lineups even when other evidence is reviewed',async()=>{
 const f=await syntheticCompositionFixture();f.input.context.evidence.facts=[];f.input.context.evidenceSha256=hashValue(f.input.context.evidence);
 const r=run(f);assert.ok(failures(r).includes('CONTEXT_REVIEW_REQUIRED'));assert.ok(r.combinations.every(c=>c.admissible===false));
});
test('M3-A: missing or contradictory settlement, single-price and ticket reviews do not imply no value',async()=>{
 for(const [edit,reason] of [
  [f=>{f.input.selectionReviews.forEach(r=>{r.rules.voidAndPostponementReviewed=false;});},'SETTLEMENT_REVIEW_REQUIRED'],
  [f=>{f.input.selectionReviews=[];},'SINGLE_PRICE_REVIEW_REQUIRED'],
  [f=>{f.input.ticketReviews=[];},'EXACT_TICKET_PRICE_REVIEW_REQUIRED'],
  [f=>{f.input.selectionReviews.push(...structuredClone(f.input.selectionReviews));},'DUPLICATE_SELECTION_REVIEW'],
  [f=>{f.input.ticketReviews.push(...structuredClone(f.input.ticketReviews));},'DUPLICATE_TICKET_REVIEW'],
  [f=>{f.input.ticketReviews.forEach(t=>{t.selectionReviewSha256=['b'.repeat(64)];});},'EXACT_TICKET_PRICE_REVIEW_REQUIRED']]){
  const f=await syntheticCompositionFixture();edit(f);const r=run(f);assert.ok(failures(r).includes(reason),reason);assert.equal(r.state,'ANALYSIS_INCOMPLETE');safety(r);}
});
test('M3-A: incomplete board retains missing outcome without fabricated price; complete other family remains separate',async()=>{
 const f=await syntheticCompositionFixture();delete f.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes[105];f.rebuild();const r=run(f);
 assert.equal(r.candidates.filter(q=>q.record.event.id==='synthetic-event-0'&&q.record.family==='BTTS').length,0);
 assert.ok(r.boardExclusions.some(b=>b.completeness==='INCOMPLETE'));assert.ok(r.exclusions.some(q=>q.reasons.includes('BOARD_INCOMPLETE_OR_INVALID')));
});
test('M3-A: negative/unknown provider flags cannot be overcome by synthetic reviews',async()=>{
 for(const edit of [f=>{f.raw[0].bookmakerOdds['bet365.it'].markets[104].marketActive=false;},
  f=>{f.raw[0].bookmakerOdds['bet365.it'].suspended=true;},f=>{delete f.raw[0].bookmakerOdds['bet365.it'].bookmakerIsActive;}]){
  const f=await syntheticCompositionFixture();edit(f);f.rebuild();const r=run(f);assert.ok(r.exclusions.some(q=>q.reasons.includes('SOURCE_UNAVAILABLE')));
  assert.ok(!r.candidates.some(q=>q.record.event.id==='synthetic-event-0'&&q.record.family==='BTTS'));}
});
test('M3-A: invalid/missing price and future changedAt remain excluded by real M1/M2',async()=>{
 for(const edit of [q=>{q.price=0;},q=>{delete q.price;},q=>{q.changedAt='2026-10-17T12:00:00.000Z';}]){
  const f=await syntheticCompositionFixture();edit(f.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes[104].players[0]);f.rebuild();const r=run(f);
  assert.ok(!r.candidates.some(q=>q.record.event.id==='synthetic-event-0'&&q.record.family==='BTTS'));assert.ok(r.exclusions.length);}
});
test('M3-A: mismatched fixture, team role, kickoff, period, line and digest cannot be repaired by composer',async()=>{
 for(const edit of [i=>{i.boards.boards[0].event.sourceEventId='wrong';},i=>{[i.boards.boards[0].event.home,i.boards.boards[0].event.away]=[i.boards.boards[0].event.away,i.boards.boards[0].event.home];},
  i=>{i.boards.boards[0].event.kickoffUtc='2026-10-17T18:45:00.000Z';},i=>{i.boards.boards[0].period='FIRST_HALF';},i=>{i.boards.boards[1].line=3.5;},
  i=>{i.diagnostic.records[0].models.dc.probability=.99;},i=>{i.diagnostic.provenance.journalSha256='b'.repeat(64);}]){
  const f=await syntheticCompositionFixture();edit(f.input);const r=run(f);assert.equal(r.state,'INPUT_INVALID');assert.equal(r.combinations.length,0);safety(r);}
});
test('M3-A: missing forecast or bootstrap never falls back to comparator',async()=>{
 for(const edit of [f=>{delete f.journal.entries[0].forecasts.dc;},f=>{delete f.journal.entries[0].forecasts.dc.bootstrapGrids;}]){
  const f=await syntheticCompositionFixture();edit(f);f.rebuild();const r=run(f);
  assert.ok(!r.candidates.some(q=>q.record.event.id==='synthetic-event-0'));assert.ok(r.exclusions.some(q=>q.reasons.includes('MARGINAL_PROBABILITY_OR_INTERVAL_UNAVAILABLE')));}
});
test('M3-A: exact complement zero lower Frechet bound remains zero and cannot pass any finite ticket',async()=>{
 const f=await syntheticCompositionFixture();for(const e of f.journal.entries)for(const m of Object.values(e.forecasts)){
  m.grid=[[.51,0,0],[0,0,0],[0,0,.49]];m.bootstrapGrids=Array.from({length:40},()=>[[.51,0,0],[0,0,0],[0,0,.49]]);}
 f.rebuild();Object.assign(f.input.scenario,{minPointEV:0,minLowerEV:0,maxIntervalWidth:1,maxTicketReviews:100});
 // Raise independently supplied synthetic single prices; rebuild all bindings,
 // rather than editing derived probabilities or quote fields in place.
 for(const x of f.raw)for(const m of Object.values(x.bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))o.players[0].price=3;
 f.rebuild();Object.assign(f.input.scenario,{minPointEV:0,minLowerEV:0,maxIntervalWidth:1,maxTicketReviews:100});
 const r=run(f),c=r.combinations.find(c=>c.legs.every(l=>['YES','OVER'].includes(l.record.outcome)));
 assert.ok(c);assert.equal(c.jointSensitivityEnvelope[0],0);assert.equal(c.conditionalSyntheticNetPerUnitBounds[0],-1);
 assert.ok(c.scenarioGateFailures.includes('FRECHET_LOWER_EV_CRITERION_NOT_MET'));
});
test('M3-A: bounded enumeration reports truncation and never a complete negative; zero review budget remains incomplete',async()=>{
 const f=await syntheticCompositionFixture();f.input.search.maxCombinations=1;let r=run(f);assert.equal(r.searchTruncated,true);assert.equal(r.state,'ANALYSIS_INCOMPLETE');assert.equal(r.counts.examinedCombinations,1);
 f.input.search.maxCombinations=100;f.input.search.maxVisitedNodes=1;r=run(f);assert.equal(r.searchTruncated,true);assert.ok(r.counts.visitedNodes<=1);
 f.input.search.maxVisitedNodes=1000;f.input.scenario.maxTicketReviews=0;r=run(f);assert.ok(failures(r).includes('REVIEW_BUDGET_EXHAUSTED'));assert.equal(r.state,'ANALYSIS_INCOMPLETE');
});
test('M3-A: malformed, duplicate and authentic inputs fail closed; no caller clock default or implicit search parameters',async()=>{
 const f=await syntheticCompositionFixture();assert.equal(composeSyntheticExploration(null).state,'INPUT_INVALID');
 for(const edit of [i=>{delete i.atUtc;},i=>{delete i.search.maxCombinations;},i=>{i.boards.boards.push(structuredClone(i.boards.boards[0]));},
  i=>{i.diagnostic.records.push(structuredClone(i.diagnostic.records[0]));},i=>{i.journal.sourceData='original';},i=>{i.diagnostic.provenance.sourceData='ARCHIVED_ORIGINAL_ARTIFACTS';}]){
  const i=structuredClone(f.input);edit(i);assert.equal(composeSyntheticExploration(i).state,'INPUT_INVALID');}
});
test('M3-A: stable order is explicit, no economic policy defaults; all scope and model references preserved',async()=>{
 const f=await syntheticCompositionFixture(),a=run(f),b=run(f);assert.equal(a.canonicalSha256,b.canonicalSha256);
 assert.deepEqual(a.candidates.map(c=>c.quoteId),a.candidates.map(c=>c.quoteId).sort());
 f.input.search.order='MARGINAL_LOWER_EV';const r=run(f);assert.ok(r.candidates[0].marginalArithmetic.lowerEV>=r.candidates.at(-1).marginalArithmetic.lowerEV);safety(r);
 assert.equal(r.source.scenarioSha256,hashValue(f.input.scenario));assert.equal(r.source.searchSha256,hashValue(f.input.search));
 f.input.search.primaryModel='bivariate';assert.equal(run(f).candidates[0].model.model.id,'bivariate-v2');
});
test('M3-A: real-time gate scenarios preserve exclusive completion boundary, stale quotes and future reviews',async()=>{
 for(const [edit,reason] of [
  [i=>{i.atUtc='2026-10-16T13:19:00.000Z';},'QUOTE_EXPIRED_OR_FUTURE'],
  [i=>{i.atUtc='2026-10-16T16:15:00.000Z';},'COMPLETION_WINDOW_CLOSED'],
  [i=>{i.selectionReviews.forEach(r=>{r.reviewedAtUtc='2026-10-16T12:51:00.000Z';});},'SINGLE_PRICE_REVIEW_REQUIRED'],
  [i=>{i.calendar=null;},'CALENDAR_RECONFIRMATION_REQUIRED'],
  [i=>{i.ticketReviews.forEach(t=>{t.reviewedAtUtc='2026-10-16T12:47:00.000Z';});},'EXACT_TICKET_PRICE_REVIEW_REQUIRED']]){
  const f=await syntheticCompositionFixture();edit(f.input);assert.ok(failures(run(f)).includes(reason),reason);}
 const f=await syntheticCompositionFixture();f.input.atUtc='2026-10-16T13:18:00.000Z';assert.ok(!failures(run(f)).includes('QUOTE_EXPIRED_OR_FUTURE'));
});
test('M3-A: three distinct fixtures use n-dimensional Frechet, never a product or paired bootstrap samples',async()=>{
 const f=await syntheticCompositionFixture({events:3});f.input.search.minLegs=3;f.input.search.maxLegs=3;f.input.search.maxCombinations=300;f.input.search.maxVisitedNodes=10000;
 const r=run(f),c=r.combinations.find(c=>c.legs.every(l=>l.record.outcome==='YES'));assert.ok(c);
 near(c.jointProbabilityBounds[0],.85);near(c.jointProbabilityBounds[1],.95);near(c.jointSensitivityEnvelope[0],.7);
 assert.equal(c.jointProbability,null);assert.equal(c.jointConfidenceInterval,null);assert.equal(c.actualTicketPrice,null);
 assert.ok(c.scenarioGateFailures.includes('EXACT_TICKET_PRICE_REVIEW_REQUIRED'));safety(r);
});
test('M3-A: an exhausted, reviewed synthetic scope can fail all criteria without declaring a global NO_BET',async()=>{
 const f=await syntheticCompositionFixture();f.input.scenario.minCombinationLowerEV=100;
 const r=run(f);assert.equal(r.state,'NO_COMBINATION_MEETS_SYNTHETIC_CRITERIA_IN_REVIEWED_SCOPE');
 assert.equal(r.searchTruncated,false);assert.equal(r.counts.syntheticCriteriaSatisfied,0);
 assert.ok(r.reasons.includes('INPUT_COVERAGE_EXCLUSIONS_PRESENT'));assert.equal(r.negativeConclusionScope,'EXPLICIT_SYNTHETIC_SEARCH_ONLY_NEVER_GLOBAL_NO_BET');safety(r);
});
test('M3-A: missing all forecasts cannot be disguised as a complete negative; marginal-only state is explicit',async()=>{
 const f=await syntheticCompositionFixture();for(const e of f.journal.entries)delete e.forecasts.dc;f.rebuild();let r=run(f);
 assert.equal(r.state,'ANALYSIS_INCOMPLETE');assert.equal(r.mathematicalState,'NO_VERIFIABLE_MARGINALS');
 const g=await syntheticCompositionFixture({events:1});r=run(g);assert.equal(r.mathematicalState,'MARGINALS_ONLY');
 assert.equal(r.combinations.length,0);assert.ok(r.constraintExclusions.every(c=>c.reasons.includes('SAME_FIXTURE_MULTIPLE_SELECTIONS')));
});
test('M3-A: recomputed M1/M2 still excludes genuine mapping discordance and insufficient frozen bootstrap',async()=>{
 const f=await syntheticCompositionFixture();f.bindings.events[0].home.name='SYNTHETIC Wrong Team';f.rebuild();let r=run(f);
 assert.ok(r.exclusions.some(e=>e.reasons.includes('EXACT_FIXTURE_HOME_AWAY_OR_KICKOFF_MISMATCH')));
 assert.ok(!r.candidates.some(q=>q.record.event.id==='synthetic-event-0'));
 const g=await syntheticCompositionFixture();for(const m of Object.values(g.journal.entries[0].forecasts)){
  m.bootstrapGrids=m.bootstrapGrids.slice(0,35);m.uncertainty={replicates:40,failures:5,sufficient:false};}
 g.rebuild();r=run(g);assert.ok(!r.candidates.some(q=>q.record.event.id==='synthetic-event-0'));
});
test('M3-A: pure invocation cannot read/write files, consult clock implicitly, fetch or mutate globals',async()=>{
 const f=await syntheticCompositionFixture(),methods=['readFile','writeFile','open','mkdir','rename','link','unlink','stat','readdir'];
 const originals=Object.fromEntries(methods.map(k=>[k,fs[k]])),fetchOriginal=globalThis.fetch,nowOriginal=Date.now;
 try{
  for(const k of methods)fs[k]=()=>{throw Error('UNEXPECTED_FILESYSTEM_EFFECT:'+k);};
  globalThis.fetch=()=>{throw Error('UNEXPECTED_NETWORK_EFFECT');};Date.now=()=>{throw Error('UNEXPECTED_IMPLICIT_CLOCK');};
  const r=run(f);assert.equal(r.state,'SYNTHETIC_CRITERIA_SATISFIED_NOT_ADMISSIBLE');assert.equal(r.providerRequests,0);
 }finally{for(const k of methods)fs[k]=originals[k];globalThis.fetch=fetchOriginal;Date.now=nowOriginal;}
});
