import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {likelihood,minimize,fitGoals,predictGrid,bivariateGrid,bivariateLogProbability,temper} from '../scripts/lib/engine/model.mjs';
import {distribution,marketsFromGrid} from '../scripts/lib/goals/model.mjs';
import {settlementEV} from '../scripts/lib/analysis.mjs';
import {settlementAt,settlementProbabilities,jointSettlement,quoteSpec,marketReadiness} from '../scripts/lib/engine/markets.mjs';
import {walkForward,EXPERIMENT,gridMoments,comparisonCI} from '../scripts/lib/engine/study.mjs';
import {buildForecast,validateJournal,freezeEngine} from '../scripts/lib/engine/forecast.mjs';
import {freezeForwardForecast} from '../scripts/lib/shadow/pipeline.mjs';
import {manifestFromReport} from '../scripts/lib/prospective/freeze.mjs';
import {experimentalScreen} from '../scripts/lib/engine/screen.mjs';
import {evaluateEngine,engineProgress,acceptance} from '../scripts/lib/engine/evaluate.mjs';
import {engineCodeIdentity} from '../scripts/lib/engine/registry.mjs';
import {writeExclusive,readSnapshot,digest} from '../scripts/lib/prospective/store.mjs';
import {sample,catalog,round} from './fixtures/oddspapi.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
import {verificationTemplate} from '../scripts/lib/availability.mjs';
import {ROOT} from '../scripts/lib/private-store.mjs';
// Every result, fixture, price and probability used in these tests is SYNTHETIC.
const clock='2026-10-15T06:00:00.000Z',observed='2026-10-15T06:01:00.000Z';
function rows(){const out=[];for(let y=2022;y<=2025;y++)for(let d=1;d<=8;d++)for(let i=0;i<10;i++){
  const season=`${y}-${String(y+1).slice(-2)}`,date=`${y}-09-${String(d).padStart(2,'0')}`,home=`Synthetic Home ${i}`,away=`Synthetic Away ${(i+d)%10}`;
  out.push({key:`${season}:${home}:${away}`,season,date,home,away,goals:[(i+d)%3,(2*i+d)%3],availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()});}return out;}
