import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {recentForm} from '../scripts/lib/context/history.mjs';
import {buildContext,contextGate,evidenceTemplate,emptyBundle} from '../scripts/lib/context/dossier.mjs';
import {validateBundle} from '../scripts/lib/context/evidence.mjs';
import {syntheticContextDataset,syntheticContextBundle} from './fixtures/context.mjs';
import {sample,catalog,round} from './fixtures/oddspapi.mjs';
import {buildReport,fingerprint} from '../scripts/lib/odds-report.mjs';
import {sealJournal,CONFIG} from '../scripts/lib/prospective/freeze.mjs';
import {verificationTemplate} from '../scripts/lib/availability.mjs';
import {createDecision} from '../scripts/lib/shadow/pipeline.mjs';
import {evaluateShadow,shadowProgress} from '../scripts/lib/shadow/evaluate.mjs';
import {writeExclusive,readSnapshot,digest} from '../scripts/lib/prospective/store.mjs';
import {ROOT} from '../scripts/lib/private-store.mjs';
// All prices, fixtures, persons and probabilities in these tests are SYNTHETIC.
const now='2026-10-16T12:00:00.000Z';
function input(){
  const raw=sample();for(const f of raw){f.startTime='2026-10-17T13:00:00.000Z';for(const m of Object.values(f.bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))for(const p of Object.values(o.players))p.changedAt=now;}
  const report=buildReport(raw,catalog,{round:{...round,matchday:7,fromUtc:'2026-10-17T00:00:00Z',toUtc:'2026-10-20T00:00:00Z'},observedAt:now,source:'synthetic_test'});
  for(const q of report.selections)if(q.marketType==='1x2'&&q.outcome==='1')q.price=1.2;
  const manifest={season:'2026/27',matchday:7,events:report.coverage.map(c=>({fixtureId:c.fixtureId,home:c.fixture[0],away:c.fixture[1],kickoffUtc:c.kickoffUtc,season:'2026/27',matchday:7}))};
  const dataset=syntheticContextDataset(manifest,'2026-10-16T11:00:00.000Z'),bundle=syntheticContextBundle(manifest,now);
  const study={synthetic:true,validationCompletedAtUtc:'2026-10-09T23:00:00Z',acceptance:{oneXTwo:{retrospectiveAccepted:true}}};
  const journal=sealJournal({model:{converged:true,config:CONFIG,cutoffUtc:'2026-10-01T00:00:00.000Z'},forecasts:manifest.events.map(e=>({...e,central:[.95,.03,.02],intervals95:[[.94,.96],[.02,.04],[.01,.03]],
    uncertainty:{replicates:40,failures:0,sufficient:true},baselines:{empirical:[.4,.3,.3],leaguePoisson:[.4,.3,.3]}}))},manifest,{studySha256:fingerprint(study),datasetAcquiredAtUtc:dataset.acquiredAtUtc},'2026-10-16T11:58:00.000Z');
  return {raw,report,manifest,dataset,bundle,journal,study};
}
test('recent league form is point-in-time, split by venue and never interprets dates as actual rest',()=>{
  const {dataset,manifest}=input(),team=manifest.events[0].home;
  const future={...dataset.rows[0],key:'future',date:'2026-10-17',availableAtUtc:'2026-10-19T00:00:00Z',goals:[30,0]};
  const base=recentForm(dataset.rows,team,{atUtc:now}),extended=recentForm([...dataset.rows,future],team,{atUtc:now});assert.deepEqual(base,extended);
  assert.equal(base.windows[5].n,5);assert.equal(base.actualRestHours,null);assert.equal(base.scope,'SERIE_A_ONLY');
  assert.ok(recentForm(dataset.rows,team,{atUtc:now,role:'home'}).windows[5].matches.every(r=>r.role==='home'));
  assert.equal(recentForm([],team,{atUtc:now}).windows[5].pointsPerMatch,null);
});
test('automatic dossier marks missing absences and partial calendar explicitly, never no injuries',()=>{
  const {manifest,dataset,journal}=input(),context=buildContext({manifest,dataset,now});
  assert.equal(context.counts.readyForShadowReview,0);assert.equal(context.entries[0].calendar[manifest.events[0].home].complete,false);
  assert.equal(context.entries[0].topics[manifest.events[0].home].injuries.status,'REVIEW_REQUIRED');assert.equal(contextGate(context,journal,now).eligibleFixtureIds.length,0);
  assert.equal(context.probabilityAdjustment,null);assert.equal(context.sourceData,'synthetic_test');
  const template=evidenceTemplate(manifest,now);assert.equal(template.required.length,80);assert.equal(template.reviews.length,0);
});
test('reviewed private context can pass a shadow gate without changing a frozen probability or interval',()=>{
  const {manifest,dataset,bundle,journal}=input(),before=digest(journal),context=buildContext({manifest,dataset,evidence:bundle,now});
  const gate=contextGate(context,journal,now);assert.equal(gate.eligibleFixtureIds.length,10);assert.equal(gate.probabilityAdjustment,null);assert.equal(gate.operationallyApproved,false);
  assert.ok(gate.entries.every(e=>e.observedAfterForecast));assert.equal(digest(journal),before);
  assert.equal(context.entries[0].observations[0].fact.data.kind,'probable');
});
test('stale/future evidence, wrong competition and unmatched club sources cannot be promoted',()=>{
  for(const edit of [b=>b.facts[0].capturedAtUtc='2026-10-16T12:01:00Z',b=>b.facts[0].statusAsOfUtc='2026-10-10T00:00:00Z',
    b=>b.facts[0].competition='COPPA_ITALIA',b=>b.sources[1].team='Wrong Club',b=>b.facts[0].publishedAtUtc='2026-10-17T00:00:00Z']){
    const {manifest,dataset,bundle}=input();edit(bundle);const context=buildContext({manifest,dataset,evidence:bundle,now});assert.equal(context.entries[0].state,'CONTEXT_REVIEW_REQUIRED');}
  const {manifest,dataset,bundle,journal}=input(),context=buildContext({manifest,dataset,evidence:bundle,now});
  assert.equal(contextGate(context,journal,'2026-10-17T12:01:00Z').eligibleFixtureIds.length,0);
  assert.throws(()=>validateBundle({...emptyBundle(),probabilities:[.5,.3,.2]},now),/Probabilities/);
  bundle.sources[0].rights.automatedExtraction=true;assert.throws(()=>validateBundle(bundle,now),/rights/);
});
test('availability conflicts and invalid starting elevens remain visible, not resolved by latest publication',()=>{
  const {manifest,dataset,bundle}=input(),e=manifest.events[0],sourceId=bundle.sources[1].id;
  for(const [id,status] of [['out','out'],['available','available']])bundle.facts.push({id,fixtureId:e.fixtureId,team:e.home,category:'injuries',competition:'ITA_SERIE_A',sourceId,
    capturedAtUtc:now,statusAsOfUtc:now,publishedAtUtc:now,data:{playerId:'synthetic-player',playerName:'Synthetic Player',status}});
  const context=buildContext({manifest,dataset,evidence:bundle,now});assert.ok(context.entries[0].topics[e.home].injuries.reasons.includes('conflicting_player_availability'));
  const duplicate=structuredClone(bundle);duplicate.facts[0].data.players[1].id=duplicate.facts[0].data.players[0].id;
  assert.ok(buildContext({manifest,dataset,evidence:duplicate,now}).entries[0].observations[0].reasons.includes('lineup_not_exact_or_official'));
});
test('all-competition cup congestion is recorded separately from rest and reschedules block identity',()=>{
  const {manifest,dataset,bundle}=input(),e=manifest.events[0],sourceId=bundle.sources[1].id;
  const match={id:'synthetic-cup',fixtureId:'synthetic-cup',competition:'UEFA_CL',home:e.home,away:'Synthetic European Opponent',sourceId,
    kickoffUtc:'2026-10-14T19:00:00Z',endedAtUtc:'2026-10-14T21:00:00Z',status:'finished',capturedAtUtc:now};bundle.calendar.push(match);
  const context=buildContext({manifest,dataset,evidence:bundle,now}),cal=context.entries[0].calendar[e.home];assert.equal(cal.kickoffGapHours,66);assert.equal(cal.actualRestHours,64);
  assert.equal(cal.matchesPrevious7Days,1);assert.equal(cal.complete,true);assert.equal(context.entries[0].state,'READY_FOR_SHADOW_REVIEW');
  const partial=structuredClone(bundle);partial.reviews.find(r=>r.category==='calendar'&&r.team===e.home).allCompetitionsChecked=false;
  assert.equal(buildContext({manifest,dataset,evidence:partial,now}).entries[0].calendar[e.home].complete,false);
  bundle.calendar.push({...match,id:'changed-target',fixtureId:e.fixtureId,away:e.away,kickoffUtc:'2026-10-18T13:00:00Z',endedAtUtc:null,status:'scheduled'});
  assert.ok(buildContext({manifest,dataset,evidence:bundle,now}).entries[0].reasons.some(r=>r.includes('target_schedule_changed')));
});
test('additional turnover needs a review of the exact team and source, stale history cannot be relabelled current',()=>{
  const {manifest,dataset,bundle,journal}=input(),e=manifest.events[0],sourceId=bundle.sources[1].id;
  bundle.facts.push({id:'turnover',fixtureId:e.fixtureId,team:e.home,category:'turnover',competition:'ITA_SERIE_A',sourceId,
    capturedAtUtc:now,statusAsOfUtc:now,data:{kind:'reported_expected'}});
  const review={id:'other-review',fixtureId:e.fixtureId,team:e.away,category:'other',status:'checked',sourceIds:[sourceId],reviewedAtUtc:now,reviewer:'synthetic',
    uncertaintyAcknowledged:true,uncertaintyNote:'SYNTHETIC expected rotation, no probability correction'};bundle.reviews.push(review);
  assert.equal(buildContext({manifest,dataset,evidence:bundle,now}).entries[0].state,'CONTEXT_REVIEW_REQUIRED');
  review.team=e.home;const context=buildContext({manifest,dataset,evidence:bundle,now});assert.equal(context.entries[0].state,'READY_FOR_SHADOW_REVIEW');
  review.sourceIds=['league'];assert.equal(buildContext({manifest,dataset,evidence:bundle,now}).entries[0].state,'CONTEXT_REVIEW_REQUIRED');
  const stale={...context,datasetAcquiredAtUtc:'2026-10-10T00:00:00Z'};
  assert.equal(contextGate(stale,journal,now).eligibleFixtureIds.length,0);
  assert.ok(contextGate(stale,journal,now).entries[0].reasons.includes('context_history_refresh_required'));
});
test('confirmed lineup cannot silently contradict an out player; finished calendar must already be observed',()=>{
  const {manifest,dataset,bundle}=input(),e=manifest.events[0],lineup=bundle.facts[0];lineup.data.kind='confirmed';
  bundle.facts.push({id:'out-player',fixtureId:e.fixtureId,team:e.home,category:'injuries',competition:'ITA_SERIE_A',sourceId:lineup.sourceId,
    capturedAtUtc:now,statusAsOfUtc:now,data:{playerId:lineup.data.players[0].id,playerName:lineup.data.players[0].name,status:'out'}});
  const contradictory=buildContext({manifest,dataset,evidence:bundle,now});assert.ok(contradictory.entries[0].reasons.some(r=>r.endsWith(':unavailable_player_in_confirmed_lineup')));
  bundle.calendar.push({id:'unobserved-finish',fixtureId:'synthetic-cup',competition:'UEFA_CL',home:e.home,away:'Synthetic Opponent',sourceId:lineup.sourceId,
    kickoffUtc:'2026-10-14T19:00:00Z',endedAtUtc:'2026-10-14T21:00:00Z',status:'finished',capturedAtUtc:'2026-10-14T20:00:00Z'});
  assert.ok(buildContext({manifest,dataset,evidence:bundle,now}).entries[0].calendar[e.home].issues.includes('calendar_invalid_or_unobserved_match'));
});
test('context gates the selector while retaining raw EV opportunities and exact inactive overrides',()=>{
  const data=input(),{report,journal,study,manifest,dataset,bundle}=data;
  const q=report.selections.find(q=>q.marketType==='1x2'&&q.outcome==='1');q.active=false;
  const assessment={estimates:report.selections.map(q=>({quoteId:q.quoteId,manualVerification:{...verificationTemplate(report,q),availability:'available',observedPrice:q.price,verifiedAtUtc:now,reviewer:'synthetic',evidence:'SYNTHETIC'}}))};
  const before=digest({report,journal}),missing=createDecision({report,journal,study,assessment,now});assert.equal(missing.noBetCause,'CONTEXT_REVIEW_REQUIRED');
  assert.equal(missing.opportunities.candidates.length,10);assert.equal(missing.contextGate.contextReadyCandidates,0);
  const context=buildContext({manifest,dataset,evidence:bundle,now}),ready=createDecision({report,journal,study,assessment,context,now});
  assert.equal(ready.contextGate.contextReadyCandidates,10);assert.deepEqual(ready.opportunities,missing.opportunities);assert.equal(digest({report,journal}),before);assert.equal(q.active,false);
  assert.equal(ready.actualStakeEUR,0);assert.equal(ready.noBetCause,'SELECTION_REVIEW_REQUIRED');
  assert.equal(ready.selectionGate.eligibleQuoteIds.length,0);assert.equal(ready.selectionGate.reasonCounts.settlement_rules_not_verified,10);
  assert.throws(()=>contextGate({...context,manifestSha256:'wrong'},journal,now),/mismatch/);
});
test('legacy frozen decisions still evaluate; context-ready cohorts have separate monitoring',()=>{
  const {report,journal,study,manifest,dataset,bundle}=input(),context=buildContext({manifest,dataset,evidence:bundle,now}),modern={...createDecision({report,journal,study,context,now}),final:true};
  const legacy=structuredClone(modern);delete legacy.context;delete legacy.contextGate;delete legacy.contextPolicyVersion;
  const results={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:'a'.repeat(40),acquiredAtUtc:'2026-10-20T00:00:00Z',
    rows:journal.entries.map(e=>({season:'2026-27',home:e.home,away:e.away,date:'2026-10-17',availableAtUtc:'2026-10-19T00:00:00Z',goals:[1,0]}))};
  const oldHash=digest(legacy),old=evaluateShadow(legacy,journal,results,{now:'2026-10-20T00:01:00Z'}),current=evaluateShadow(modern,journal,results,{now:'2026-10-20T00:01:00Z'});
  assert.equal(old.forecastEvaluation.metrics.model.n,10);assert.equal(digest(legacy),oldHash);
  assert.equal(Object.keys(shadowProgress([legacy,modern],[old,current],'2026-10-20T00:02:00Z').versions).length,2);
});
test('local context CLI produces immutable labelled snapshots, no API and no journal replacement',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-context-'));try{
    await fs.cp(path.join(ROOT,'scripts'),path.join(temp,'scripts'),{recursive:true});await fs.mkdir(path.join(temp,'docs'));
    await fs.copyFile(path.join(ROOT,'docs/protocollo-contesto-v1.md'),path.join(temp,'docs/protocollo-contesto-v1.md'));
    const {dataset,manifest,journal}=input(),original=digest(journal);dataset.acquiredAtUtc=new Date(Date.now()-3600000).toISOString();dataset.cutoffUtc=dataset.acquiredAtUtc;await fs.writeFile(path.join(temp,'dataset.json'),JSON.stringify(dataset));await fs.writeFile(path.join(temp,'schedule.json'),JSON.stringify(manifest));
    const cli=(...args)=>promisify(execFile)(process.execPath,[path.join(temp,'scripts/context.mjs'),...args],{cwd:temp});
    await cli('--template','--schedule',path.join(temp,'schedule.json'));
    const {stdout}=await cli('--build','--dataset',path.join(temp,'dataset.json'),'--schedule',path.join(temp,'schedule.json'));
    const filename=stdout.match(/Contesto privato: (.+)/)[1],context=await readSnapshot(filename);assert.equal(context.sourceData,'synthetic_test');assert.equal(context.counts.readyForShadowReview,0);
    assert.match(context.provenance.contextCodeSha256,/^[a-f0-9]{64}$/);await assert.rejects(()=>writeExclusive(filename,context),{code:'EEXIST'});
    const history=await cli('--history','--dataset',path.join(temp,'dataset.json'));assert.match(history.stdout,/probabilityAdjustment":null/);assert.equal(digest(journal),original);
    await assert.rejects(()=>cli('--build','--as-of',now),/Command failed/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
