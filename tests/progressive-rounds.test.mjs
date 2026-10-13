// SYNTHETIC ONLY. This exercises scheduling/replay, not model performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sample,catalog} from './fixtures/oddspapi.mjs';
import {syntheticContextDataset,syntheticContextBundle} from './fixtures/context.mjs';
import {buildContext} from '../scripts/lib/context/dossier.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
import {verificationTemplate} from '../scripts/lib/availability.mjs';
import {settlementTemplate} from '../scripts/lib/decision/gates.mjs';
import {createDecision,decisionPath} from '../scripts/lib/shadow/pipeline.mjs';
import {sealJournal,CONFIG,journalId} from '../scripts/lib/prospective/freeze.mjs';
import {digest,envelope,readSnapshot,writeExclusive} from '../scripts/lib/prospective/store.mjs';
import {evaluateJournal,progressiveMetrics} from '../scripts/lib/prospective/evaluate.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {roundManagerTick,reconcileCalendar} from '../scripts/lib/orchestration/round-manager.mjs';
import {PROGRESSIVE_POLICY,timing,proposalExpiry} from '../scripts/lib/orchestration/progressive-policy.mjs';
import {persistProgressiveDecision,closeProgressiveRound,writeSame,attemptDirectory} from '../scripts/lib/shadow/progressive.mjs';
import {enqueueDelivery,readOutbox} from '../scripts/lib/private/outbox.mjs';
import {keyFingerprint,base64url,verifyDelivery,signDelivery} from '../shared/private-delivery.mjs';
import {parseExperimentalEnvelope,parseDecisionEnvelope} from '../shared/decision-v4.mjs';
import {parseBackup} from '../shared/experimental-store.mjs';
import {ensureShadowReception} from '../scripts/lib/private/reception-ready.mjs';
import {progressiveAndDeliveryTick} from '../scripts/lib/orchestration/progressive-runner.mjs';
import {checkEvaluationReadiness} from '../scripts/prospective-readiness.mjs';
import {CALENDAR_LICENSE_SHA256} from '../scripts/lib/orchestration/calendar-discovery.mjs';
import {analysisTick} from '../scripts/lib/orchestration/analysis-workflow.mjs';
import {progressiveAdapters} from '../scripts/lib/orchestration/progressive-adapters.mjs';
import {windowsTaskXml} from '../scripts/prepare-windows-task.mjs';
import {ROOT} from '../scripts/lib/private-store.mjs';

