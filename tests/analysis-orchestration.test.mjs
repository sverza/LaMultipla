// SYNTHETIC ONLY: no production credentials, provider requests or task registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {analysisTick,ANALYSIS_STAGES} from '../scripts/lib/orchestration/analysis-workflow.mjs';
import {loadAnalysisPlan,validateAnalysisSchedule} from '../scripts/lib/orchestration/analysis-plan.mjs';
import {shadowArguments} from '../scripts/lib/orchestration/analysis-adapters.mjs';
import {digest,writeExclusive,readSnapshot,envelope} from '../scripts/lib/prospective/store.mjs';
import {saveJson} from '../scripts/lib/private-store.mjs';
import {withLock} from '../scripts/lib/private-store.mjs';
import {spawn} from 'node:child_process';
import {syntheticDecisionBundle} from './fixtures/decision.mjs';
import {governance} from '../scripts/lib/decision/governance.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {verifyDecisionBundle} from '../scripts/lib/decision/delivery.mjs';
import {enqueueDelivery,readOutbox} from '../scripts/lib/private/outbox.mjs';
import {base64url,keyFingerprint} from '../shared/private-delivery.mjs';
import {parseDecisionEnvelope} from '../shared/decision-v4.mjs';
import {importQuotes} from '../scripts/oddspapi.mjs';
import {sample,catalog,round,account} from './fixtures/oddspapi.mjs';

