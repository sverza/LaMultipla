// Synthetic software preparation, never a model validation or real device write.
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {progressiveDeliveryVectors} from './fixtures/progressive-delivery.mjs';
import {importPrivateFrame,readPrivateCursor} from '../shared/private-receiver.mjs';
import {verifyDelivery} from '../shared/private-delivery.mjs';
import {ensureShadowReception} from '../scripts/lib/private/reception-ready.mjs';
import {parseBackup} from '../shared/experimental-store.mjs';
import {syntheticDecisionBundle} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {envelope,digest} from '../scripts/lib/prospective/store.mjs';
test('provisional states, shadow proposal and terminal no bet preserve one signed sequence without duplicate archive entries',async()=>{
  const d=await progressiveDeliveryVectors(),trust=d.profile.trust,scope='c'.repeat(64);
  for(const c of d.cases){
    const first=await importPrivateFrame(c.frame,trust,{scope,now:d.nowUtc});assert.equal(first.reused,false);
    const duplicate=await importPrivateFrame(c.frame,trust,{scope,now:d.nowUtc});assert.equal(duplicate.reused,true);
  }
  assert.equal((await readPrivateCursor(scope)).sequence,5);
  const original=d.cases[0].frame,bad={...original,packageJson:original.packageJson.replace('NO_BET_PROVISIONAL','NO_BET_FINAL')};
  await assert.rejects(importPrivateFrame(bad,trust,{scope,now:d.nowUtc}));assert.equal((await readPrivateCursor(scope)).sequence,5);
  const expired=new Date(Date.parse(d.nowUtc)+30*60000);await assert.rejects(verifyDelivery(d.cases[3].frame,trust,{now:expired}),/scadut/);
});
test('authenticated device upgrade preflight distinguishes existing pairing from new round-state capability',async()=>{
  const stored={config:{channel:'shadow'},profile:{deviceId:'synthetic-device',trust:{channel:'shadow',applicationId:'it.personale.lamultipla.collaudo'}}};
  const device={applicationId:stored.profile.trust.applicationId,fcmToken:'SYNTHETIC_FCM',roundStateProtocol:undefined};
  const cloud={device:async()=>device};
  assert.equal((await ensureShadowReception('unused',{stored,cloud})).registered,true);
  await assert.rejects(ensureShadowReception('unused',{stored,cloud,requiredRoundState:true}),e=>e.code==='PRIVATE_RECEIVER_UPGRADE_REQUIRED');
  device.roundStateProtocol=1;assert.equal((await ensureShadowReception('unused',{stored,cloud,requiredRoundState:true})).registered,true);
});
test('mixed backup keeps eight previous v4 experiments byte-identical beside new round updates',async()=>{
  const now='2026-10-14T09:00:00.000Z',old=Array.from({length:8},(_,i)=>envelope(appPackage(syntheticDecisionBundle('no_value',{now,matchday:20+i}))));
  const hashes=old.map(digest),vectors=await progressiveDeliveryVectors(now),added=vectors.cases.map(c=>JSON.parse(c.frame.packageJson));
  const result=await parseBackup({app:'seriea-multipla',version:4,slips:[],preferences:{backgroundSync:false},experiments:[...old,...added]});
  assert.equal(result.experiments.length,13);assert.deepEqual(result.experiments.slice(0,8).map(digest),hashes);assert.equal(result.slips.length,0);
});
