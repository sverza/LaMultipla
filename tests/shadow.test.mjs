import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {sample,catalog,round} from './fixtures/oddspapi.mjs';
import {buildReport,fingerprint} from '../scripts/lib/odds-report.mjs';
import {verificationTemplate} from '../scripts/lib/availability.mjs';
import {sealJournal,CONFIG} from '../scripts/lib/prospective/freeze.mjs';
import {createDecision,persistDecision,assertNoDecision,decisionPath,freezeForwardForecast,validateCycleSchedule} from '../scripts/lib/shadow/pipeline.mjs';
import {screenOpportunities} from '../scripts/lib/shadow/opportunities.mjs';
import {frechet,selectCombination} from '../scripts/lib/shadow/combinations.mjs';
import {valueMetrics,classifyValue} from '../scripts/lib/shadow/policy.mjs';
import {evaluateShadow,shadowProgress} from '../scripts/lib/shadow/evaluate.mjs';
import {validateCurrentDataset} from '../scripts/lib/shadow/registry.mjs';
import {refreshDataset} from '../scripts/lib/shadow/data.mjs';
import {importQuotes} from '../scripts/oddspapi.mjs';
import {account} from './fixtures/oddspapi.mjs';
import {readSnapshot} from '../scripts/lib/prospective/store.mjs';

