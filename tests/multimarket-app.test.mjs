import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import 'fake-indexeddb/auto';
import {syntheticMultimarketApp} from './fixtures/multimarket-app.mjs';
import {buildMultimarketDisplay,parseMultimarketEnvelope,verifyMultimarketFrame,signMultimarketFrame,multimarketStatus} from '../shared/multimarket-experiment.mjs';
import {importMultimarketTrust,importMultimarketFrame,readMultimarketExperiments,exportMultimarketBackup,validateMultimarketBackup,restoreMultimarketBackup,MULTIMARKET_DATABASE} from '../shared/multimarket-store.mjs';
import {isExperimentalInput,parseDecisionEnvelope} from '../shared/decision-v4.mjs';
import {parseBackup} from '../shared/experimental-store.mjs';
import {textSha256} from '../shared/private-delivery.mjs';
const clear=()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(MULTIMARKET_DATABASE);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
test.beforeEach(clear);
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lm-mm-ui-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return syntheticMultimarketApp(root);}
test('MM display: three signed states, exact international data and theoretical/actual ticket distinction',async t=>{
 const s=await setup(t),expected={simulation:'MULTIPLA_ESPLORATIVA',noBet:'NO_BET_ESPLORATIVO',incomplete:'ANALYSIS_INCOMPLETE'};
 for(const [name,frame]of Object.entries(s.frames)){
  const v=await verifyMultimarketFrame(frame,s.trust,{now:new Date(s.now)});assert.equal(v.envelope.payload.status,expected[name]);
  assert.equal(v.envelope.payload.actualStakeEUR,0);assert.equal(v.envelope.payload.report.sourceKind,'SYNTHETIC_TEST_ONLY');
  assert.ok(v.envelope.payload.report.combinations.every(c=>c.actualCombinedPrice===null&&c.verifiedCombinedEV===null&&c.jointProbability===null));
 }
});
test('MM display: partial universe, missing data and search truncation cannot be relabeled a complete NO BET',async t=>{
 const s=await setup(t),r=structuredClone(s.reports.incomplete);r.state='COMPLETE_SLOT_NO_COMBINATIONS';r.combinations=[];
 assert.throws(()=>multimarketStatus(r),/incompleto/);const p=structuredClone(s.reports.simulation);p.counts.truncated=true;
 assert.throws(()=>multimarketStatus(p),/incompleto/);
});
test('MM display: payload, signature, manifest and fingerprint alteration are rejected',async t=>{
 const s=await setup(t),frame=structuredClone(s.frames.simulation);frame.envelope.payload.actualStakeEUR=3;
 await assert.rejects(verifyMultimarketFrame(frame,s.trust,{now:new Date(s.now)}),/hash/);
 const signed=structuredClone(s.frames.simulation);signed.signature=signed.signature.slice(0,-2)+'aa';await assert.rejects(verifyMultimarketFrame(signed,s.trust,{now:new Date(s.now)}));
 await assert.rejects(verifyMultimarketFrame(s.frames.simulation,{...s.trust,keyId:'a'.repeat(64)},{now:new Date(s.now)}));
 const envelope=structuredClone(s.frames.simulation.envelope);envelope.payload.manifest.events[0].home='SYNTHETIC WRONG';envelope.payload.fixtures[0].home='SYNTHETIC WRONG';
 envelope.sha256=await textSha256(JSON.stringify(envelope.payload));await assert.rejects(parseMultimarketEnvelope(envelope));
});
test('MM display: synthetic artifacts cannot impersonate genuine forecasts or enter v4/legacy archives',async t=>{
 const s=await setup(t),r=structuredClone(s.reports.simulation);r.sourceKind='VERIFIED_LOCAL_FREEZE_ARCHIVE';
 await assert.rejects(buildMultimarketDisplay(r,s.f.manifest,{generatedAtUtc:s.now}),/sintetici/);
 assert.equal(isExperimentalInput(s.frames.simulation),true);assert.equal(isExperimentalInput(s.frames.simulation.envelope),true);
 await assert.rejects(parseDecisionEnvelope(s.frames.simulation.envelope));
 await assert.rejects(parseBackup({app:'seriea-multipla',version:3,slips:[s.frames.simulation]}),/storico/);
});
test('MM store: verified import is durable and idempotent; unknown keys and changed duplicate signatures have no partial writes',async t=>{
 const s=await setup(t);await assert.rejects(importMultimarketFrame(s.frames.simulation,{now:new Date(s.now)}),/chiave pubblica/);
 await importMultimarketTrust(s.trust);assert.equal((await importMultimarketFrame(s.frames.simulation,{now:new Date(s.now)})).reused,false);
 assert.equal((await importMultimarketFrame(s.frames.simulation,{now:new Date(s.now)})).reused,true);
 const resigned=await signMultimarketFrame(s.frames.simulation.envelope,s.trust,s.keys.privateKey,{signedAtUtc:s.now,expiresAtUtc:s.expiresAtUtc});
 await assert.rejects(importMultimarketFrame(resigned,{now:new Date(s.now)}),/conflitto/);
 assert.equal((await readMultimarketExperiments({now:new Date(s.now)})).length,1);
});
test('MM store: expired imports stop, historical reads are marked expired without renewing timestamps',async t=>{
 const s=await setup(t);await importMultimarketTrust(s.trust);await importMultimarketFrame(s.frames.simulation,{now:new Date(s.now)});
 const after=new Date(Date.parse(s.now)+3600000);await assert.rejects(importMultimarketFrame(s.frames.noBet,{now:after}),/scaduto/);
 const [stored]=await readMultimarketExperiments({now:after});assert.equal(stored.expired,true);assert.equal(stored.statement.signedAtUtc,s.now);
});
test('MM backup: exact signed roundtrip, expired restore, rejection before writes, existing v4 and legacy data untouched',async t=>{
 const historic=[];for(const name of ['seriea-multipla','lamultipla-experiments']){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onupgradeneeded=()=>r.result.createObjectStore('preserved-history',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const row={id:'SYNTHETIC_EXISTING_HISTORY',stake:3,returnAmount:17.2,untouchedMarker:name};await new Promise(resolve=>{const tx=db.transaction('preserved-history','readwrite');tx.objectStore('preserved-history').put(row);tx.oncomplete=resolve;});historic.push({db,row});
 }
 const s=await setup(t);await importMultimarketTrust(s.trust);for(const frame of Object.values(s.frames))await importMultimarketFrame(frame,{now:new Date(s.now)});
 const before=await readMultimarketExperiments({now:new Date(s.now)}),backup=await exportMultimarketBackup({now:new Date(s.now)});
 const bad=structuredClone(backup);bad.payload.frames[1].signature='bad';await assert.rejects(validateMultimarketBackup(bad,{now:new Date(s.now)}));
 assert.deepEqual(await readMultimarketExperiments({now:new Date(s.now)}),before);await clear();
 await restoreMultimarketBackup(backup,{now:new Date(Date.parse(s.now)+3600000)});
 assert.deepEqual((await readMultimarketExperiments({now:new Date(Date.parse(s.now)+3600000)})).map(v=>v.frame),before.map(v=>v.frame));
 for(const {db,row}of historic){const after=await new Promise(resolve=>{const r=db.transaction('preserved-history').objectStore('preserved-history').get(row.id);r.onsuccess=()=>resolve(r.result);});assert.deepEqual(after,row);db.close();}
});