const config=kind=>({kind,halfLife:365,ridge:20});
async function workflow(){
  const raw=sample();for(const f of raw){f.startTime='2026-10-17T13:00:00.000Z';for(const m of Object.values(f.bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))for(const p of Object.values(o.players))p.changedAt=observed;}
  const futureRound={...round,matchday:7,fromUtc:'2026-10-17T00:00:00Z',toUtc:'2026-10-20T00:00:00Z'};
  const initial=buildReport(raw,catalog,{round:futureRound,observedAt:observed,source:'synthetic_test'});
  const schedule={schema:'lamultipla-prospective-schedule-v1',season:'2026/27',matchday:7,events:initial.coverage.map(c=>({fixtureId:c.fixtureId,home:c.fixture[0],away:c.fixture[1],kickoffUtc:'2026-10-17T13:00:00.000Z'}))};
  const dataset={schema:'lamultipla-results-dataset-v1',synthetic:true,source:'openfootball/football.json',commit:'a'.repeat(40),license:'CC0-1.0',licenseSha256:'36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673',
    files:[{path:'2025-26/it.1.json',sha256:'a'.repeat(64)}],acquiredAtUtc:'2026-10-14T00:00:00Z',cutoffUtc:'2026-10-14T00:00:00Z',rows:rows()};
  const identity=await engineCodeIdentity(ROOT),study={schema:'lamultipla-engine-development-v2',synthetic:true,experiment:EXPERIMENT,selected:Object.fromEntries(['dc','bivariate'].map(k=>[k,{config:config(k),temperature:1}])),
    generatedAtUtc:'2026-10-14T00:00:00Z',validFor:'DEVELOPMENT_AND_CALIBRATION_ONLY',validatedMarkets:[],operationallyApproved:false,modelCodeSha256:identity.sha256,protocolSha256:identity.protocolSha256};
  const journal=buildForecast(study,dataset,schedule,{clock:()=>new Date(clock)});
  initial.round={...initial.round,season:'2026/27',matchday:7,verified:true};initial.fetchedAtUtc=observed;
  for(const q of initial.selections){q.kickoffUtc='2026-10-17T13:00:00.000Z';q.observedAtUtc=observed;q.changedAt=observed;}
  return {journal,study,dataset,schedule,report:initial};
}
test('full DC and bivariate analytic likelihood gradients agree with numeric derivatives',()=>{
  const train=[{home:'A',away:'B',goals:[0,0],date:'2026-09-01'},{home:'B',away:'A',goals:[0,1],date:'2026-09-02'},
    {home:'A',away:'B',goals:[1,0],date:'2026-09-03'},{home:'B',away:'A',goals:[1,1],date:'2026-09-04'},{home:'A',away:'B',goals:[3,2],date:'2026-09-05'}];
  for(const kind of ['dc','bivariate']){const objective=likelihood(train,'2026-10-01T00:00:00Z',['A','B'],config(kind)),x=[.1,.2,.05,-.03,.02,-.01,kind==='dc'?.12:-1.2],g=objective(x).gradient;
    for(let k=0;k<x.length;k++){const plus=[...x],minus=[...x];plus[k]+=1e-6;minus[k]-=1e-6;assert.ok(Math.abs(g[k]-(objective(plus).cost-objective(minus).cost)/2e-6)<1e-5);}}
  const result=minimize(x=>({cost:(x[0]-2)**2,gradient:[2*(x[0]-2)]}),[0]);assert.equal(result.converged,true);assert.ok(Math.abs(result.coefficients[0]-2)<1e-7);
});
test('bivariate mass, marginals and covariance match analytic moments and independent limit',()=>{
  const g=bivariateGrid(1.2,.8,.3),m=gridMoments(g);assert.ok(Math.abs(m.home-1.5)<1e-7);assert.ok(Math.abs(m.away-1.1)<1e-7);
  assert.ok(Math.abs(m.covariance-.3)<1e-7);assert.ok(Math.abs(g[2][3]-Math.exp(bivariateLogProbability(2,3,1.2,.8,.3).logProbability))<1e-10);
  assert.deepEqual(bivariateGrid(1.2,.8,0).map(r=>r.map(p=>Math.round(p*1e10))),distribution(1.2,.8).map(r=>r.map(p=>Math.round(p*1e10))));
  const t=temper(g,.8);assert.ok(Math.abs(t.flat().reduce((s,v)=>s+v,0)-1)<1e-10);assert.equal(temper(g,0),null);
});
test('candidate fits converge without future rows and refuse reused test periods',()=>{
  const train=rows(),cutoff='2026-10-01T00:00:00Z';for(const kind of ['dc','bivariate']){const fit=fitGoals(train,cutoff,config(kind));assert.equal(fit.converged,true);assert.ok(fit.cost<=fit.initialCost);assert.ok(predictGrid(fit,'Synthetic Home 0','Synthetic Away 0'));
    assert.throws(()=>fitGoals([...train,{...train[0],availableAtUtc:'2026-11-01T00:00:00Z'}],cutoff,config(kind)),/future/);}
  assert.throws(()=>walkForward(train,['2024-25'],config('dc')),/Consumed/);
});
test('Asian quarter-lines, DNB and coherent joint events retain push and partial settlements',()=>{
  assert.equal(settlementAt(1,1,{family:'asianHandicap',side:'home',line:-.25}),'halfLoss');
  assert.equal(settlementAt(1,1,{family:'asianHandicap',side:'home',line:.25}),'halfWin');
  assert.equal(settlementAt(2,1,{family:'totals',line:2.75,outcome:'Over'}),'halfWin');
  assert.equal(settlementAt(1,1,{family:'totals',line:2.25,outcome:'Over'}),'halfLoss');
  const g=distribution(1.4,1),p=marketsFromGrid(g),dnb=settlementProbabilities(g,{family:'drawNoBet',side:'home'});
  assert.ok(Math.abs(dnb.push-p.oneXTwo[1])<1e-10);assert.ok(Math.abs(settlementEV(2,dnb)-(dnb.win-dnb.loss))<1e-10);
  assert.ok(Math.abs(settlementProbabilities(g,{family:'doubleChance',outcome:'1X'}).win-(p.oneXTwo[0]+p.oneXTwo[1]))<1e-10);
  const joint=jointSettlement(g,[{family:'btts',outcome:'Yes'},{family:'totals',line:1.5,outcome:'Over'}],[2,2]);assert.ok(Math.abs(joint.allFullWin-p.btts)<1e-10);
  assert.ok(Math.abs(joint.allFullWin-p.btts*marketsFromGrid(g,1.5).over)>.01);assert.equal(joint.bookmakerCombinedPrice,null);
  assert.equal(quoteSpec({period:'fulltime',playerProp:false,playerKey:'0',marketType:'totals-corners',marketName:'Corners',line:8.5,outcome:'Over'}),null);
  assert.equal(quoteSpec({period:'fulltime',playerProp:false,playerKey:'0',marketType:'spreads',marketName:'Asian Handicap',line:-.25,outcome:'1'}),null);
});
test('rho alone cannot improve Over2.5 at fixed goal rates, while BTTS changes coherently',()=>{
  const negative=marketsFromGrid(distribution(1.4,1,-.1)),positive=marketsFromGrid(distribution(1.4,1,.1));
  assert.ok(Math.abs(negative.over-positive.over)<1e-10);assert.ok(negative.btts>positive.btts);
  assert.ok(Math.abs(negative.oneXTwo.reduce((s,p)=>s+p,0)-1)<1e-10);
});
test('per-market activation requires its own prospective evidence and never grants operational approval',()=>{
  const good={pairedN:500,conflicted:false,confirmatoryFrame:{closed:true,pairedN:500},acceptance:{dc:{btts:{statisticalGatePassed:true},over:{statisticalGatePassed:true}}}};
  assert.equal(marketReadiness({family:'btts',outcome:'Yes'},good,'dc').state,'STATISTICAL_GATE_PASSED_REVIEW_REQUIRED');
  assert.equal(marketReadiness({family:'totals',line:3.5,outcome:'Over'},good,'dc').state,'EXPLORATORY_SEPARATE_PROTOCOL_REQUIRED');
  assert.equal(marketReadiness({family:'btts',outcome:'Yes'},good,'dc').operationallyApproved,false);
  assert.equal(marketReadiness({family:'btts',outcome:'Yes'},{...good,confirmatoryFrame:{closed:false,pairedN:500}},'dc').state,'PROSPECTIVE_VALIDATION_PENDING');
  assert.equal(acceptance([],10,0,'dc').btts.statisticalGatePassed,false);
  const records=Array.from({length:20},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,model:{btts:.7},v1:{btts:.5},y:{btts:i%2}}));
  assert.equal(comparisonCI(records,'btts','v1',{confidence:.9875}).confidence,.9875);
});
let savedWorkflow;
test('new cohort freezes distributions, screens the real pipeline with mocks and never touches round6',async()=>{
  savedWorkflow=await workflow();const {journal,study,dataset,schedule,report}=savedWorkflow;assert.equal(journal.counts.forecasted,10);validateJournal(journal,study);
  assert.throws(()=>buildForecast(study,dataset,{...schedule,matchday:6},{clock:()=>new Date(clock)}),/round6/);
  const hash=digest(journal),screen=experimentalScreen({journal,study,report,now:'2026-10-15T06:02:00Z'});assert.ok(screen.counts.quotesExamined>=30);
  assert.equal(screen.records.every(r=>r.eligibleForSelector===false),true);assert.equal(screen.decision,'NO_BET');assert.equal(digest(journal),hash);
  const q=report.selections.find(q=>q.marketType==='1x2');q.active=false;
  const verification={...verificationTemplate(report,q),availability:'available',observedPrice:q.price,verifiedAtUtc:'2026-10-15T06:02:00Z',reviewer:'synthetic',evidence:'SYNTHETIC ONLY'};
  const assessment={estimates:[{quoteId:q.quoteId,manualVerification:verification}]};
  const overridden=experimentalScreen({journal,study,report,assessment,now:'2026-10-15T06:03:00Z'}).records.filter(r=>r.quoteId===q.quoteId);
  assert.equal(overridden.every(r=>r.availability.override),true);assert.equal(q.active,false);
  verification.availability='unavailable';assert.ok(experimentalScreen({journal,study,report,assessment,now:'2026-10-15T06:03:00Z'}).records.filter(r=>r.quoteId===q.quoteId).every(r=>r.reasons.includes('unavailable_or_reserved')));
  assert.ok(experimentalScreen({journal,study,report,now:'2026-10-15T07:02:00Z'}).globalIssues.includes('report_expired_or_before_forecast'));
});
test('future evaluation and monitoring detect revisions and cannot promote a ten-match sample',()=>{
  const {journal,study}=savedWorkflow,results={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:'a'.repeat(40),acquiredAtUtc:'2026-10-20T00:00:00Z',
    rows:journal.entries.map(e=>({season:'2026-27',date:'2026-10-17',home:e.home,away:e.away,goals:[1,0],availableAtUtc:'2026-10-19T00:00:00Z'}))};
  const evaluation=evaluateEngine(journal,study,results,{now:'2026-10-20T01:00:00Z'});assert.equal(evaluation.records.length,10);
  const progress=engineProgress([journal],[evaluation]);assert.equal(progress.cohorts[journal.studySha256].acceptance,null);
  assert.equal(progress.cohorts[journal.studySha256].monitoringType,'DESCRIPTIVE_ROLLING_NOT_A_CONFIRMATORY_TEST');
  const revised=structuredClone(results);revised.rows[0].goals=[0,1];const later=evaluateEngine(journal,study,revised,{now:'2026-10-20T02:00:00Z'});
  assert.equal(engineProgress([journal],[evaluation,later]).conflicts.length,1);
  assert.equal(engineProgress([journal],[evaluation,later]).cohorts[journal.studySha256].acceptance,null);
  assert.throws(()=>evaluateEngine(journal,study,results,{now:'2026-10-15T00:00:00Z'}),/Observed/);
  assert.throws(()=>engineProgress([journal,journal],[evaluation]),/Duplicate/);
});
test('confirmatory window is fixed to sixty consecutive rounds; later scores cannot repeat the test',()=>{
  const journals=[],evaluations=[],prediction={oneXTwo:[.4,.3,.3],btts:.5,over:.5};
  for(let i=0;i<61;i++){
    const n=i+6,start=2026+Math.floor(n/38),season=`${start}/${String(start+1).slice(-2)}`,matchday=n%38+1;
    const date=new Date(Date.parse('2026-10-17T13:00:00Z')+i*7*86400000).toISOString();
    const entries=Array.from({length:10},(_,j)=>({fixtureId:`synthetic-${i}-${j}`,kickoffUtc:date}));
    const journal={id:`synthetic-round-${i}`,studySha256:'synthetic-fixed-study',manifest:{season,matchday},entries,counts:{planned:10,forecasted:10}};
    journals.push(journal);evaluations.push({journalSha256:digest(journal),studySha256:journal.studySha256,evaluatedAtUtc:new Date(Date.parse(date)+48*3600000).toISOString(),
      observed:entries.map(e=>({fixtureId:e.fixtureId,goals:[1,1]})),records:entries.map(e=>({fixtureId:e.fixtureId,date:date.slice(0,10),
        y:{oneXTwo:1,btts:1,over:0},dc:prediction,bivariate:prediction,v1:prediction,empirical:prediction,leaguePoisson:prediction}))});
  }
  const now='2028-06-01T00:00:00Z',hash='synthetic-fixed-study';
  assert.equal(engineProgress(journals.slice(0,59),evaluations,{now}).cohorts[hash].acceptance,null);
  const first=engineProgress(journals.slice(0,60),evaluations,{now}).cohorts[hash];assert.equal(first.confirmatoryFrame.closed,true);assert.equal(first.confirmatoryFrame.pairedN,600);
  assert.deepEqual(engineProgress(journals,evaluations,{now}).cohorts[hash].acceptance,first.acceptance);
  assert.equal(engineProgress(journals.filter((_,i)=>i!==10),evaluations,{now}).cohorts[hash].acceptance,null);
});
test('future cycle freezes independent models before quotes, then binds report without replacement',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-forward-'));try{
    const {study,dataset,schedule,report}=savedWorkflow,registry={dataset,study:{validationCompletedAtUtc:'2026-10-14T00:00:00Z'},identity:{synthetic:true}};
    const forward=await freezeForwardForecast({schedule,registry,root:temp,clock:()=>new Date(clock)}),hash=digest(forward.journal);
    assert.ok(Date.parse(forward.journal.generatedAtUtc)<Date.parse(report.fetchedAtUtc));manifestFromReport(report,schedule);
    const reused=await freezeForwardForecast({report,schedule,registry,root:temp,clock:()=>new Date(observed)});assert.equal(reused.reused,true);assert.equal(digest(reused.journal),hash);
    const engine=await freezeEngine({root:temp,study,dataset,schedule,clock:()=>new Date(clock)}),engineHash=digest(engine.journal);
    const repeat=await freezeEngine({root:temp,study,dataset,schedule,clock:()=>new Date(observed)});assert.equal(repeat.reused,true);assert.equal(digest(repeat.journal),engineHash);
    const wrong=structuredClone(schedule);wrong.events[0].kickoffUtc='2026-10-18T13:00:00Z';await assert.rejects(()=>freezeEngine({root:temp,study,dataset,schedule:wrong,clock:()=>new Date(observed)}),/conflict/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('CLI multi-market screen and evaluation use immutable artifacts, with no network or publication',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-engine-'));try{
    const {journal,study,report}=savedWorkflow;await writeExclusive(path.join(temp,'study.json'),study);await writeExclusive(path.join(temp,'journal.json'),journal);
    await fs.writeFile(path.join(temp,'report.json'),JSON.stringify(report));
    const result=await promisify(execFile)(process.execPath,[path.join(ROOT,'scripts/model-engine.mjs'),'--screen','--study',path.join(temp,'study.json'),'--journal',path.join(temp,'journal.json'),'--report',path.join(temp,'report.json')]);
    assert.match(result.stdout,/NO_BET/);assert.match(result.stdout,/report_expired_or_before_forecast|forecast_expired_or_future/);
    assert.equal(digest(await readSnapshot(path.join(temp,'journal.json'))),digest(journal));await assert.rejects(()=>writeExclusive(path.join(temp,'journal.json'),journal),{code:'EEXIST'});
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