async function setup(t,kind='simulation'){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-analysis-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const bundle=syntheticDecisionBundle(kind),kickoff=bundle.journal.manifest.events[0].kickoffUtc;
  // The opened test window is earlier than the fixture's fixed decision clock.
  const plan={round:bundle.decision.round,window:{opensAtUtc:'2026-10-17T09:00:00.000Z',closesAtUtc:kickoff},purpose:'SYNTHETIC_TEST_ONLY'};
  let at=Date.parse(bundle.now);const clock=()=>new Date(at),counts=Object.fromEntries(ANALYSIS_STAGES.map(s=>[s,0]));
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',pair.publicKey)),id=await keyFingerprint(spki);
  const trust={readerUid:'SYNTHETIC_reader',applicationId:'it.personale.lamultipla.collaudo',channel:'synthetic_shadow',keys:{[id]:spki}};
  const result={dataset:{purpose:'SYNTHETIC_HISTORY'},forecast:{journal:bundle.journal},quotes:{report:bundle.report}};
  const adapters={};
  for(const stage of ANALYSIS_STAGES)adapters[stage]={validate:async value=>assert.ok(value),run:async()=>{counts[stage]++;return result[stage];}};
  adapters.decision.run=async()=>{counts.decision++;const decision={...bundle.decision,final:true};decision.governance=governance(decision);
    verifyDecisionBundle({...bundle,decision});result.decision=decision;return decision;};
  adapters.package.run=async()=>{counts.package++;return envelope(appPackage({...bundle,decision:result.decision}));};
  adapters.package.validate=value=>parseDecisionEnvelope(value);
  adapters.queue.run=async({results})=>{counts.queue++;return (await enqueueDelivery({directory:path.join(root,'.local/SYNTHETIC-outbox'),trust,privateKey:pair.privateKey,
    envelope:results.package,now:clock(),expiresAtUtc:new Date(at+30*60000).toISOString()})).record.statement;};
  return {root,plan,adapters,clock,counts,bundle,trust,setTime:v=>{at=Date.parse(v);}};
}
test('synthetic analysis stages produce replay-verified simulation and signed private v4 exactly once across invocations',async t=>{
  const s=await setup(t);assert.equal((await analysisTick(s)).state,'queued');
  assert.equal((await analysisTick(s)).state,'queued');assert.deepEqual(Object.values(s.counts),[1,1,1,1,1,1]);
  const records=await readOutbox(path.join(s.root,'.local/SYNTHETIC-outbox'),s.trust,{now:s.clock()});
  assert.equal(records.length,1);assert.equal(records[0].envelope.payload.status,'simulation');assert.equal(records[0].envelope.payload.actualStakeEUR,0);
  assert.equal(records[0].envelope.payload.operational.authorized,false);
});
test('synthetic absence of value and missing settlement remain distinct NO BET deliveries',async t=>{
  const causes=[];for(const kind of ['no_value','missing_rules']){
    const s=await setup(t,kind);assert.equal((await analysisTick(s)).state,'queued');
    const record=(await readOutbox(path.join(s.root,'.local/SYNTHETIC-outbox'),s.trust,{now:s.clock()}))[0];
    assert.equal(record.envelope.payload.status,'no_bet');causes.push(record.envelope.payload.shadowCause);
  }assert.notEqual(causes[0],causes[1]);
});
test('crash after each immutable stage receipt resumes from committed outputs, including signed enqueue',async t=>{
  for(const stopped of ANALYSIS_STAGES){
    const s=await setup(t);await assert.rejects(analysisTick({...s,afterReceipt:async stage=>{if(stage===stopped)throw new Error('SYNTHETIC stop');}}));
    assert.equal((await analysisTick(s)).state,'queued');assert.deepEqual(Object.values(s.counts),[1,1,1,1,1,1]);
  }
});
test('window and kickoff deadline prevent late forecast and quote acquisition; protected pilot cannot start',async t=>{
  const s=await setup(t);s.setTime('2026-10-17T08:59:00.000Z');assert.equal((await analysisTick(s)).state,'waiting_window');
  assert.deepEqual(Object.values(s.counts),[0,0,0,0,0,0]);
  s.setTime(s.plan.window.closesAtUtc);assert.equal((await analysisTick(s)).state,'deadline_missed');assert.equal(s.counts.forecast,0);
  await assert.rejects(analysisTick({...s,plan:{...s.plan,round:{season:'2026/27',matchday:6}}}),/Protected pilot/);
});
test('forecast committed before checkpoint is recovered without retiming, ambiguous paid attempt never retries',async t=>{
  const s=await setup(t);let stored;
  s.adapters.forecast.run=async()=>{s.counts.forecast++;stored={journal:s.bundle.journal};throw new Error('SYNTHETIC crash before receipt');};
  s.adapters.forecast.recover=async()=>stored??null;
  assert.equal((await analysisTick(s)).state,'retry_required');s.setTime('2026-10-17T10:20:00.000Z');
  s.adapters.quotes.run=async()=>{s.counts.quotes++;throw new Error('SYNTHETIC billable unknown');};
  assert.equal((await analysisTick(s)).state,'review_required');
  const again=await analysisTick(s);assert.equal(again.reason,'QUOTE_ATTEMPT_INTERRUPTED');assert.equal(s.counts.forecast,1);assert.equal(s.counts.quotes,1);
  const state=await fs.readFile(path.join(s.root,'.local/orchestrator/analysis/2026-27-round-07/state.private.json'),'utf8');
  assert.doesNotMatch(state,/SYNTHETIC billable/);
});
test('plan changes and corrupted receipts fail closed; retries preserve diagnostics and clock checks',async t=>{
  const s=await setup(t);s.adapters.dataset.run=async()=>{s.counts.dataset++;throw new Error('SYNTHETIC credential must not be logged');};
  assert.equal((await analysisTick(s)).state,'retry_required');assert.equal((await analysisTick(s)).state,'backoff');assert.equal(s.counts.dataset,1);
  s.setTime('2026-10-17T10:14:00.000Z');await assert.rejects(analysisTick(s),/CLOCK_ROLLBACK/);
  s.setTime('2026-10-17T10:20:00.000Z');await assert.rejects(analysisTick({...s,plan:{...s.plan,purpose:'CHANGED'}}));
  s.adapters.dataset.run=async()=>({purpose:'SYNTHETIC_RECOVERED'});await analysisTick(s);
  const file=path.join(s.root,'.local/orchestrator/analysis/2026-27-round-07/receipts/forecast.json');
  const receipt=await readSnapshot(file);receipt.inputSha256='f'.repeat(64);
  await fs.unlink(file);await writeExclusive(file,receipt);await assert.rejects(analysisTick(s),/RECEIPT_INVALID/);
});
test('two analysis processes cannot execute concurrently',async t=>{
  const s=await setup(t);let finish;s.adapters.dataset.run=()=>new Promise(resolve=>{finish=resolve;});
  const first=analysisTick(s);while(!finish)await new Promise(resolve=>setTimeout(resolve,5));
  await assert.rejects(analysisTick(s),/già in esecuzione/);finish({purpose:'SYNTHETIC_HISTORY'});assert.equal((await first).state,'queued');
});
test('legacy importer lock adapter recovers a killed process without deleting unknown old locks',async t=>{
  const s=await setup(t),directory=path.join(s.root,'.local/killed-process');
  const moduleUrl=new URL('../scripts/lib/private-store.mjs',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import {withLock} from ${JSON.stringify(moduleUrl)};await withLock(${JSON.stringify(directory)},async()=>{setInterval(()=>{},1000);process.stdout.write('ready');await new Promise(()=>{});});`],{stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));
  child.stderr.resume();
  const closed=new Promise(resolve=>child.once('close',resolve));
  // A pending Promise alone does not keep Node alive; a test-only timer does.
  const ready=await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>{if(code!==null)resolve(null);});});
  assert.ok(ready);child.kill('SIGKILL');await closed;
  assert.equal(await withLock(directory,async()=>true),true);
  await fs.writeFile(path.join(directory,'import.lock'),'');await assert.rejects(withLock(directory,async()=>assert.fail()),/lock residuo/);
});
test('private preflight admits source claims with original field names, pins inputs and never reads external files',async t=>{
  const s=await setup(t),schedule={schema:'lamultipla-prospective-schedule-v1',season:'2026/27',matchday:7,events:s.bundle.journal.manifest.events,
    source:{officialUrl:'https://www.legaseriea.it/serie-a/calendario-risultati',officialPdfUrl:'https://www.legaseriea.it/SYNTHETIC-calendar.pdf',
      confirmedAtUtc:'2026-10-16T00:00:00Z',providerObservedAtUtc:'2026-10-16T00:01:00Z',providerFixturesSha256:'a'.repeat(64)}};
  const folder=path.join(s.root,'.local/input');await saveJson(path.join(folder,'schedule.json'),schedule);await saveJson(path.join(folder,'study.json'),s.bundle.study);
  const file=path.join(folder,'plan.json'),raw={schema:'lamultipla-private-analysis-plan-v1',scheduleFile:path.join(folder,'schedule.json'),studyFile:path.join(folder,'study.json')};
  await saveJson(file,raw);const plan=await loadAnalysisPlan(s.root,file,{now:s.clock()});assert.equal(plan.inputHashes.scheduleFile,digest(schedule));
  assert.equal(plan.window.opensAtUtc,'2026-10-17T12:00:00.000Z');assert.equal(plan.window.closesAtUtc,'2026-10-17T12:55:00.000Z');
  assert.throws(()=>validateAnalysisSchedule({...schedule,source:{...schedule.source,confirmedAtUtc:'2026-10-18T00:00:00Z'}},s.clock()),/EVIDENCE/);
  await saveJson(file,{...raw,studyFile:path.join(s.root,'outside.json')});await saveJson(path.join(s.root,'outside.json'),s.bundle.study);
  await assert.rejects(loadAnalysisPlan(s.root,file,{now:s.clock()}),/PRIVATE_INPUT/);
});
test('production decision adapter invokes only shadow.mjs with pinned local inputs, never a second selector/live odds',()=>{
  const args=shadowArguments('/SYNTHETIC-root',{inputs:{studyFile:{file:'/SYNTHETIC-study'},contextEvidenceFile:{file:'/SYNTHETIC-context'}},maxLegs:4},
    {dataset:{purpose:'SYNTHETIC_HISTORY'},forecast:{filename:'/SYNTHETIC-journal'},quotes:{filename:'/SYNTHETIC-report'}});
  assert.equal(args[0],'/SYNTHETIC-root/scripts/shadow.mjs');assert.ok(args.includes('--context-evidence'));assert.ok(!args.includes('--live-odds'));assert.ok(!args.includes('--cycle'));
});

function provider(){let calls=0;return {get calls(){return calls;},fetchImpl:async url=>{calls++;return {ok:true,status:200,json:async()=>url.pathname.endsWith('/account')?account():url.pathname.endsWith('/markets')?catalog:sample()};}};}
test('paid acquisition transaction recovers full committed report after crash before receipt with no new request',async t=>{
  const s=await setup(t),p=provider(),directory=path.join(s.root,'.local/odds'),acquisitionId='b'.repeat(64);
  await fs.mkdir(path.join(directory,'latest.json'),{recursive:true}); // interrupts commit after complete report
  const args={round,directory,acquisitionId,key:'SYNTHETIC-memory-key',fetchImpl:p.fetchImpl,pause:async()=>{},clock:()=>new Date('2026-10-09T21:30:00.000Z')};
  await assert.rejects(importQuotes(args));assert.equal(p.calls,3);
  const recovered=await importQuotes(args);assert.equal(recovered.reused,true);assert.equal(p.calls,3);
  const repeated=await importQuotes(args);assert.equal(repeated.reused,true);assert.equal(p.calls,3);
  assert.equal(recovered.report.acquisition.billableAttempts,2);
});
test('unresolved acquisition intent blocks repeated API call and rejects changed identity',async t=>{
  const s=await setup(t);let calls=0;
  const args={round,directory:path.join(s.root,'.local/odds'),acquisitionId:'c'.repeat(64),key:'SYNTHETIC-memory-key',clock:()=>new Date('2026-10-09T21:30:00.000Z'),
    fetchImpl:async()=>{calls++;throw new Error('SYNTHETIC network failure');}};
  await assert.rejects(importQuotes(args));await assert.rejects(importQuotes(args),/interrotta/);assert.equal(calls,1);
  await assert.rejects(importQuotes({...args,acquisitionId:'../invalid'}),/non valida/);
});
