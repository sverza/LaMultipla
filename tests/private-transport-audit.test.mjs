// Synthetic only. Firebase/native adapters replace network and the phone; no ADB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import 'fake-indexeddb/auto';
import {auditPrivateTransport} from '../scripts/lib/private/transport-audit.mjs';
import {syntheticDecisionBundle,syntheticNow} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {envelope,digest} from '../scripts/lib/prospective/store.mjs';
import {base64url,keyFingerprint,signDelivery,verifyDelivery} from '../shared/private-delivery.mjs';
import {receiveAndroidPrivate} from '../shared/private-android-receiver.mjs';
import {readPrivateCursor,readPrivateDeliveryFrame} from '../shared/private-receiver.mjs';
async function fixture(){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),keyId=await keyFingerprint(spki);
 const trust={applicationId:'it.personale.lamultipla.collaudo',readerUid:'SYNTHETIC_READER',channel:'synthetic_shadow',keys:{[keyId]:spki}};
 const profile={projectId:'demo-transport-audit',deviceId:'synthetic-test-device',trust};
 const frame=await signDelivery(envelope(appPackage(syntheticDecisionBundle())),{applicationId:trust.applicationId,readerUid:trust.readerUid,channel:trust.channel,keyId,
  sequence:1,previousDeliveryHash:null,expiresAtUtc:'2026-10-17T12:55:00.000Z'},keys.privateKey);
 const record=await verifyDelivery(frame,trust,{now:syntheticNow});let ack=null,reads=0;
 const cloud={device:async()=>{reads++;return {applicationId:trust.applicationId,fcmToken:'SYNTHETIC_DEVICE_TOKEN',roundStateProtocol:1};},
  head:async()=>{reads++;return {sequence:1,deliveryHash:record.deliveryHash,deliveryId:record.statement.deliveryId};},
  ack:async()=>{reads++;return ack;},event:async()=>{reads++;return {...record,deliveryId:record.statement.deliveryId};},
  publish:()=>assert.fail('Audit must not publish'),registerDevice:()=>assert.fail('Audit must not register')};
 return {profile,records:[record],cloud,record,frame,scope:await keyFingerprint(spki),trust,setAck:v=>{ack=v;},reads:()=>reads};
}
test('local audit requires no ADB or cloud, distinguishes a retired test channel and cannot authorize synthetic shadow content',async()=>{
 const s=await fixture(),before=digest(s.profile),result=await auditPrivateTransport({...s,shadowPrepared:true,cloud:null,now:syntheticNow});
 assert.equal(result.adbRequired,false);assert.equal(result.cloudRead,false);assert.equal(result.sourceCompatibility.newSyntheticQueueAllowed,false);assert.equal(result.sourceCompatibility.retiredSyntheticChannel,true);
 assert.equal(digest(s.profile),before);assert.equal(s.reads(),0);assert.equal(result.deviceOnlineVerified,false);assert.equal(result.installedApkVersionVerified,false);
 const real={...s.profile,trust:{...s.trust,channel:'shadow'}};
 const active=await auditPrivateTransport({profile:real,records:[],now:syntheticNow});
 assert.equal(active.sourceCompatibility.synthetic,false);assert.equal(active.sourceCompatibility.roundStateQueueAllowed,true);
 assert.equal(active.cloudWrites,0);assert.equal(active.fcmSends,0);
});
test('without USB: native and IndexedDB durable import precede ACK; PC observes that exact immutable cloud event',async()=>{
 const s=await fixture();let cursor={sequence:0,deliveryHash:null},inbox=[],notifications=0,failMirror=true,ackWrites=0;
 const native={inbox:async()=>({frames:inbox}),cursor:async()=>({...cursor}),archiveImported:async({json})=>{
  if(failMirror)throw Error('SYNTHETIC_MIRROR_CRASH');const v=await verifyDelivery(JSON.parse(json),s.trust,{now:syntheticNow});cursor={sequence:v.statement.sequence,deliveryHash:v.deliveryHash};
 },consume:async()=>{inbox=[];}};
 const cloud={...s.cloud,acknowledge:async(_id,sequence,hash)=>{
  const idb=await readPrivateCursor(s.scope);assert.equal(idb.sequence,sequence);assert.equal(cursor.sequence,sequence);assert.equal(cursor.deliveryHash,hash);
  s.setAck({sequence,deliveryHash:hash});ackWrites++;
 }};
 const args={native,cloud,trust:s.trust,scope:s.scope,deviceId:s.profile.deviceId,now:syntheticNow,onImported:()=>{notifications++;}};
 await assert.rejects(receiveAndroidPrivate(args),/MIRROR_CRASH/);assert.equal(ackWrites,0);
 const pending=await auditPrivateTransport({...s,deliveryId:s.record.statement.deliveryId,now:syntheticNow});assert.equal(pending.status,'CLOUD_ACCEPTED_ACK_PENDING');
 assert.equal(pending.deliveryProof.ackCoversTarget,false);failMirror=false;
 await receiveAndroidPrivate(args);assert.ok(ackWrites>0);
 const result=await auditPrivateTransport({...s,deliveryId:s.record.statement.deliveryId,now:syntheticNow});
 assert.equal(result.status,'ACK_VERIFIED');assert.equal(result.deliveryProof.ackCoversTarget,true);assert.equal(result.deliveryProof.phoneUiPersistenceManuallyVerified,false);
 assert.equal(result.deliveryProof.ackProducedAtUtc,null);assert.equal(result.pending,0);assert.equal(result.adbRequired,false);
 const saved=await readPrivateDeliveryFrame(s.scope,1,s.trust,{now:syntheticNow});assert.equal(saved.deliveryHash,s.record.deliveryHash);
 await receiveAndroidPrivate(args);assert.equal(notifications,0); // Crash was before onImported; archive/cursor recovery never invents an import callback.
});
test('cloud registration and FCM token cannot be mistaken for online phone, import or ACK',async()=>{
 const s=await fixture(),result=await auditPrivateTransport({...s,now:syntheticNow});
 assert.equal(result.registrationVerified,true);assert.equal(result.roundStateProtocol,1);assert.equal(result.deviceOnlineVerified,false);assert.equal(result.acknowledged,0);assert.equal(result.pending,1);
 assert.equal(result.executionAuthorized,false);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_DEVICE_TOKEN|SYNTHETIC_READER|synthetic-test-device|privateKey|apiKey|idToken|refreshToken/);
 assert.equal(s.reads(),3);assert.equal(result.deliveryProof,null);
 s.setAck({sequence:1,deliveryHash:s.record.deliveryHash});
 const wrong=await auditPrivateTransport({...s,cloud:{...s.cloud,device:async()=>({applicationId:'it.personale.lamultipla',fcmToken:'SYNTHETIC'})},deliveryId:s.record.statement.deliveryId,now:syntheticNow});
 assert.equal(wrong.status,'RECEIVER_NOT_REGISTERED');assert.equal(wrong.registrationVerified,false);
});
test('inconsistent head, ACK, target identity, altered event and Firebase failure fail closed without writes',async()=>{
 const s=await fixture();
 await assert.rejects(auditPrivateTransport({...s,records:[{...s.record,frame:{...s.frame,signature:s.frame.signature.slice(1)}}],now:syntheticNow}));assert.equal(s.reads(),0);
 await assert.rejects(auditPrivateTransport({...s,cloud:{...s.cloud,head:async()=>({sequence:2,deliveryHash:'a'.repeat(64)})},now:syntheticNow}),/HEAD_CONFLICT/);
 s.setAck({sequence:1,deliveryHash:'a'.repeat(64)});await assert.rejects(auditPrivateTransport({...s,now:syntheticNow}),/ACK_CONFLICT/);
 s.setAck(null);
 await assert.rejects(auditPrivateTransport({...s,deliveryId:'a'.repeat(64),now:syntheticNow}),/NOT_IN_LOCAL_OUTBOX/);
 await assert.rejects(auditPrivateTransport({...s,cloud:{...s.cloud,event:async()=>({...s.record,frame:{...s.frame,signature:'ALTERED'}})},deliveryId:s.record.statement.deliveryId,now:syntheticNow}),/EVENT_CONFLICT/);
 await assert.rejects(auditPrivateTransport({...s,cloud:{...s.cloud,device:async()=>{throw Error('SYNTHETIC_HTTP_403');}},now:syntheticNow}),/HTTP_403/);
});
test('an archived expired event can have ACK evidence without claiming receipt before expiry',async()=>{
 const s=await fixture(),now='2026-10-18T10:00:00.000Z';
 s.records=[await verifyDelivery(s.frame,s.trust,{now,archiveExpired:true})];s.setAck({sequence:1,deliveryHash:s.record.deliveryHash});
 const r=await auditPrivateTransport({...s,deliveryId:s.record.statement.deliveryId,now});
 assert.equal(r.status,'ACK_VERIFIED');assert.equal(r.deliveryProof.expiredNow,true);assert.equal(r.deliveryProof.ackProducedAtUtc,null);assert.equal(r.deliveryProof.ackObservedAtUtc,now);
});
test('manual CLI exposes no delivery, scheduler, clock override or ADB option',()=>{
 const help=spawnSync(process.execPath,['scripts/private-transport-audit.mjs','--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/Default local: no network/);
 for(const option of ['--send','--queue','--watch','--clock','--adb'])assert.notEqual(spawnSync(process.execPath,['scripts/private-transport-audit.mjs',option],{encoding:'utf8'}).status,0);
});
