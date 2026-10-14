import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {syntheticDeliveryCases,prepareSyntheticDeliveryBatch} from '../scripts/lib/private/synthetic-selftest.mjs';
import {readSnapshot,envelope,digest} from '../scripts/lib/prospective/store.mjs';
import {verifyDecisionBundle} from '../scripts/lib/decision/delivery.mjs';
import {syntheticDecisionBundle} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {enqueueDelivery,readOutbox} from '../scripts/lib/private/outbox.mjs';
import {base64url,keyFingerprint,verifyDelivery} from '../shared/private-delivery.mjs';
const now='2026-10-12T20:00:00.000Z';
test('fresh synthetic cases use shadow replay, coherent times and distinct rounds without betting authorization',()=>{
  const cases=syntheticDeliveryCases(now);
  assert.deepEqual(cases.map(c=>[c.envelope.payload.status,c.envelope.payload.shadowCause]),[['simulation',null],['no_bet','NO_VALUE'],['no_bet','SELECTION_REVIEW_REQUIRED']]);
  assert.deepEqual(cases.map(c=>c.envelope.payload.round.matchday),[7,8,9]);
  for(const {bundle,envelope:{payload:p}} of cases){
    assert.equal(verifyDecisionBundle(bundle).verified,true);assert.equal(p.generatedAtUtc,now);
    assert.equal(p.sourceData,'synthetic_test');assert.equal(p.actualStakeEUR,0);assert.equal(p.operational.authorized,false);assert.equal(p.operational.publicationAllowed,false);
    assert.equal(p.final,false);assert.ok(Date.parse(bundle.journal.provenance.datasetAcquiredAtUtc)<Date.parse(bundle.journal.generatedAtUtc));
    assert.ok(Date.parse(bundle.journal.generatedAtUtc)<Date.parse(bundle.report.fetchedAtUtc));
    assert.ok(bundle.journal.entries.every(e=>Date.parse(e.kickoffUtc)>Date.parse(now)));
  }
});
test('original Windows synthetic fixture hashes stay byte compatible',()=>{
  assert.deepEqual(['simulation','no_value','missing_rules'].map(k=>digest(appPackage(syntheticDecisionBundle(k)))),[
    '7087f7bd13e981b2b7625afd268ad2a284ad7923b04ac697a9f5e4d4571bfeda',
    'b4aaefee31ad355ad084b7e97837e00763a58cacb17193613a8593edb3030ceb',
    'af587e5d27f8619ecc8cf8de7ed6cf9265b246fcaf2c22ad4f217cfbbcf95c87']);
});
test('new local batch preserves package and audit integrity without replacing previous files',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-synthetic-batch-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const sentinel=path.join(directory,'original.json');await fs.writeFile(sentinel,'SYNTHETIC ORIGINAL');
  const result=await prepareSyntheticDeliveryBatch(directory,{now});assert.equal(result.queued,false);assert.equal(result.apiRequests,0);
  for(const file of result.files){assert.equal(digest(await readSnapshot(file.file)),file.sha256);
    assert.equal(verifyDecisionBundle(await readSnapshot(file.file.replace('.json','-audit.json'))).verified,true);}
  assert.equal(await fs.readFile(sentinel,'utf8'),'SYNTHETIC ORIGINAL');
  const next=await prepareSyntheticDeliveryBatch(directory,{now});assert.notEqual(path.dirname(next.files[0].file),path.dirname(result.files[0].file));
  assert.deepEqual(next.files.map(f=>f.sha256),result.files.map(f=>f.sha256));
});
test('fresh packages enter signed outbox at actual clock, retry deduplicates and expired recovery stays archive only',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-synthetic-delivery-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),id=await keyFingerprint(spki);
  const trust={readerUid:'SYNTHETIC_READER',applicationId:'it.personale.lamultipla.collaudo',channel:'synthetic_shadow',keys:{[id]:spki}};
  const expiresAtUtc=new Date(Date.parse(now)+30*60000).toISOString();
  for(const c of syntheticDeliveryCases(now)){
    const args={directory,envelope:c.envelope,trust,privateKey:keys.privateKey,expiresAtUtc,now};
    const first=await enqueueDelivery(args),retry=await enqueueDelivery(args);
    assert.equal(retry.reused,true);assert.equal(retry.record.frame.signature,first.record.frame.signature);
    await assert.rejects(verifyDelivery(first.record.frame,trust,{now:expiresAtUtc}),/scaduta/);
    assert.equal((await verifyDelivery(first.record.frame,trust,{now:expiresAtUtc,archiveExpired:true})).expired,true);
  }
  assert.equal((await readOutbox(directory,trust,{now})).length,3);
});
test('bad synthetic clocks and attempts to reuse protected round are refused',()=>{
  assert.throws(()=>syntheticDeliveryCases('not a date'));
  assert.throws(()=>syntheticDeliveryCases('2026-10-01T00:00:00.000Z'));
  assert.throws(()=>syntheticDecisionBundle('simulation',{now,matchday:6}));
  assert.throws(()=>syntheticDecisionBundle('real',{now}));
  assert.equal(envelope(appPackage(syntheticDecisionBundle())).payload.sourceData,'synthetic_test');
});
