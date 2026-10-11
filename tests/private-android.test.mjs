// SYNTHETIC ONLY: ephemeral keys, adapters, no real cloud or device identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync,verify} from 'node:crypto';
import 'fake-indexeddb/auto';
import {validatePrivatePairing} from '../shared/private-pairing.mjs';
import {base64url,keyFingerprint,signDelivery,textSha256} from '../shared/private-delivery.mjs';
import {receiveAndroidPrivate} from '../shared/private-android-receiver.mjs';
import {readPrivateCursor,readPrivateDeliveryInfo} from '../shared/private-receiver.mjs';
import {createFcmNotifier,validateFcmCredential} from '../scripts/lib/private/fcm.mjs';
import {syntheticDecisionBundle,syntheticNow} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {envelope} from '../scripts/lib/prospective/store.mjs';
const applicationId='it.personale.lamultipla.collaudo',readerUid='SYNTHETIC_READER',projectId='demo-private-android',deviceId='synthetic-device-01';
async function setup(){
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),keyId=await keyFingerprint(spki);
  const trust={applicationId,readerUid,channel:'synthetic_shadow',keys:{[keyId]:spki}};
  const profile={schema:'lamultipla-private-pairing-v1',projectId,apiKey:'SYNTHETIC_API_CONFIG_123456789',mobileAppId:'1:123456:android:abcdef',senderId:'123456',deviceId,trust};
  const input=envelope(appPackage(syntheticDecisionBundle()));
  const frame=await signDelivery(input,{applicationId,readerUid,channel:trust.channel,keyId,sequence:1,previousDeliveryHash:null,expiresAtUtc:'2026-10-17T12:55:00.000Z'},keys.privateKey);
  return {keys,spki,keyId,trust,profile,frame,scope:await textSha256(spki)};
}
test('pairing requires separately checked PC fingerprint and correct APK/project sender',async()=>{
  const s=await setup();assert.deepEqual(await validatePrivatePairing(s.profile,applicationId,s.keyId),s.profile);
  for(const bad of [{...s.profile,senderId:'123457'},{...s.profile,trust:{...s.trust,channel:'shadow'}},{...s.profile,token:'FORBIDDEN'},
    {...s.profile,trust:{...s.trust,privateKey:'FORBIDDEN'}}])await assert.rejects(validatePrivatePairing(bad,applicationId,s.keyId));
  await assert.rejects(validatePrivatePairing(s.profile,applicationId,'0'.repeat(64)),/Fingerprint/);
  await assert.rejects(validatePrivatePairing(s.profile,'it.personale.lamultipla',s.keyId));
});
test('actual Java verifier accepts WebCrypto P-256 signatures and rejects altered bytes, key, length and domain',async t=>{
  let compiler='javac',prefix=[];
  try{execFileSync(compiler,['-version'],{stdio:'pipe'});}catch{
    compiler='java';prefix=['-m','jdk.compiler/com.sun.tools.javac.Main'];
    try{execFileSync(compiler,[...prefix,'-version'],{stdio:'pipe'});}catch{t.skip('JDK required for native signature interoperability');return;}
  }
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-java-signature-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const source=fileURLToPath(new URL('../android/app/src/main/java/it/personale/lamultipla/PrivateSignature.java',import.meta.url));
  const s=await setup(),other=await setup(),vectors=[];
  const message='SYNTHETIC firma · UTF-8 · 0 €';
  for(let i=0;i<12;i++){
    const raw=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},s.keys.privateKey,new TextEncoder().encode('lamultipla-private-delivery-v1\n'+message)));
    vectors.push({spki:s.spki,signature:base64url(raw),message,expected:true});
    if(i===0){vectors.push({spki:s.spki,signature:base64url(raw),message:message+' altered',expected:false});vectors.push({spki:other.spki,signature:base64url(raw),message,expected:false});
      vectors.push({spki:s.spki,signature:base64url(raw.slice(1)),message,expected:false});}
  }
  const wrong=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},s.keys.privateKey,new TextEncoder().encode(message)));
  vectors.push({spki:s.spki,signature:base64url(wrong),message,expected:false});
  const lines=vectors.map(v=>[v.spki,v.signature,Buffer.from(v.message).toString('base64url'),v.expected].join('\t')).join('\n');
  const main=`import java.nio.file.*;import java.util.Base64;import it.personale.lamultipla.PrivateSignature;
public class SignatureTest {public static void main(String[] args)throws Exception{for(String line:Files.readAllLines(Path.of(args[0]))){String[] p=line.split("\\t");boolean value=PrivateSignature.verify(Base64.getUrlDecoder().decode(p[0]),Base64.getUrlDecoder().decode(p[1]),new String(Base64.getUrlDecoder().decode(p[2]),java.nio.charset.StandardCharsets.UTF_8));if(value!=Boolean.parseBoolean(p[3]))throw new Exception("Signature interoperability");}System.out.print("PASS");}}`;
  await fs.writeFile(path.join(directory,'SignatureTest.java'),main);await fs.writeFile(path.join(directory,'vectors.tsv'),lines);
  execFileSync(compiler,[...prefix,'-d',directory,source,path.join(directory,'SignatureTest.java')],{stdio:'pipe'});
  assert.equal(execFileSync('java',['-cp',directory,'SignatureTest',path.join(directory,'vectors.tsv')],{encoding:'utf8'}),'PASS');
});
function nativeInbox(frame){let frames=[frame];const imported=[];return {imported,inbox:async()=>({frames}),archiveImported:async v=>imported.push(JSON.parse(v.json)),
  consume:async()=>{frames=[];}};}