// All events/prices/probabilities in this test are SYNTHETIC; no actual betting evidence.
const now='2026-10-10T06:45:00.000Z',observed='2026-10-10T06:44:00.000Z';
const study={schema:'lamultipla-goals-study-v1',synthetic:true,validationCompletedAtUtc:'2026-10-09T23:00:00Z',acceptance:{oneXTwo:{retrospectiveAccepted:true}}};
function fixture(){
  const raw=sample();for(const f of raw)for(const m of Object.values(f.bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))for(const s of Object.values(o.players))s.changedAt=observed;
  const report=buildReport(raw,catalog,{round,observedAt:observed,source:'api'});
  const events=report.coverage.map(r=>({fixtureId:r.fixtureId,home:r.fixture[0],away:r.fixture[1],kickoffUtc:r.kickoffUtc,season:round.season,matchday:round.matchday}));
  const manifest={season:round.season,matchday:round.matchday,events};
  const forecasts=events.map(e=>({...e,central:[.65,.2,.15],intervals95:[[.6,.7],[.15,.25],[.1,.2]],uncertainty:{replicates:40,failures:0,sufficient:true},baselines:{empirical:[.4,.3,.3],leaguePoisson:[.4,.3,.3]}}));
  const journal=sealJournal({model:{converged:true,config:CONFIG,cutoffUtc:'2026-10-01T00:00:00.000Z'},forecasts},manifest,
    {studySha256:fingerprint(study),datasetAcquiredAtUtc:'2026-10-09T23:00:00.000Z'},'2026-10-10T06:43:00.000Z');
  return {raw,report,journal,study};
}
function verify(report,q,availability='available') {
  return {...verificationTemplate(report,q),availability,observedPrice:q.price,verifiedAtUtc:now,reviewer:'synthetic tester',evidence:'SYNTHETIC only'};
}
const reseal=e=>{const {entrySha256,...content}=e;e.entrySha256=fingerprint(content);return entrySha256;};
test('shadow links exact independent forecast, removes complete-board margin and ignores assessment probabilities',()=>{
  const input=fixture(),copy=fingerprint(input),result=screenOpportunities({...input,assessment:{estimates:[{quoteId:input.report.selections[0].quoteId,probabilities:{win:1}}]},now});
  assert.equal(result.candidates.length,10);assert.equal(result.baselines.length,10);assert.equal(result.baselines[0].status,'COMPLETE');
  assert.equal(result.baselines[0].manualPlayabilityVerified,false);assert.ok(Math.abs(result.baselines[0].probabilities.reduce((a,b)=>a+b,0)-1)<1e-10);
  assert.equal(result.candidates[0].value.probability,.65);assert.equal(result.operationallyApproved,false);assert.equal(fingerprint(input),copy);
});
test('point-positive uncertainty is distinguished from no value and missing evidence',()=>{
  assert.equal(classifyValue(valueMetrics(2,.51,[.4,.6])),'UNCERTAIN_VALUE');assert.equal(classifyValue(valueMetrics(2,.4,[.35,.45])),'NO_VALUE');
  assert.equal(classifyValue(valueMetrics(2,.6,[.56,.64])),'SHADOW_CANDIDATE');assert.equal(classifyValue(valueMetrics(2,.6,[null,.64])),'INSUFFICIENT_DATA');
  const input=fixture();input.journal.entries[0].intervals95=null;reseal(input.journal.entries[0]);
  assert.equal(screenOpportunities({...input,now}).screening[0].classification,'INSUFFICIENT_DATA');
});
test('inactive override is exact, negative verification blocks and all provider flags remain intact',()=>{
  const input=fixture(),q=input.report.selections[0];q.active=false;q.availability='blocked';
  assert.equal(screenOpportunities({...input,now}).screening[0].availability.state,'reserved_observation');
  const assessment={estimates:[{quoteId:q.quoteId,manualVerification:verify(input.report,q)}]},hash=fingerprint(input.report);
  const positive=screenOpportunities({...input,assessment,now}).screening[0];assert.equal(positive.classification,'SHADOW_CANDIDATE');assert.equal(positive.availability.override,true);
  assert.equal(q.active,false);assert.equal(fingerprint(input.report),hash);
  assessment.estimates[0].manualVerification.observedPrice=2.2;assert.equal(screenOpportunities({...input,assessment,now}).screening[0].classification,'INSUFFICIENT_DATA');
  assessment.estimates[0].manualVerification=verify(input.report,q,'unavailable');assert.equal(screenOpportunities({...input,assessment,now}).screening[0].classification,'INSUFFICIENT_DATA');
  q.marketActive=false;assessment.estimates[0].manualVerification=verify(input.report,q);assert.equal(screenOpportunities({...input,assessment,now}).screening[0].classification,'INSUFFICIENT_DATA');
});
test('identity, timestamps, duplicate quotes and already-started events cannot pass screening',()=>{
  for(const change of [q=>q.fixture[0]='Wrong',q=>q.line=.5,q=>q.playerKey='2',q=>q.period='1st-half',q=>q.kickoffUtc='2026-10-10T13:01:00Z',q=>q.observedAtUtc='2026-10-09T06:44:00Z',q=>q.changedAt='2026-10-10T06:46:00Z',q=>q.statusId=1]) {
    const input=fixture(),q=input.report.selections[0];change(q);const r=screenOpportunities({...input,now});assert.ok(!r.candidates.some(s=>s.quoteId===q.quoteId));
  }
  const input=fixture();input.report.selections.push(structuredClone(input.report.selections[0]));assert.ok(screenOpportunities({...input,now}).screening[0].reasons.includes('duplicate_or_conflicting_quote'));
  const late=screenOpportunities({...fixture(),now:'2026-10-10T13:00:00Z'});assert.equal(late.candidates.length,0);
  assert.throws(()=>screenOpportunities({...fixture(),now:'bad'}),/clock/);
});
test('incomplete boards never invent missing prices and temporal provenance is mandatory',()=>{
  const input=fixture();input.report.selections=input.report.selections.filter(q=>q.outcome!=='2'||q.fixtureId!=='synthetic-0');
  assert.equal(screenOpportunities({...input,now}).baselines[0].probabilities,null);
  input.journal.provenance.datasetAcquiredAtUtc='2026-10-10T07:00:00Z';assert.equal(screenOpportunities({...input,now}).candidates.length,0);
  const forged=fixture();forged.journal.entries[0].probabilities=[1,0,0];assert.equal(screenOpportunities({...forged,now}).candidates.length,0);
});
test('selector handles arbitrary dependence without probability multiplication or artificial offer',()=>{
  const input=fixture(),screen=screenOpportunities({...input,now}),result=selectCombination(screen,{now});
  assert.deepEqual(frechet([.6,.7]),[.2999999999999998,.6]);assert.equal(result.decision,'NO_BET');assert.equal(result.cause,'COMBINATION_EVIDENCE_INSUFFICIENT');
  assert.equal(result.combinations[0].jointProbability,null);assert.equal(result.combinations[0].actualPrice,null);
  assert.equal(result.combinations[0].jointConfidenceInterval,null);assert.equal(result.combinations[0].statisticallyValidated,false);
  assert.ok(result.combinations.every(c=>c.legs>=2&&c.legs<=4));assert.throws(()=>selectCombination(screen,{now,maxLegs:7}),/2..6/);
});
test('one bound-supported proposal needs exact actual combined price and manual leg availability',()=>{
  const input=fixture();for(const e of input.journal.entries){e.probabilities=[.95,.03,.02];e.central=e.probabilities;e.intervals95=[[.94,.96],[.02,.04],[.01,.03]];reseal(e);}
  input.report.selections=input.report.selections.filter(q=>q.fixtureId==='synthetic-0'||q.fixtureId==='synthetic-1');
  for(const q of input.report.selections)if(q.outcome==='1')q.price=1.2;
  const assessment={estimates:input.report.selections.map(q=>({quoteId:q.quoteId,manualVerification:verify(input.report,q)}))};
  const screen=screenOpportunities({...input,assessment,now}),evidence={schema:'lamultipla-accumulator-price-verification-v1',domain:'bet365.it',origin:'manual_bet365_it',
    kind:'ordinary_accumulator',availability:'available',reportSha256:fingerprint(input.report),quoteIds:screen.candidates.map(s=>s.quoteId),price:1.44,verifiedAtUtc:now,reviewer:'synthetic',evidence:'SYNTHETIC'};
  const selected=selectCombination(screen,{now,combinedPrices:[evidence]});assert.equal(selected.decision,'SHADOW_BOUND_PROPOSAL');assert.equal(selected.selected.actualStakeEUR,0);
  assert.equal(selected.selected.jointProbability,null);assert.equal(selected.selected.statisticallyValidated,false);assert.ok(selected.selected.expectedNetPerUnitBounds[0]>.05);
  assert.equal(selectCombination(screen,{now,combinedPrices:[{...evidence,price:1.01}]}).cause,'JOINT_VALUE_NOT_DEMONSTRATED');
  assert.equal(selectCombination(screen,{now,combinedPrices:[{...evidence,reportSha256:'wrong'}]}).selected,null);
  assert.equal(selectCombination(screen,{now,combinedPrices:[evidence,evidence]}).selected,null);
  assert.equal(selectCombination(screen,{now,combinedPrices:[{...evidence,availability:'unavailable'}]}).selected,null);
  assert.throws(()=>selectCombination(screen,{now:'2026-10-10T07:45:00Z'}),/expired/);
  const decision=createDecision({...input,assessment,now,combinedPrices:[evidence]});
  const results={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:'a'.repeat(40),acquiredAtUtc:'2026-10-13T00:00:00Z',
    rows:input.journal.entries.map(e=>({season:'2026-27',home:e.home,away:e.away,date:'2026-10-10',availableAtUtc:'2026-10-12T00:00:00Z',goals:[1,0]}))};
  const evaluation=evaluateShadow(decision,input.journal,results,{now:'2026-10-13T00:01:00Z'});assert.equal(evaluation.simulation.won,true);
  assert.ok(Math.abs(evaluation.simulation.netEUR-1.32)<1e-10);assert.equal(evaluation.simulation.actualStakeEUR,0);assert.equal(evaluation.forecastEvaluation.marketComparison.n,2);
});
test('same-event and shared-team combinations are excluded, maximum six stays explicit',()=>{
  const input=fixture(),screen=screenOpportunities({...input,now});screen.candidates=screen.candidates.slice(0,3);
  screen.candidates[1].fixture=screen.candidates[0].fixture;assert.equal(selectCombination(screen,{now}).counts.combinations,2);
  screen.candidates[2].fixture=screen.candidates[0].fixture;assert.equal(selectCombination(screen,{now}).counts.combinations,0);
  const extended=selectCombination(screenOpportunities({...fixture(),now}),{now,maxLegs:6});assert.ok(extended.combinations.some(c=>c.legs===6));assert.equal(extended.actualStakeEUR,0);
});
test('search cap is explicit and cannot turn truncated combinations into a selected proposal',()=>{
  const input=fixture();for(const q of input.report.selections)if(q.marketType==='1x2'&&q.period==='fulltime')q.price=12;
  const screen=screenOpportunities({...input,now});assert.equal(screen.candidates.length,30);
  const result=selectCombination(screen,{now});assert.equal(result.truncated,true);assert.equal(result.counts.combinations,20000);
  assert.equal(result.selected,null);assert.equal(result.cause,'SEARCH_BUDGET_EXCEEDED');
});
test('final decision is exclusive, preflight blocks reacquisition and preview never changes final',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-shadow-'));try{
    const input=fixture(),hash=fingerprint(input.journal),decision=createDecision({...input,now});
    const saved=await persistDecision(decision,dir);assert.equal(saved.decision.final,true);assert.equal(fingerprint(input.journal),hash);
    await assert.rejects(()=>persistDecision(decision,dir),{code:'EEXIST'});await assert.rejects(()=>assertNoDecision(decisionPath(dir,round.season,6)),/already frozen/);
    const preview=await persistDecision(decision,dir,{preview:true});assert.equal(preview.decision.final,false);assert.equal((await readSnapshot(saved.filename)).final,true);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('future scoring links original forecasts, separates simulated return and withholds revisions',()=>{
  const input=fixture(),decision={...createDecision({...input,now}),final:true};
  const results={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:'a'.repeat(40),acquiredAtUtc:'2026-10-13T00:00:00Z',
    rows:input.journal.entries.map(e=>({season:'2026-27',home:e.home,away:e.away,date:'2026-10-10',availableAtUtc:'2026-10-12T00:00:00Z',goals:[1,0]}))};
  const evaluation=evaluateShadow(decision,input.journal,results,{now:'2026-10-13T00:01:00Z'});assert.equal(evaluation.candidatesSettled,10);assert.equal(evaluation.simulation,null);assert.equal(evaluation.actualStakeEUR,0);
  const market={fixtureId:input.journal.entries[0].fixtureId,journalId:input.journal.id,entrySha256:input.journal.entries[0].entrySha256,bookmaker:'bet365.it',
    compatible:true,probabilities:[.5,.3,.2],capturedAtUtc:now};
  const paired=evaluateShadow(decision,input.journal,results,{now:'2026-10-13T00:01:00Z',markets:[market]});
  assert.equal(paired.forecastEvaluation.marketComparison.n,1);assert.equal(paired.forecastEvaluation.marketComparison.model.n,1);
  assert.equal(paired.forecastEvaluation.marketComparison.market.n,1);
  const modified=structuredClone(results);modified.rows[0].goals=[0,1];const later=evaluateShadow(decision,input.journal,modified,{now:'2026-10-13T01:00:00Z'});
  const progress=shadowProgress([decision],[evaluation,later],'2026-10-13T02:00:00Z');assert.equal(progress.conflicts.length,1);assert.equal(progress.rounds[0].forecastMetrics,null);
  assert.throws(()=>evaluateShadow({...decision,journalSha256:'wrong'},input.journal,results),/mismatch/);
});
test('public dataset refresh pins a commit, keeps previous data separate and no OddsPapi calls',async()=>{
  const license=(await fs.readFile(new URL('./fixtures/openfootball-CC0.txt',import.meta.url),'utf8')).replace(/\r\n/g,'\n'),urls=[];
  const dataset=await refreshDataset({now,clock:()=>new Date(now),fetchImpl:async url=>{
    urls.push(url);let text;
    if(url.includes('commits/master'))text=JSON.stringify({sha:'a'.repeat(40)});
    else if(url.endsWith('LICENSE.md'))text=license;
    else {const season=url.split('/').at(-2);text=JSON.stringify({name:`Italian Serie A ${season.replace('-','/')}`,matches:[{date:season.slice(0,4)+'-08-01',team1:'Synthetic A',team2:'Synthetic B',score:{ft:[1,0]}}]});}
    return {ok:true,status:200,text:async()=>text};}});
  assert.equal(urls.length,7);assert.equal(dataset.rows.length,5);assert.ok(urls.every(u=>!u.includes('oddspapi')&&!u.includes('apiKey')));
  assert.equal(dataset.commit,'a'.repeat(40));assert.equal(validateCurrentDataset(dataset,now).dataset,dataset);
  assert.throws(()=>validateCurrentDataset({...dataset,acquiredAtUtc:'2026-10-11T00:00:00Z'},now),/unobserved/);
  let calls=0;await assert.rejects(()=>refreshDataset({now,fetchImpl:async()=>{calls++;return{ok:false,status:500};}}),/500/);assert.equal(calls,1);
});
test('complete mocked cycle imports with existing quota guard, freezes real algorithm forecasts, selects and scores without publication',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-cycle-'));try {
    const input=fixture(),urls=[],imported=await importQuotes({round,directory:path.join(root,'.local/oddspapi'),key:'synthetic-local-only',clock:()=>new Date(observed),pause:async()=>{},
      fetchImpl:async url=>{urls.push(url.pathname);return{ok:true,status:200,json:async()=>url.pathname.endsWith('/account')?account():url.pathname.endsWith('/markets')?catalog:input.raw};}});
    assert.equal(imported.report.acquisition.billableAttempts,2);assert.deepEqual(urls,['/v4/account','/v4/markets','/v4/odds-by-tournaments']);
    const schedule={schema:'lamultipla-prospective-schedule-v1',season:round.season,matchday:6,events:input.journal.manifest.events};
    validateCycleSchedule(round,schedule,now);assert.throws(()=>validateCycleSchedule(round,{...schedule,matchday:7},now),/Schedule/);
    const rows=[];for(let year=2023;year<=2025;year++)for(let day=1;day<=9;day++)for(let i=0;i<10;i++) {
      const home=`Synthetic Home ${i}`,away=`Synthetic Away ${(i+day)%10}`,season=`${year}-${String(year+1).slice(-2)}`,date=`${year}-09-${String(day).padStart(2,'0')}`;
      rows.push({key:`${season}:${home}:${away}`,season,date,home,away,goals:[1+(i%3),(i+day)%2],availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()});
    }
    const dataset={schema:'lamultipla-results-dataset-v1',source:'openfootball/football.json',synthetic:true,license:'CC0-1.0',licenseSha256:'36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673',
      commit:'a'.repeat(40),acquiredAtUtc:'2026-10-10T06:40:00Z',cutoffUtc:'2026-10-10T06:40:00Z',files:[{path:'2025-26/it.1.json',sha256:'a'.repeat(64)}],rows};
    const registry={study,dataset,identity:{synthetic:true}},forward=await freezeForwardForecast({report:imported.report,schedule,registry,root,clock:()=>new Date(now)});
    assert.equal(forward.journal.counts.prospective,10);assert.equal(forward.reused,false);assert.equal(forward.journal.fit.config.rho,-.1);
    const hash=fingerprint(forward.journal),reused=await freezeForwardForecast({report:imported.report,schedule,registry,root,clock:()=>new Date(now)});assert.equal(reused.reused,true);assert.equal(fingerprint(reused.journal),hash);
    const decision=createDecision({journal:forward.journal,report:imported.report,study,now}),saved=await persistDecision(decision,path.join(root,'.local/shadow'));
    assert.equal(saved.decision.final,true);assert.equal(saved.decision.actualStakeEUR,0);assert.equal(fingerprint(await readSnapshot(forward.filename)),hash);
    const ledger=JSON.parse(await fs.readFile(path.join(root,'.local/oddspapi/quota.json'),'utf8'));assert.equal(ledger.attempts.length,2);
    assert.ok(!(await fs.readdir(root)).includes('app'));assert.equal(saved.decision.operationallyApproved,false);
    const results={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:'a'.repeat(40),acquiredAtUtc:'2026-10-13T00:00:00Z',
      rows:forward.journal.entries.map(e=>({season:'2026-27',home:e.home,away:e.away,date:'2026-10-10',availableAtUtc:'2026-10-12T00:00:00Z',goals:[1,0]}))};
    const evaluated=evaluateShadow(saved.decision,forward.journal,results,{now:'2026-10-13T00:01:00Z'});assert.equal(evaluated.forecastEvaluation.counts.settled,10);
    assert.equal(fingerprint(await readSnapshot(forward.filename)),hash);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
