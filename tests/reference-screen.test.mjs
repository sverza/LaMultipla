// Entire workflow is isolated, synthetic and offline. No original registry is impersonated.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import 'fake-indexeddb/auto';
import {referenceScreenFixture,screenNow} from './fixtures/reference-screen.mjs';
import {experimentOutcome,runReferenceScreen,loadFrozenReference,bindReferenceReport,referenceQuotePlan} from '../scripts/lib/reference-screen.mjs';
import {createDecision} from '../scripts/lib/shadow/pipeline.mjs';
import {governance} from '../scripts/lib/decision/governance.mjs';
import {digest,readSnapshot,envelope} from '../scripts/lib/prospective/store.mjs';
import {enqueueDelivery,flushOutbox,readOutbox} from '../scripts/lib/private/outbox.mjs';
import {createPrivateCloud} from '../shared/private-cloud.mjs';
import {base64url,keyFingerprint,textSha256} from '../shared/private-delivery.mjs';
import {syncPrivateInbox,readPrivateCursor,importPrivateFrame} from '../shared/private-receiver.mjs';
import {readExperiments,makeBackup,parseBackup} from '../shared/experimental-store.mjs';
import {proposalExpiry} from '../scripts/lib/orchestration/progressive-policy.mjs';
const root=path.resolve('.');
const clock=()=>new Date(screenNow);
async function setup(t,kind='simulation'){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-reference-screen-'));
 t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 await fs.mkdir(path.join(temp,'docs'),{recursive:true});await fs.copyFile('docs/protocollo-analisi-progressive-v1.md',path.join(temp,'docs/protocollo-analisi-progressive-v1.md'));
 const {bundle,reference}=referenceScreenFixture(kind),files=Object.fromEntries(['report','assessment','context','combinedPrices'].map(k=>[k,{file:path.join(temp,k+'.json'),value:bundle[k]}]));
 let calls=0;
 const runShadow=async({metadata})=>{
  calls++;const d=createDecision({...bundle,progressive:metadata});d.final=false;d.governance=governance(d);return d;
 };
 return {root:temp,reference,files,attemptId:'0001',clock,runShadow,calls:()=>calls,bundle};
}
function fakeFirestore(){
 const docs=new Map();let version=0;
 return {fetchImpl:async(url,options)=>{
  assert.ok(url.startsWith('https://firestore.googleapis.com/v1/projects/demo-reference-screen/'));assert.equal(options.redirect,'error');
  const name=url.slice('https://firestore.googleapis.com/v1/'.length);
  if(options.method==='GET')return new Response(docs.has(name)?JSON.stringify(docs.get(name)):null,{status:docs.has(name)?200:404});
  const {writes}=JSON.parse(options.body);
  for(const w of writes){const old=docs.get(w.update.name),c=w.currentDocument;if(c.exists===false&&old||c.updateTime&&old?.updateTime!==c.updateTime)return new Response(null,{status:409});}
  for(const w of writes)docs.set(w.update.name,{...w.update,updateTime:'SYNTHETIC-'+(++version)});
  return new Response('{}');
 }};
}
test('three experiment outcomes preserve exact selector values; missing rules/prices/context are never no value',()=>{
 for(const [kind,state] of [['simulation','MULTIPLA_SIMULATA'],['no_value','NO_BET'],['missing_rules','ANALYSIS_INCOMPLETE']]){
  const {bundle}=referenceScreenFixture(kind),before=digest(bundle);assert.equal(experimentOutcome(bundle).state,state);assert.equal(digest(bundle),before);
 }
 const {bundle}=referenceScreenFixture();bundle.combinedPrices=[];bundle.decision=createDecision(bundle);
 assert.equal(experimentOutcome(bundle).state,'ANALYSIS_INCOMPLETE');
 const missing=referenceScreenFixture('no_value').bundle;missing.report.selections.pop();missing.decision=createDecision(missing);
 assert.ok(experimentOutcome(missing).reasons.includes('INCOMPLETE_1X2_COVERAGE'));
 const context=referenceScreenFixture('no_value').bundle;context.context=null;context.decision=createDecision(context);
 assert.equal(experimentOutcome(context).state,'ANALYSIS_INCOMPLETE');
 const unverified=referenceScreenFixture('no_value').bundle;unverified.assessment={};unverified.decision=createDecision(unverified);
 assert.ok(experimentOutcome(unverified).reasons.includes('BET365_PRICE_NOT_MANUALLY_VERIFIED'));
});
test('stale prices, duplicate quotes, incomplete search and late proposal cannot be a complete result',()=>{
 const {bundle}=referenceScreenFixture();
 assert.equal(experimentOutcome(bundle,{now:new Date(Date.parse(screenNow)+16*60000)}).phase,'TECHNICALLY_INCOMPLETE');
 const dup=referenceScreenFixture('no_value').bundle;dup.report.selections.push(dup.report.selections[0]);dup.decision=createDecision(dup);
 assert.equal(experimentOutcome(dup).state,'ANALYSIS_INCOMPLETE');
 const stale=referenceScreenFixture('no_value').bundle;stale.now=new Date(Date.parse(screenNow)+31*60000);stale.decision=createDecision(stale);
 assert.equal(experimentOutcome(stale).state,'ANALYSIS_INCOMPLETE');
});
test('report binding rejects identity swaps, duplicated fixtures, synthetic-to-real substitution and pre-freeze timestamps remain gated',()=>{
 const {reference,bundle}=referenceScreenFixture();bindReferenceReport(reference,bundle.report,{synthetic:true});
 assert.throws(()=>bindReferenceReport(reference,bundle.report),/REPORT_IDENTITY/);
 const bad=structuredClone(bundle.report);bad.coverage[0].fixture.reverse();assert.throws(()=>bindReferenceReport(reference,bad,{synthetic:true}));
 const duplicate=structuredClone(bundle.report);duplicate.coverage[1]=duplicate.coverage[0];assert.throws(()=>bindReferenceReport(reference,duplicate,{synthetic:true}));
 const early=structuredClone(bundle.report);early.fetchedAtUtc='2026-10-23T12:00:00.000Z';assert.throws(()=>bindReferenceReport(reference,early,{synthetic:true}),/PRECEDE_COMPLETED_FREEZE/);
 const before=referenceScreenFixture('no_value').bundle;before.report.fetchedAtUtc='2026-10-23T12:00:00.000Z';before.decision=createDecision(before);
 assert.equal(experimentOutcome(before).state,'ANALYSIS_INCOMPLETE');
});
test('reference adapter refuses missing/partial authentic freeze before creating an experiment or making requests',async t=>{
 const s=await setup(t);await assert.rejects(loadFrozenReference(s.root,'does-not-exist'),/REQUIRES_FROZEN_VERIFIED/);
 const help=spawnSync(process.execPath,['scripts/reference-screen.mjs','--help'],{cwd:root,encoding:'utf8'});assert.equal(help.status,0);
 const unknown=spawnSync(process.execPath,['scripts/reference-screen.mjs','--clock',screenNow],{cwd:root,encoding:'utf8'});assert.notEqual(unknown.status,0);
});
test('quote manifest contains exact IDs and conditional costs, never inherits fixtures consent or asserts a live balance',async t=>{
 const s=await setup(t),plan=await referenceQuotePlan(s.root,s.reference,{now:screenNow});
 assert.equal(plan.maxAdditionalCountedRequests,2);assert.equal(plan.executionAllowed,false);assert.equal(plan.currentRemoteBalance,null);
 assert.deepEqual(plan.round.fixtureIds,s.reference.input.schedule.events.map(e=>e.fixtureId));
 await fs.mkdir(path.join(s.root,'.local/oddspapi'),{recursive:true});
 await fs.writeFile(path.join(s.root,'.local/oddspapi/catalog-cache.json'),JSON.stringify({schema:1,fetchedAtUtc:screenNow,catalog:[{marketId:101}]}));
 assert.equal((await referenceQuotePlan(s.root,s.reference,{now:screenNow})).maxAdditionalCountedRequests,1);
});
test('immutable intent and decision survive crash; replay does not rerun selector, changed input or second final fails',async t=>{
 const s=await setup(t),before=digest(s.reference.journal);
 await assert.rejects(runReferenceScreen({...s,afterStage:stage=>{if(stage==='decision')throw Error('SYNTHETIC_CRASH');}}),/CRASH/);
 const result=await runReferenceScreen(s);assert.equal(result.state,'MULTIPLA_SIMULATA');assert.equal(s.calls(),1);
 assert.deepEqual(await runReferenceScreen(s),result);assert.equal(s.calls(),1);assert.equal(digest(s.reference.journal),before);
 const p=await readSnapshot(result.packageFile);assert.equal(p.source.generalProtocolVersion,'analysis-progressive-v1');assert.equal(p.final,true);
 const original=s.bundle.decision.selector.selected;assert.deepEqual(p.combined.jointProbabilityBounds,original.jointProbabilityBounds);assert.equal(p.combined.observedPrice,original.actualPrice);
 await assert.rejects(runReferenceScreen({...s,attemptId:'0002',files:{...s.files,assessment:{...s.files.assessment,value:{estimates:[]}}}}),/FINAL_ALREADY_EXISTS/);
 await assert.rejects(runReferenceScreen({...s,files:{...s.files,report:{...s.files.report,value:{...s.files.report.value,altered:true}}}}),/INPUT_CHANGED/);
});
test('missing quotes persist a signed-compatible incomplete state, no decision, forecast, final or retry',async t=>{
 const s=await setup(t);s.files={};const result=await runReferenceScreen(s),payload=await readSnapshot(result.packageFile);
 assert.equal(result.state,'ANALYSIS_INCOMPLETE');assert.equal(payload.phase,'EVIDENCE_INSUFFICIENT');assert.equal(s.calls(),0);
 assert.deepEqual(await runReferenceScreen(s),result);assert.equal(payload.final,false);
});
test('synthetic end-to-end: reference → sole selector → package → signed outbox → REST mock → app IDB → ACK, including offline, tamper and reopen',async t=>{
 const network=globalThis.fetch;globalThis.fetch=()=>assert.fail('No real network permitted');t.after(()=>{globalThis.fetch=network;});
 for(const kind of ['simulation','no_value','missing_rules']){
  const s=await setup(t,kind),result=await runReferenceScreen(s),payload=await readSnapshot(result.packageFile);
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),id=await keyFingerprint(spki),trust={readerUid:'SYNTHETIC_READER',channel:'synthetic_shadow',applicationId:'it.personale.lamultipla.collaudo',keys:{[id]:spki}};
  const scope=await textSha256(s.root),directory=path.join(s.root,'outbox'),input=envelope(payload),expiresAtUtc=proposalExpiry(payload);
  const args={directory,envelope:input,trust,privateKey:keys.privateKey,expiresAtUtc,now:screenNow};
  if(kind==='simulation')await assert.rejects(enqueueDelivery({...args,now:new Date(Date.parse(screenNow)+30*60000)}),/QUEUE_USEFUL_WINDOW_MISSED/);
  await assert.rejects(enqueueDelivery({...args,afterWrite:()=>{throw Error('SYNTHETIC_QUEUE_CRASH');}}),/QUEUE_CRASH/);
  assert.equal((await enqueueDelivery(args)).reused,true);assert.equal((await readOutbox(directory,trust,{now:screenNow})).length,1);
  if(kind==='simulation')assert.equal((await enqueueDelivery({...args,now:new Date(Date.parse(screenNow)+86400000)})).reused,true);
  const server=fakeFirestore(),cloud=createPrivateCloud({projectId:'demo-reference-screen',readerUid:trust.readerUid,channel:trust.channel},{getIdToken:async()=>'SYNTHETIC',fetchImpl:server.fetchImpl});
  const frame=(await readOutbox(directory,trust,{now:screenNow}))[0].frame,bad={...frame,packageJson:frame.packageJson+' '};
  await assert.rejects(importPrivateFrame(bad,trust,{scope,now:screenNow}));assert.equal((await readPrivateCursor(scope)).sequence,0);
  await assert.rejects(flushOutbox({directory,trust,deviceId:'synthetic-device',now:screenNow,cloud:{ack:async()=>null,publish:async()=>{throw Error('SYNTHETIC_OFFLINE');}}}),/OFFLINE/);
  assert.equal((await readOutbox(directory,trust,{now:screenNow})).length,1);
  const flushed=await flushOutbox({directory,trust,cloud,deviceId:'synthetic-device',now:screenNow,notify:async()=>{throw Error('SYNTHETIC_PUSH_FAILURE');}});
  assert.equal(flushed.results[0].push,'failed_retry_later');assert.equal(await cloud.ack('synthetic-device'),null);
  let notifications=0;const receive={cloud,trust,scope,deviceId:'synthetic-device',now:screenNow,onImported:()=>{notifications++;}};
  await assert.rejects(syncPrivateInbox({...receive,cloud:{...cloud,acknowledge:async()=>{throw Error('SYNTHETIC_ACK_LOST');}}}),/ACK_LOST/);
  const reopened=await syncPrivateInbox(receive);assert.equal(reopened.received,0);assert.equal(reopened.acknowledged,1);assert.equal(notifications,1);
  assert.equal((await importPrivateFrame(frame,trust,{scope,now:screenNow})).reused,true);
  assert.equal((await flushOutbox({directory,trust,cloud,deviceId:'synthetic-device',now:screenNow})).pending,0);
  const saved=(await readExperiments()).find(e=>e.sha256===input.sha256);assert.deepEqual(saved,input);
  const backup=await makeBackup({slips:[],preferences:{backgroundSync:false},experiments:[saved],exportedAt:screenNow});
  assert.deepEqual((await parseBackup(backup)).experiments,[input]);assert.equal(payload.actualStakeEUR,0);
 }
});
