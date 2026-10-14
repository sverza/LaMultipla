// SYNTHETIC ONLY. Ephemeral signing keys, fake routing values; no cloud or device state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {base64url,keyFingerprint} from '../shared/private-delivery.mjs';
import {validatePrivatePairing} from '../shared/private-pairing.mjs';
import {createShadowTransition,verifyShadowTransition,TRANSITION_DOMAIN} from '../shared/private-transition.mjs';
import {privateChannelPaths} from '../scripts/lib/private/channels.mjs';
import {prepareShadowProfile} from '../scripts/lib/private/shadow-profile.mjs';
import {ensureShadowReception} from '../scripts/lib/private/reception-ready.mjs';
import {deliveryPump} from '../scripts/lib/orchestration/delivery-pump.mjs';
import {enqueueDelivery} from '../scripts/lib/private/outbox.mjs';
import {digest,writeExclusive,envelope} from '../scripts/lib/prospective/store.mjs';
import {syntheticDecisionBundle} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
const now='2026-10-13T00:00:00.000Z';
async function setup(){
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),id=await keyFingerprint(spki);
  const profile={schema:'lamultipla-private-pairing-v1',projectId:'demo-shadow-private',apiKey:'SYNTHETIC_API_KEY_FOR_PRIVATE_TESTS',
    mobileAppId:'1:123:android:abcdef123456',senderId:'123',deviceId:'synthetic-device-01',
    trust:{readerUid:'SYNTHETIC_READER',applicationId:'it.personale.lamultipla.collaudo',channel:'synthetic_shadow',keys:{[id]:spki}}};
  const nextProfile={...profile,deviceId:'synthetic-device-02',trust:{...profile.trust,channel:'shadow'}};
  const cursor={sequence:4,deliveryHash:'a'.repeat(64)},frame=await createShadowTransition({profile,nextProfile,cursor,privateKey:keys.privateKey,now});
  return {keys,id,profile,nextProfile,cursor,frame};
}
test('signed shadow transition preserves reader, Firebase route and key; initial test pairing still rejects real channel',async()=>{
  const s=await setup();assert.deepEqual((await verifyShadowTransition(s.frame,{profile:s.profile,cursor:s.cursor,now})).profile,s.nextProfile);
  await assert.rejects(validatePrivatePairing(s.nextProfile,s.profile.trust.applicationId,s.id),/transizione/);
  await assert.rejects(createShadowTransition({...s,privateKey:s.keys.privateKey,now,nextProfile:{...s.nextProfile,apiKey:'SYNTHETIC_CHANGED_API_KEY_1234'}}));
  await assert.rejects(createShadowTransition({...s,privateKey:s.keys.privateKey,now,nextProfile:{...s.nextProfile,trust:{...s.nextProfile.trust,readerUid:'SYNTHETIC_OTHER'}}}));
});
test('transition rejects wrong cursor/key, altered routing and bytes, expiry/future and cross-protocol signatures',async()=>{
  const s=await setup(),args={profile:s.profile,cursor:s.cursor,now};
  const signature=base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},s.keys.privateKey,new TextEncoder().encode('lamultipla-private-delivery-v1\n'+s.frame.statement)));
  for(const frame of [{...s.frame,profileJson:s.frame.profileJson+' '},{...s.frame,signature},{...s.frame,extra:true},
    {...s.frame,statement:s.frame.statement.replace('synthetic-device-01','synthetic-device-99')},
    {...s.frame,profileJson:JSON.stringify({...s.nextProfile,mobileAppId:'1:123:android:bbbbbb'})}])await assert.rejects(verifyShadowTransition(frame,args));
  await assert.rejects(verifyShadowTransition(s.frame,{...args,cursor:{sequence:3,deliveryHash:'a'.repeat(64)}}));
  await assert.rejects(verifyShadowTransition(s.frame,{...args,now:'2026-10-12T23:59:59.000Z'}));
  await assert.rejects(verifyShadowTransition(s.frame,{...args,now:'2026-10-20T00:00:00.000Z'}));
});
async function pcSetup(t){
  const s=await setup(),root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-shadow-profile-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=privateChannelPaths(root),target=privateChannelPaths(root,'shadow');
  const queued=await enqueueDelivery({directory:source.outbox,trust:s.profile.trust,privateKey:s.keys.privateKey,
    envelope:envelope(appPackage(syntheticDecisionBundle('no_value',{now}))),now,expiresAtUtc:'2026-10-13T00:30:00.000Z'});
  await writeExclusive(path.join(source.orchestration,'receipts',digest(queued.record.frame)+'.json'),{schema:'lamultipla-delivery-pump-receipt-v1',
    tipHash:digest(queued.record.frame),sequence:1,acknowledged:1,confirmedAtUtc:now});
  const stored={config:{projectId:s.profile.projectId,apiKey:s.profile.apiKey,writerUid:'SYNTHETIC_WRITER',readerUid:s.profile.trust.readerUid,
    applicationId:s.profile.trust.applicationId,channel:'synthetic_shadow'},profile:s.profile,privateKeyPkcs8:base64url(await crypto.subtle.exportKey('pkcs8',s.keys.privateKey))};
  let next=null,saves=0;const sourceVault={load:async()=>structuredClone(stored),save:async()=>assert.fail('Original vault must not change')};
  const targetVault={load:async()=>structuredClone(next),save:async value=>{next=structuredClone(value);saves++;}};
  return {...s,root,source,target,stored,sourceVault,targetVault,now,get next(){return next;},get saves(){return saves;},tip:queued.record};
}
test('PC prepares independent shadow profile once; crash after vault resumes same key, device and signed transition',async t=>{
  const s=await pcSetup(t),oldFrame=await fs.readFile(path.join(s.source.outbox,'000000000001.json'),'utf8');
  await assert.rejects(prepareShadowProfile({...s,afterSave:async()=>{throw new Error('SYNTHETIC crash after protected save');}}));
  const result=await prepareShadowProfile(s);assert.equal(result.reused,true);assert.equal(result.networkRequests,0);assert.equal(result.receptionEnabled,false);assert.equal(s.saves,1);
  assert.equal(s.next.privateKeyPkcs8,s.stored.privateKeyPkcs8);assert.equal(s.next.profile.trust.channel,'shadow');
  assert.notEqual(s.next.profile.deviceId,s.profile.deviceId);const bytes=await fs.readFile(result.transitionFile,'utf8');
  const again=await prepareShadowProfile(s);assert.equal(again.reused,true);assert.equal(s.saves,1);assert.equal(await fs.readFile(result.transitionFile,'utf8'),bytes);
  assert.equal(await fs.readFile(path.join(s.source.outbox,'000000000001.json'),'utf8'),oldFrame);
  assert.equal(s.target.session,s.source.session);assert.equal(s.target.fcm,s.source.fcm);assert.notEqual(s.target.outbox,s.source.outbox);
});
test('unconfirmed synthetic tip blocks preparation before protecting any new private key',async t=>{
  const s=await pcSetup(t);await fs.unlink(path.join(s.source.orchestration,'receipts',digest(s.tip.frame)+'.json'));
  await assert.rejects(prepareShadowProfile(s));assert.equal(s.saves,0);
});
test('channel pump receipts and sequence one are independent from confirmed synthetic sequence',async t=>{
  const s=await pcSetup(t);await writeExclusive(path.join(s.target.outbox,'000000000001.json'),{purpose:'SYNTHETIC_ADAPTER_ONLY'});
  let calls=0;assert.equal((await deliveryPump({root:s.root,channel:'shadow',clock:()=>new Date(now),flush:async()=>{calls++;return {acknowledged:1,pending:0};}})).acknowledged,1);
  assert.equal((await deliveryPump({root:s.root,clock:()=>new Date(now),flush:async()=>assert.fail()})).networkAttempted,false);
  assert.equal(calls,1);assert.throws(()=>privateChannelPaths(s.root,'../unsafe'));
});
test('quote preflight waits for Android registration on shadow channel, not merely prepared PC credentials',async()=>{
  const s=await setup(),stored={config:{channel:'shadow'},profile:s.nextProfile};let calls=0;
  const cloud={device:async id=>{calls++;assert.equal(id,s.nextProfile.deviceId);return null;}};
  await assert.rejects(ensureShadowReception('/SYNTHETIC',{stored,cloud}),{code:'PRIVATE_SHADOW_RECEIVER_NOT_REGISTERED'});
  const ready=await ensureShadowReception('/SYNTHETIC',{stored,cloud:{device:async()=>({applicationId:s.nextProfile.trust.applicationId,fcmToken:'SYNTHETIC_FCM'})}});
  assert.equal(ready.registered,true);assert.equal(ready.oddsApiRequests,0);assert.equal(calls,1);
});
test('real Java verifier authenticates transition with separate domain and rejects delivery-domain signature',async t=>{
  let compiler='javac',prefix=[];try{execFileSync(compiler,['-version'],{stdio:'pipe'});}catch{compiler='java';prefix=['-m','jdk.compiler/com.sun.tools.javac.Main'];}
  const s=await setup(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-transition-java-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const wrong=base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},s.keys.privateKey,new TextEncoder().encode('lamultipla-private-delivery-v1\n'+s.frame.statement)));
  const vectors=[s.frame.signature,wrong].map((sig,i)=>[s.profile.trust.keys[s.id],sig,Buffer.from(s.frame.statement).toString('base64url'),i===0].join('\t')).join('\n');
  await fs.writeFile(path.join(directory,'vectors.tsv'),vectors);
  await fs.writeFile(path.join(directory,'TransitionSignatureTest.java'),`import java.nio.file.*;import java.util.Base64;import it.personale.lamultipla.PrivateSignature;
public class TransitionSignatureTest{public static void main(String[] args)throws Exception{for(String row:Files.readAllLines(Path.of(args[0]))){String[] p=row.split("\\t");if(PrivateSignature.verifyTransition(Base64.getUrlDecoder().decode(p[0]),Base64.getUrlDecoder().decode(p[1]),new String(Base64.getUrlDecoder().decode(p[2]),java.nio.charset.StandardCharsets.UTF_8))!=Boolean.parseBoolean(p[3]))throw new Exception("Domain");}System.out.print("PASS");}}`);
  const source=fileURLToPath(new URL('../android/app/src/main/java/it/personale/lamultipla/PrivateSignature.java',import.meta.url));
  execFileSync(compiler,[...prefix,'-d',directory,source,path.join(directory,'TransitionSignatureTest.java')],{stdio:'pipe'});
  assert.equal(execFileSync('java',['-cp',directory,'TransitionSignatureTest',path.join(directory,'vectors.tsv')],{encoding:'utf8'}),'PASS');assert.ok(TRANSITION_DOMAIN.endsWith('\n'));
});