test('phone inbox imports offline before ACK; lost ACK retains inbox, retry does not duplicate archive',async()=>{
  const s=await setup(),native=nativeInbox(s.frame);let failed=true,imports=0,acks=0;
  const hash=await textSha256(s.frame.statement),cloud={head:async()=>({sequence:1,deliveryHash:hash}),acknowledge:async()=>{if(failed)throw new Error('SYNTHETIC offline');acks++;}};
  const args={...s,native,cloud,deviceId,now:syntheticNow,onImported:()=>imports++};
  await assert.rejects(receiveAndroidPrivate(args),/offline/);assert.equal((await readPrivateCursor(s.scope)).sequence,1);
  assert.equal((await native.inbox()).frames.length,1);failed=false;
  assert.equal((await receiveAndroidPrivate(args)).sequence,1);assert.equal(imports,1);assert.equal((await native.inbox()).frames.length,0);assert.ok(acks>=1);
  const info=await readPrivateDeliveryInfo(s.scope,s.trust,{now:syntheticNow});assert.equal(info[JSON.parse(s.frame.statement).envelopeSha256].keyId,s.keyId);
  await assert.rejects(readPrivateDeliveryInfo(s.scope,{...s.trust,readerUid:'OTHER'},{now:syntheticNow}));
});
test('bad Android inbox signature never imports, acknowledges or deletes the evidence',async()=>{
  const s=await setup(),bad={...s.frame,packageJson:s.frame.packageJson+' '},native=nativeInbox(bad);let ack=0;
  await assert.rejects(receiveAndroidPrivate({...s,native,deviceId,now:syntheticNow,cloud:{acknowledge:async()=>ack++}}));
  assert.equal((await readPrivateCursor(s.scope)).sequence,0);assert.equal(ack,0);assert.equal((await native.inbox()).frames.length,1);
});
test('foreground delivery advances native archive before ACK, with one semantic import',async()=>{
  const s=await setup(),native=nativeInbox(s.frame);await native.consume();const order=[];
  native.archiveImported=async()=>order.push('native_archive');const hash=await textSha256(s.frame.statement);
  const cloud={head:async()=>({sequence:1,deliveryHash:hash}),event:async()=>({frame:s.frame}),acknowledge:async()=>{assert.equal((await readPrivateCursor(s.scope)).sequence,1);order.push('ack');}};
  const result=await receiveAndroidPrivate({...s,native,cloud,deviceId,now:syntheticNow,onImported:()=>order.push('display')});
  assert.equal(result.received,1);assert.deepEqual(order,['native_archive','display','ack']);
});
function fcmSetup(){
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const credential={type:'service_account',project_id:projectId,client_email:'synthetic@'+projectId+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'};
  const calls=[],fetchImpl=async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'error');
    if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'SYNTHETIC_OAUTH',token_type:'Bearer',expires_in:3600}));
    return new Response(JSON.stringify({name:'projects/'+projectId+'/messages/SYNTHETIC'}));};
  const args={credential,projectId,applicationId,readerUid,deviceId,fetchImpl,clock:()=>Date.parse(syntheticNow),cloud:{device:async()=>({applicationId,fcmToken:'SYNTHETIC_FCM_TOKEN_123456789'})}};
  return {args,calls,publicKey};
}
test('FCM signs scoped OAuth assertion and sends only authenticated metadata; acceptance is not ACK',async()=>{
  const s=await setup(),f=fcmSetup(),notify=createFcmNotifier(f.args);assert.deepEqual(await notify(s.frame),{accepted:true,deviceAcknowledged:false});await notify(s.frame);
  assert.equal(f.calls.filter(c=>c.url.includes('oauth2')).length,1);
  const params=new URLSearchParams(f.calls[0].options.body),jwt=params.get('assertion').split('.'),claims=JSON.parse(Buffer.from(jwt[1],'base64url'));
  assert.equal(claims.scope,'https://www.googleapis.com/auth/firebase.messaging');assert.equal(claims.exp-claims.iat,3600);
  assert.ok(verify('RSA-SHA256',Buffer.from(jwt[0]+'.'+jwt[1]),f.publicKey,Buffer.from(jwt[2],'base64url')));
  const {message}=JSON.parse(f.calls[1].options.body);assert.deepEqual(message.data,{statement:s.frame.statement,signature:s.frame.signature});assert.equal(message.notification,undefined);
  assert.equal(message.android.restricted_package_name,applicationId);assert.equal(message.android.ttl,'9600s');assert.equal(f.calls[1].options.headers.Authorization,'Bearer SYNTHETIC_OAUTH');
  assert.ok(f.calls.every(c=>!c.url.includes('firestore')));
});
test('FCM rejects expired packet, wrong recipient, wrong project and mismatched registered APK',async()=>{
  const s=await setup(),f=fcmSetup();assert.throws(()=>validateFcmCredential(f.args.credential,'other-project'),/progetto/);
  await assert.rejects(createFcmNotifier({...f.args,clock:()=>Date.parse('2026-10-17T12:55:00Z')})(s.frame),/scaduto/);
  await assert.rejects(createFcmNotifier({...f.args,readerUid:'OTHER'})(s.frame),/Destinatario/);
  await assert.rejects(createFcmNotifier({...f.args,cloud:{device:async()=>({applicationId:'other',fcmToken:'SYNTHETIC_FCM_TOKEN_123456789'})}})(s.frame),/Dispositivo/);
  assert.equal(f.calls.length,0);
});