const friday='2026-10-16T12:45:00.000Z',saturday='2026-10-17T07:00:00.000Z',sunday='2026-10-18T07:00:00.000Z',monday='2026-10-19T12:45:00.000Z';
function schedule(){
  return {schema:'lamultipla-prospective-schedule-v1',season:'2026/27',matchday:7,events:Array.from({length:10},(_,i)=>({
    fixtureId:'id'+(1000+i),home:'Synthetic Home '+i,away:'Synthetic Away '+i,kickoffUtc:i===0?'2026-10-16T18:45:00.000Z':i<=3?'2026-10-17T13:00:00.000Z':i<=7?'2026-10-18T13:00:00.000Z':'2026-10-19T18:45:00.000Z'}))};
}
async function setup(t,{offer='2026-10-17',ambiguous=false,missingRules=false}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-progressive-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'docs'));await fs.copyFile(path.join(ROOT,PROGRESSIVE_POLICY.protocolPath),path.join(root,PROGRESSIVE_POLICY.protocolPath));
  let at=friday;const counts={calendar:0,quotes:0,forecast:0,decision:0,queue:0},full=schedule(),frames=path.join(root,'.local/SYNTHETIC-outbox');
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',pair.publicKey)),keyId=await keyFingerprint(spki);
  const trust={readerUid:'synthetic-reader',applicationId:'it.personale.lamultipla.collaudo',channel:'synthetic_shadow',keys:{[keyId]:spki}};
  const study={schema:'lamultipla-goals-study-v1',synthetic:true,validationCompletedAtUtc:'2026-10-09T23:00:00Z',acceptance:{oneXTwo:{retrospectiveAccepted:true}}};
  const inputs={studyFile:{file:'unused-synthetic-source',value:study}},clock=()=>new Date(at);
  const collect=async()=>{
    counts.calendar++;const fixtures=full.events.map(e=>({fixtureId:e.fixtureId,sportId:10,tournamentId:23,seasonId:123,statusId:0,
      participant1Name:e.home,participant2Name:e.away,startTime:e.kickoffUtc,updatedAt:'2026-10-13T18:20:00.000Z'}));
    const matches=full.events.map(e=>({round:'Matchday 7',date:e.kickoffUtc.slice(0,10),time:e.kickoffUtc.slice(11,16)==='18:45'?'20:45':'15:00',team1:e.home,team2:e.away}));
    const body=JSON.stringify({name:'Italian Serie A 2026/27',matches});
    const source={schema:'lamultipla-calendar-public-source-v1',source:'openfootball/football.json',path:'2026-27/it.1.json',commit:'a'.repeat(40),
      license:'CC0-1.0',licenseSha256:CALENDAR_LICENSE_SHA256,body,bodySha256:await import('../scripts/lib/goals/data.mjs').then(m=>m.sha256(body)),fetchedAtUtc:at};
    const snapshot={schema:'lamultipla-private-calendar-snapshot-v1',source,fixtures,observedAtUtc:at,acquisition:{billableAttempts:1}};
    const file=path.join(root,'.local/calendars',counts.calendar+'.json');await writeExclusive(file,snapshot);
    // A synthetic official reviewer binds the current observation. No website
    // or real account is contacted by this test adapter.
    full.source={officialUrl:'https://www.legaseriea.it/synthetic',officialPdfUrl:'https://www.legaseriea.it/synthetic.pdf',
      confirmedAtUtc:at,providerObservedAtUtc:at,providerFixturesSha256:digest(fixtures)};
    return {file};
  };
  const makeAdapters=()=>{
    const adapters={};
    adapters.dataset={run:async({plan})=>{const m={season:full.season,matchday:7,events:plan.schedule.events};
      const dataset=syntheticContextDataset(m,at);await writeSame(path.join(root,'.local/shadow/datasets',digest(dataset)+'.json'),dataset);return dataset;},validate:()=>{}};
    adapters.forecast={recover:async({plan})=>{const filename=path.join(attemptDirectory(root,plan),'forecast.json');try{const journal=await readSnapshot(filename);
      return {journal,filename,scientificJournalSha256:digest(await readSnapshot(path.join(root,'.local/model/prospective/journals',journalId(full)+'.json')))};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
      run:async({plan,results})=>{
        counts.forecast++;const m={season:full.season,matchday:7,events:plan.schedule.events.map(e=>({...e,season:full.season,matchday:7}))};
        const generated=new Date(Date.parse(at)-120000).toISOString();
        const p=[.95,.03,.02],ci=[[.94,.96],[.02,.04],[.01,.03]];
        const journal=sealJournal({model:{converged:true,config:CONFIG,cutoffUtc:'2026-10-01T00:00:00Z'},forecasts:m.events.map(e=>({...e,central:p,intervals95:ci,
          uncertainty:{replicates:40,failures:0,sufficient:true},baselines:{empirical:[.4,.3,.3],leaguePoisson:[.4,.3,.3]}}))},m,
          {studySha256:digest(study),datasetSha256:digest(results.dataset),datasetAcquiredAtUtc:generated},generated);
        const science=path.join(root,'.local/model/prospective/journals',journalId(full)+'.json');
        let original;try{original=await readSnapshot(science);}catch(e){if(e.code!=='ENOENT')throw e;await writeExclusive(science,journal);original=structuredClone(journal);}
        if(plan.progressive.revision>1){journal.id+='-shadow-'+plan.progressive.attemptId;journal.provenance.cohortEligible=false;journal.provenance.scientificJournalSha256=digest(original);}
        const filename=path.join(attemptDirectory(root,plan),'forecast.json');await writeSame(filename,journal);return {journal,filename,scientificJournalSha256:digest(original)};
      },validate:async r=>assert.equal(digest(await readSnapshot(r.filename)),digest(r.journal))};
    adapters.quotes={recover:async({plan})=>{try{const filename=path.join(attemptDirectory(root,plan),'report.json');return {filename,report:await import('../scripts/lib/private-store.mjs').then(m=>m.loadJson(filename))};}
      catch(e){if(e.code==='ENOENT')return null;throw e;}},
      run:async({plan})=>{
        counts.quotes++;if(ambiguous)throw Object.assign(new Error('SYNTHETIC ambiguous'),{code:'QUOTE_AMBIGUOUS'});
        const hasOffer=offer!==null&&at.slice(0,10)>=offer,chosen=at.slice(0,10)==='2026-10-16'?[0,1]:[1,4];
        const raw=sample().map((f,i)=>({...f,fixtureId:full.events[i].fixtureId,startTime:full.events[i].kickoffUtc}));
        const observed=new Date(Date.parse(at)-60000).toISOString();
        for(const f of raw)for(const market of Object.values(f.bookmakerOdds['bet365.it'].markets))for(const outcome of Object.values(market.outcomes))for(const q of Object.values(outcome.players)){q.changedAt=observed;q.price=1.01;}
        if(hasOffer)for(const i of chosen)raw[i].bookmakerOdds['bet365.it'].markets[101].outcomes[101].players[0].price=1.2;
        const report=buildReport(raw,catalog,{round:plan.round,observedAt:observed,source:'synthetic_test'});
        const filename=path.join(attemptDirectory(root,plan),'report.json');await fs.writeFile(filename,JSON.stringify(report),{flag:'wx'});return {filename,report};
      },validate:()=>{}};
    adapters.decision={recover:async({plan})=>{try{return await readSnapshot(path.join(attemptDirectory(root,plan),'decision.json'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
      run:async({plan,results})=>{
        counts.decision++;const report=results.quotes.report;
        const assessment={estimates:report.selections.map(q=>({quoteId:q.quoteId,
          manualVerification:{...verificationTemplate(report,q),availability:'available',observedPrice:q.price,verifiedAtUtc:at,reviewer:'SYNTHETIC',evidence:'SYNTHETIC ONLY'},
          settlementVerification:missingRules?undefined:{...settlementTemplate(report,q),rulesUrl:'https://help.bet365.it/synthetic',rulesVersion:'SYNTHETIC',rulesSha256:'a'.repeat(64),
            reviewedAtUtc:at,reviewer:'SYNTHETIC',evidence:'SYNTHETIC ONLY',regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,voidAndPostponementReviewed:true}}))};
        const ids=report.selections.filter(q=>q.marketType==='1x2'&&q.outcome==='1'&&q.price===1.2).map(q=>q.quoteId);
        const combinedPrices=ids.length===2?[{schema:'lamultipla-accumulator-price-verification-v1',domain:'bet365.it',origin:'manual_bet365_it',kind:'ordinary_accumulator',availability:'available',
          reportSha256:digest(report),quoteIds:ids,price:1.4,verifiedAtUtc:at,reviewer:'SYNTHETIC',evidence:'SYNTHETIC ONLY'}]:[];
        const context=buildContext({manifest:results.forecast.journal.manifest,dataset:results.dataset,evidence:syntheticContextBundle(results.forecast.journal.manifest,at),now:at});
        const decision=createDecision({journal:results.forecast.journal,report,study,assessment,context,combinedPrices,now:at,
          progressive:{...plan.progressive,scientificJournalSha256:results.forecast.scientificJournalSha256},provenance:{sourceData:'synthetic_test'}});
        // These are synthetic producer inputs kept separately for exact replay.
        await writeSame(path.join(attemptDirectory(root,plan),'bundle.json'),{assessment});
        return (await persistProgressiveDecision(decision,root,plan,{now:at})).decision;
      },validate:()=>{}};
    adapters.package={run:async({plan,results})=>{const saved=await readSnapshot(path.join(attemptDirectory(root,plan),'bundle.json'));
      return envelope(appPackage({decision:results.decision,journal:results.forecast.journal,report:results.quotes.report,study,assessment:saved.assessment}));},
      validate:r=>parseDecisionEnvelope(r)};
    adapters.queue={recover:async({results})=>(await readOutbox(frames,trust,{now:clock()})).find(r=>r.envelope.sha256===results.package.sha256)?.statement??null,
      before:({results,now})=>{if(new Date(now)>=new Date(proposalExpiry(results.package.payload)))throw Object.assign(new Error('PRIVATE_QUEUE_PACKAGE_EXPIRED'),{code:'PRIVATE_QUEUE_PACKAGE_EXPIRED'});},
      run:async({results})=>{counts.queue++;return (await enqueueDelivery({directory:frames,envelope:results.package,trust,privateKey:pair.privateKey,
        expiresAtUtc:proposalExpiry(results.package.payload),now:clock()})).record.statement;},validate:()=>{}};
    return {adapters,close:(plan,history)=>closeProgressiveRound(root,plan,history,{now:at,sourceData:'synthetic_test'}),
      deliverState:async state=>enqueueDelivery({directory:frames,envelope:envelope(state),trust,privateKey:pair.privateKey,expiresAtUtc:proposalExpiry(state),now:clock()})};
  };
  const options={root,filename:'SYNTHETIC-config',clock,collect,loadConfig:async()=>({config:{maxLegs:4},inputs,schedules:[full]}),makeAdapters};
  return {root,full,counts,clock,trust,frames,options,setTime:v=>{at=v;},tick:()=>roundManagerTick(options),
    science:()=>fs.readFile(path.join(root,'.local/model/prospective/journals',journalId(full)+'.json'),'utf8')};
}
test('Friday provisional NO BET becomes a Saturday proposal spanning Saturday/Sunday; original cohort stays byte-identical',async t=>{
  const s=await setup(t);assert.equal((await s.tick()).rounds[0].state,'NO_BET_PROVISIONAL');const original=await s.science();
  s.setTime('2026-10-16T12:50:00.000Z');assert.equal((await s.tick()).rounds[0].state,'WAITING_WINDOW');assert.equal(s.counts.quotes,1);
  s.setTime(saturday);assert.equal((await s.tick()).rounds[0].state,'SHADOW_PROPOSAL_FROZEN');
  const all=await readOutbox(s.frames,s.trust,{now:s.clock()}),records=all.filter(r=>r.statement.kind==='final');assert.equal(records.length,1);
  assert.equal(all[0].envelope.payload.phase,'NO_BET_PROVISIONAL');
  assert.deepEqual(records[0].envelope.payload.selections.map(q=>q.identity.kickoffUtc.slice(0,10)).sort(),['2026-10-17','2026-10-18']);
  assert.equal(await s.science(),original);assert.equal(s.counts.quotes,2);
  await s.tick();assert.equal((await readOutbox(s.frames,s.trust,{now:s.clock()})).length,2);assert.equal(s.counts.quotes,2);
});
test('a valid first-window proposal finalizes immediately and no later window reacquires or replaces it',async t=>{
  const s=await setup(t,{offer:'2026-10-16'});assert.equal((await s.tick()).rounds[0].state,'SHADOW_PROPOSAL_FROZEN');
  const final=await fs.readFile(decisionPath(path.join(s.root,'.local/shadow'),'2026/27',7),'utf8');
  s.setTime(saturday);await s.tick();s.setTime(sunday);await s.tick();
  assert.equal(s.counts.quotes,1);assert.equal(s.counts.calendar,1);
  assert.equal(await fs.readFile(decisionPath(path.join(s.root,'.local/shadow'),'2026/27',7),'utf8'),final);
});
test('no opportunity through all effective kickoff windows ends with explicit final NO BET, without fake forecasts in its packet',async t=>{
  const s=await setup(t,{offer:null});
  for(const at of [friday,saturday,sunday,monday]){s.setTime(at);assert.equal((await s.tick()).rounds[0].state,'NO_BET_PROVISIONAL');}
  s.setTime('2026-10-19T16:16:00.000Z');const end=await s.tick();assert.equal(end.rounds[0].state,'NO_BET_FINAL');
  const records=(await readOutbox(s.frames,s.trust,{now:s.clock()})).filter(r=>r.statement.kind==='final');assert.equal(records.length,1);const p=records[0].envelope.payload;
  assert.equal(p.schema,'lamultipla-app-round-state-v1');assert.equal(p.final,true);assert.equal('model' in p,false);assert.equal(p.attemptHashes.length,4);
  await s.tick();assert.equal((await readOutbox(s.frames,s.trust,{now:s.clock()})).length,5);
});
test('missing settlement stays insufficient evidence rather than absence of value',async t=>{
  const s=await setup(t,{offer:'2026-10-16',missingRules:true});const r=(await s.tick()).rounds[0];
  assert.equal(r.state,'EVIDENCE_INSUFFICIENT');assert.equal(r.reason,'SELECTION_REVIEW_REQUIRED');assert.equal(s.counts.queue,0);
});
test('ambiguous provider intent survives restart and blocks fresh paid attempts in the next window',async t=>{
  const s=await setup(t,{ambiguous:true});assert.equal((await s.tick()).rounds[0].state,'TECHNICALLY_INCOMPLETE');
  s.setTime(saturday);const r=(await s.tick()).rounds[0];assert.equal(r.reason,'AMBIGUOUS_PROVIDER_ATTEMPT_REVIEW_REQUIRED');assert.equal(s.counts.quotes,1);
});
test('restart after outcome commit recovers history without repeating producers',async t=>{
  const s=await setup(t);await assert.rejects(roundManagerTick({...s.options,afterOutcome:async()=>{throw new Error('SYNTHETIC crash');}}));
  s.setTime('2026-10-16T12:50:00.000Z');await s.tick();assert.equal(s.counts.quotes,1);
  s.setTime(saturday);assert.equal((await s.tick()).rounds[0].state,'SHADOW_PROPOSAL_FROZEN');assert.equal(s.counts.quotes,2);
});
test('late proposals expire for notification/archive and signed transport cannot extend their useful deadline',async t=>{
  const s=await setup(t,{offer:'2026-10-16'});await s.tick();const [r]=await readOutbox(s.frames,s.trust,{now:s.clock()});
  const late=new Date(Date.parse(r.statement.expiresAtUtc)+1);
  await assert.rejects(verifyDelivery(r.frame,s.trust,{now:late}),/scaduta/);
  assert.equal((await verifyDelivery(r.frame,s.trust,{now:late,archiveExpired:true})).expired,true);
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  await assert.rejects(signDelivery(r.envelope,{readerUid:s.trust.readerUid,applicationId:s.trust.applicationId,channel:s.trust.channel,keyId:Object.keys(s.trust.keys)[0],sequence:2,previousDeliveryHash:r.deliveryHash,
    expiresAtUtc:'2026-10-16T19:00:00.000Z'},pair.privateKey),/finestra utile/);
});
test('effective UTC kickoffs, DST and postponements control windows, never weekday assumptions',()=>{
  const s=schedule();s.events[0].kickoffUtc='2026-10-25T14:00:00.000Z';
  assert.ok(timing(s,'2026-10-25T08:00:00.000Z').active);s.events.forEach(e=>{e.status='postponed';});
  assert.equal(timing(s,'2026-10-26T23:00:00.000Z').exhausted,false);
  assert.equal(timing(s,'2026-10-26T23:00:00.000Z').unresolved,true);
  assert.throws(()=>timing({...schedule(),matchday:6},friday),/Protected pilot/);
});
test('quote mutation and expiry cannot become a refreshed valid proposal by changing its timestamp',async t=>{
  const s=await setup(t);await s.tick();const directory=path.join(s.root,'.local/orchestrator/rounds/2026-27-round-07/attempts/0001');
  const d=await readSnapshot(path.join(directory,'decision.json'));
  assert.equal(d.noBetCause,'NO_VALUE');
  const report=JSON.parse(await fs.readFile(path.join(directory,'report.json'),'utf8'));
  report.selections[0].price=99;assert.notEqual(d.reportSha256,digest(report));
  const forecast=(await readSnapshot(path.join(directory,'receipts/forecast.json'))).result.journal;
  const result=createDecision({journal:forecast,report,study:{},now:'2026-10-16T13:16:00.000Z',context:null});
  assert.equal(result.selector.selected,null);assert.ok(result.opportunities.globalIssues.includes('report_expired_or_future'));
});
test('shadow revision is rejected by scientific evaluation/progression and missing results remain pending at the original forecast',async t=>{
  const s=await setup(t);await s.tick();s.setTime(saturday);await s.tick();
  const j=await readSnapshot(path.join(s.root,'.local/orchestrator/rounds/2026-27-round-07/attempts/0002/forecast.json'));
  const results={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',sourceCommit:'a'.repeat(40),license:'CC0-1.0',acquiredAtUtc:'2026-10-20T00:00:00.000Z',rows:[]};
  assert.throws(()=>evaluateJournal(j,results,{evaluatedAtUtc:results.acquiredAtUtc}),/excluded/);assert.throws(()=>progressiveMetrics([j],[]),/cannot enter/);
  const original=await readSnapshot(path.join(s.root,'.local/model/prospective/journals',journalId(s.full)+'.json'));
  const readiness=checkEvaluationReadiness(original,results,{now:results.acquiredAtUtc});assert.equal(readiness.counts.pending,10);assert.equal(readiness.status,'DUE_WITH_PENDING_RESULTS');
});
test('previous Android v4 envelopes/backups remain parseable and state capability is explicit',async()=>{
  const {syntheticDecisionBundle}=await import('./fixtures/decision.mjs'),old=envelope(appPackage(syntheticDecisionBundle()));
  assert.equal((await parseExperimentalEnvelope(old)).sha256,old.sha256);
  assert.equal((await parseBackup({app:'seriea-multipla',version:4,slips:[],experiments:[old]})).experiments.length,1);
  const stored={config:{channel:'shadow'},profile:{deviceId:'synthetic-device',trust:{channel:'shadow',applicationId:'it.personale.lamultipla.collaudo'}}};
  const cloud={device:async()=>({applicationId:stored.profile.trust.applicationId,fcmToken:'SYNTHETIC_TOKEN'})};
  await assert.rejects(ensureShadowReception('unused',{stored,cloud,requiredRoundState:true}),/UPGRADE_REQUIRED/);
  cloud.device=async()=>({applicationId:stored.profile.trust.applicationId,fcmToken:'SYNTHETIC_TOKEN',roundStateProtocol:1});
  assert.equal((await ensureShadowReception('unused',{stored,cloud,requiredRoundState:true})).registered,true);
});
test('a failed progressive manager cannot suppress recovery of an already queued shadow package',async t=>{
  const s=await setup(t);let pumped=0;
  const result=await progressiveAndDeliveryTick({root:s.root,filename:'SYNTHETIC',clock:s.clock,runManager:async()=>{throw new Error('SYNTHETIC PRIVATE CONTENT');},
    pump:async()=>{pumped++;return {state:'acknowledged'};}});
  assert.equal(pumped,1);assert.equal(result.delivery.state,'acknowledged');assert.doesNotMatch(JSON.stringify(result),/PRIVATE CONTENT/);
});
test('calendar reconfirmation binds exact provider IDs/hash and changed kickoff remains an explicit discrepancy',async t=>{
  const s=await setup(t);await s.tick();
  const manager=JSON.parse(await fs.readFile(path.join(s.root,'.local/orchestrator/progressive/state.private.json'),'utf8')),snapshot=await readSnapshot(manager.calendarFile);
  const changed=structuredClone(s.full);changed.events[1].kickoffUtc='2026-10-17T14:00:00.000Z';
  const reconciled=reconcileCalendar(changed,snapshot,s.clock());assert.equal(reconciled.schedule.events[1].status,'unknown');
  changed.source.providerFixturesSha256='b'.repeat(64);assert.throws(()=>reconcileCalendar(changed,snapshot,s.clock()),/RECONFIRM/);
});
test('restart after package freeze refuses a stale enqueue without replacing the definitive proposal',async t=>{
  const s=await setup(t,{offer:'2026-10-16'});
  const first=await roundManagerTick({...s.options,runAnalysis:args=>analysisTick({...args,afterReceipt:async stage=>{
    if(stage==='package')s.setTime('2026-10-16T13:16:00.000Z');
  }})});
  assert.equal(first.rounds[0].state,'SHADOW_PROPOSAL_FROZEN');assert.equal(first.rounds[0].reason,'PRIVATE_QUEUE_PACKAGE_EXPIRED');
  assert.equal((await readOutbox(s.frames,s.trust,{now:s.clock()})).length,0);
  const bytes=await fs.readFile(decisionPath(path.join(s.root,'.local/shadow'),'2026/27',7),'utf8');
  s.setTime('2026-10-16T13:20:00.000Z');await s.tick();
  assert.equal((await readOutbox(s.frames,s.trust,{now:s.clock()})).length,0);
  assert.equal(await fs.readFile(decisionPath(path.join(s.root,'.local/shadow'),'2026/27',7),'utf8'),bytes);
});
test('late first startup records a scientific gap and creates only shadow revisions, without a retroactive primary journal',async t=>{
  const s=await setup(t);await s.tick();
  const prior=await readSnapshot(path.join(s.root,'.local/orchestrator/rounds/2026-27-round-07/attempts/0001/plan.json'));
  const isolated=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-scientific-gap-'));t.after(()=>fs.rm(isolated,{recursive:true,force:true}));
  s.setTime(saturday);const plan={...prior,progressive:{...prior.progressive,attemptId:'0001',revision:1},
    inputs:prior.inputs,inputHashes:prior.inputHashes};
  const data=syntheticContextDataset({events:s.full.events},saturday);
  data.rows=data.rows.filter(row=>!s.full.events.some(e=>e.home===row.home&&e.away===row.away));
  const syntheticPrior=data.rows.flatMap(row=>[2024,2025].map(year=>({...row,season:year+'-'+String(year+1).slice(-2),
    key:year+'-'+String(year+1).slice(-2)+':'+row.home+':'+row.away,date:row.date.replace('2026-',year+'-'),
    availableAtUtc:row.availableAtUtc.replace('2026-',year+'-')})));
  data.rows.push(...syntheticPrior);
  const adapter=progressiveAdapters(isolated,{clock:s.clock}).adapters.forecast;
  const result=await adapter.run({plan,results:{dataset:data}});
  assert.equal(result.journal.provenance.cohortEligible,false);assert.equal(result.journal.provenance.scientificJournalMissing,true);
  assert.equal(result.journal.trainingCutoffUtc,'2026-10-01T00:00:00.000Z');
  await assert.rejects(fs.stat(path.join(isolated,'.local/model/prospective/journals',journalId(s.full)+'.json')),{code:'ENOENT'});
  const marker=await readSnapshot(path.join(isolated,'.local/orchestrator/rounds/2026-27-round-07/scientific-missing.json'));
  assert.equal(marker.reason,'FIRST_SCIENTIFIC_WINDOW_MISSED');assert.equal(result.scientificJournalSha256,digest(marker));
});
test('final round state survives backup parsing and authenticated import/ACK scope without mixing legacy slips',async t=>{
  const s=await setup(t,{offer:null});await s.tick();s.setTime('2026-10-19T16:16:00.000Z');await s.tick();
  const records=await readOutbox(s.frames,s.trust,{now:s.clock()}),r=records.at(-1);
  const parsed=await parseBackup({app:'seriea-multipla',version:4,slips:[],experiments:[r.envelope]});
  assert.equal(parsed.experiments[0].payload.phase,'NO_BET_FINAL');assert.equal(parsed.slips.length,0);
  const {indexedDB}=await import('fake-indexeddb');globalThis.indexedDB=indexedDB;
  const {importPrivateFrame,readPrivateCursor}=await import('../shared/private-receiver.mjs');const scope='f'.repeat(64);
  for(const record of records)await importPrivateFrame(record.frame,s.trust,{scope,now:s.clock()});
  assert.equal((await readPrivateCursor(scope)).sequence,records.length);
  assert.equal((await importPrivateFrame(r.frame,s.trust,{scope,now:s.clock()})).reused,true);
});
test('progressive task preparation is pinned and disabled, preserving legacy modes without activation',()=>{
  const options={root:'C:\\Synthetic',nodePath:'C:\\Node\\node.exe',userSid:'S-1-5-21-1-2-3-4',startAtUtc:friday};
  const xml=windowsTaskXml({...options,progressiveConfig:'C:\\Synthetic\\.local\\manager.json',configSha256:'a'.repeat(64)});
  assert.match(xml,/--progressive-once/);assert.match(xml,/--config-sha256/);assert.match(xml,/<Enabled>false<\/Enabled>/);
  assert.match(xml,/PT5M/);assert.match(xml,/PT10M/);assert.equal(PROGRESSIVE_POLICY.deliveryLeadMinutes,120);
  assert.throws(()=>windowsTaskXml({...options,progressiveConfig:'C:\\Outside\\manager.json',configSha256:'a'.repeat(64)}),/remain private/);
  assert.match(windowsTaskXml(options),/--once/);
});
test('crash after each durable stage receipt resumes the same attempt and paid response exactly once',async t=>{
  for(const stop of ['dataset','forecast','quotes','decision','package','queue']){
    const s=await setup(t,{offer:'2026-10-16'});
    await assert.rejects(roundManagerTick({...s.options,runAnalysis:args=>analysisTick({...args,afterReceipt:async stage=>{
      if(stage===stop)throw new Error('SYNTHETIC crash');
    }})}));
    const r=await s.tick();assert.equal(r.rounds[0].state,'SHADOW_PROPOSAL_FROZEN');assert.equal(s.counts.quotes,1);
    assert.equal((await readOutbox(s.frames,s.trust,{now:s.clock()})).length,1);
  }
});
test('local review replay reads the prior paid report without touching credentials or the provider',async t=>{
  const s=await setup(t);await s.tick();
  const plan=await readSnapshot(path.join(s.root,'.local/orchestrator/rounds/2026-27-round-07/attempts/0001/plan.json'));
  const receipt=await readSnapshot(path.join(attemptDirectory(s.root,plan),'receipts/quotes.json'));
  const report=structuredClone(receipt.result.report);report.source.mode='api';
  const file=path.join(s.root,'.local/replay-report.json');await fs.writeFile(file,JSON.stringify(report));
  const forecast=(await readSnapshot(path.join(attemptDirectory(s.root,plan),'receipts/forecast.json'))).result;
  const adapter=progressiveAdapters(s.root,{clock:s.clock,keyLoader:async()=>assert.fail('No key access'),quoteOptions:{fetchImpl:async()=>assert.fail('No provider')}}).adapters.quotes;
  const ctx={plan:{...plan,reuse:{reportFile:file}},results:{forecast},now:s.clock()};
  await adapter.before(ctx);const replayed=await adapter.run(ctx);await adapter.validate(replayed,ctx);
  assert.equal(replayed.filename,file);assert.equal(s.counts.quotes,1);
});
test('changed evidence before any paid intent creates a new immutable plan, preserving the abandoned attempt',async t=>{
  const s=await setup(t);
  await assert.rejects(roundManagerTick({...s.options,runAnalysis:args=>analysisTick({...args,afterReceipt:async stage=>{
    if(stage==='dataset')throw new Error('SYNTHETIC pre-quote crash');
  }})}));
  const before=await fs.readFile(path.join(s.root,'.local/orchestrator/rounds/2026-27-round-07/attempts/0001/plan.json'),'utf8');
  const base=s.options.loadConfig;s.options.loadConfig=async(...args)=>{const value=await base(...args);
    return {...value,inputs:{...value.inputs,assessmentFile:{file:'SYNTHETIC revised notes',value:{estimates:[]}}}};};
  assert.equal((await s.tick()).rounds[0].state,'NO_BET_PROVISIONAL');assert.equal(s.counts.quotes,1);
  const dir=path.join(s.root,'.local/orchestrator/rounds/2026-27-round-07/attempts');
  assert.equal(await fs.readFile(path.join(dir,'0001/plan.json'),'utf8'),before);
  const outcome=await readSnapshot(path.join(dir,'0001/outcome.json'));
  assert.equal(outcome.reason,'INPUTS_REVISED_BEFORE_ACQUISITION');assert.equal(outcome.quoteStageStarted,false);
  assert.equal((await readSnapshot(path.join(dir,'0002/plan.json'))).progressive.revision,2);
});
