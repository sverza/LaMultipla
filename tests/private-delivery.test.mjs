// SYNTHETIC TEST ONLY: no real service, API, user identity or signing key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import 'fake-indexeddb/auto';
import {syntheticDecisionBundle,syntheticNow} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {envelope} from '../scripts/lib/prospective/store.mjs';
import {base64url,keyFingerprint,signDelivery,verifyDelivery,canonical,textSha256} from '../shared/private-delivery.mjs';
import {enqueueDelivery,readOutbox,flushOutbox,privateLock} from '../scripts/lib/private/outbox.mjs';
import {createPrivateCloud} from '../shared/private-cloud.mjs';
import {receiverScope,importPrivateFrame,readPrivateCursor,syncPrivateInbox} from '../shared/private-receiver.mjs';
import {readExperiments,makeBackup,parseBackup,mergeExperiments} from '../shared/experimental-store.mjs';
import {createPrivateAuth} from '../shared/private-auth.mjs';
import {protectSecret} from '../scripts/lib/private/windows-vault.mjs';
const now=new Date(syntheticNow),expiresAtUtc='2026-10-17T12:55:00.000Z';
async function setup(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-private-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),keyId=await keyFingerprint(spki);
  const trust={readerUid:'SYNTHETIC_READER',channel:'synthetic_shadow',applicationId:'it.personale.lamultipla.collaudo',keys:{[keyId]:spki}};
  const config={projectId:'demo-lamultipla-test',readerUid:trust.readerUid,channel:trust.channel};
  // Unique synthetic scope keeps independent tests isolated in the same IDB.
  const scope=await textSha256(directory),input=envelope(appPackage(syntheticDecisionBundle()));
  const options={...trust,keyId,sequence:1,previousDeliveryHash:null,expiresAtUtc};delete options.keys;
  const frame=await signDelivery(input,options,keys.privateKey);
  return {directory,trust,config,scope,input,frame,options,privateKey:keys.privateKey};
}
function fakeFirestore(){
  const docs=new Map(),requests=[];let version=0,failAfterCommit=false;
  const fetchImpl=async(url,options)=>{
    requests.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_AUTH');
    const base='https://firestore.googleapis.com/v1/',name=url.slice(base.length);
    if(options.method==='GET')return new Response(docs.has(name)?JSON.stringify(docs.get(name)):null,{status:docs.has(name)?200:404});
    assert.ok(url.endsWith('/documents:commit'));const {writes}=JSON.parse(options.body);
    for(const w of writes){const old=docs.get(w.update.name),condition=w.currentDocument;
      if(condition.exists===false&&old||condition.updateTime&&old?.updateTime!==condition.updateTime)return new Response(null,{status:409});}
    for(const w of writes)docs.set(w.update.name,{...w.update,updateTime:'SYNTHETIC-'+(++version)});
    if(failAfterCommit){failAfterCommit=false;throw new Error('SYNTHETIC response lost after atomic commit');}
    return new Response('{}');
  };
  return {docs,requests,fetchImpl,loseCommitResponse:()=>{failAfterCommit=true;}};
}
function cloudFor(s,server){return createPrivateCloud(s.config,{getIdToken:async()=>'SYNTHETIC_AUTH',fetchImpl:server.fetchImpl});}
test('device registration confirms lost commit response and skips identical token without another write',async t=>{
  const s=await setup(t),server=fakeFirestore(),cloud=cloudFor(s,server),token='SYNTHETIC_DEVICE_TOKEN_123456';
  server.loseCommitResponse();await cloud.registerDevice('synthetic-device',token,s.trust.applicationId);
  await cloud.registerDevice('synthetic-device',token,s.trust.applicationId);
  assert.deepEqual(await cloud.device('synthetic-device'),{fcmToken:token,applicationId:s.trust.applicationId});
  assert.equal(server.requests.filter(r=>r.options.method==='POST').length,1);
});
test('device CAS conflict recovers only exact desired token; 403 never becomes success or a retry',async t=>{
  const s=await setup(t),server=fakeFirestore(),token='SYNTHETIC_DEVICE_TOKEN_123456';let deny=false,posts=0;
  const fetchImpl=async(url,options)=>{
    if(options.method==='POST'){posts++;if(deny)return new Response(null,{status:403});
      await server.fetchImpl(url,options);return new Response(null,{status:409});}
    return server.fetchImpl(url,options);
  };
  const cloud=createPrivateCloud(s.config,{getIdToken:async()=>'SYNTHETIC_AUTH',fetchImpl});
  await cloud.registerDevice('synthetic-device',token,s.trust.applicationId);assert.equal(posts,1);
  deny=true;await assert.rejects(cloud.registerDevice('synthetic-device',token+'-rotated',s.trust.applicationId),/403/);
  assert.equal(posts,2);assert.equal((await cloud.device('synthetic-device')).fcmToken,token);
});
test('existing experiment DB v1 upgrades without losing snapshots; legacy slips remain untouched',async t=>{
  const s=await setup(t),db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lamultipla-experiments',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('snapshots',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').add({id:s.input.sha256,envelope:s.input});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  assert.ok((await readExperiments()).some(e=>e.sha256===s.input.sha256));
  const upgraded=await new Promise(resolve=>{const r=indexedDB.open('lamultipla-experiments');r.onsuccess=()=>resolve(r.result);});
  assert.equal(upgraded.version,2);assert.deepEqual([...upgraded.objectStoreNames],['private-cursors','private-deliveries','private-finals','snapshots']);upgraded.close();
  const legacy=await new Promise(resolve=>{const r=indexedDB.open('seriea-multipla',2);r.onupgradeneeded=()=>r.result.createObjectStore('slips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
  const historic={id:'SYNTHETIC_HISTORIC',playedOdd:5.5,returnAmount:16.5};
  await new Promise(resolve=>{const tx=legacy.transaction('slips','readwrite');tx.objectStore('slips').put(historic);tx.oncomplete=resolve;});
  await importPrivateFrame(s.frame,s.trust,{scope:s.scope,now});
  const result=await new Promise(resolve=>{const r=legacy.transaction('slips').objectStore('slips').get(historic.id);r.onsuccess=()=>resolve(r.result);});
  assert.deepEqual(result,historic);legacy.close();
});
test('signed v4 carries an authentic simulation; SHA alone cannot authenticate sender',async t=>{
  const s=await setup(t),v=await verifyDelivery(s.frame,s.trust,{now});
  assert.equal(v.statement.status,'simulation');assert.equal(v.envelope.payload.actualStakeEUR,0);assert.equal(v.envelope.payload.operational.authorized,false);
  const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const forged=await signDelivery(s.input,s.options,other.privateKey);await assert.rejects(verifyDelivery(forged,s.trust,{now}),/firma/);
});
test('reject altered package, manifest, signature, recipient and synthetic channel confusion',async t=>{
  const s=await setup(t);
  for(const field of ['packageJson','statement','signature']){const f=structuredClone(s.frame);f[field]+=' ';await assert.rejects(verifyDelivery(f,s.trust,{now}));}
  await assert.rejects(verifyDelivery(s.frame,{...s.trust,readerUid:'OTHER_READER'},{now}),/destinatario/);
  await assert.rejects(verifyDelivery(s.frame,{...s.trust,applicationId:'it.personale.lamultipla'},{now}),/destinatario/);
  await assert.rejects(signDelivery(s.input,{...s.options,channel:'shadow'},s.privateKey),/canale/);
  const changed=structuredClone(s.input);changed.payload.round.matchday=8;await assert.rejects(signDelivery(changed,s.options,s.privateKey),/hash/i);
});
test('future generation rejected; expired signed package recoverable only as archive',async t=>{
  const s=await setup(t);await assert.rejects(verifyDelivery(s.frame,s.trust,{now:'2026-10-17T10:14:59.000Z'}),/futura/);
  await assert.rejects(verifyDelivery(s.frame,s.trust,{now:expiresAtUtc}),/scaduta/);
  assert.equal((await verifyDelivery(s.frame,s.trust,{now:expiresAtUtc,archiveExpired:true})).expired,true);
});
test('outbox crash after durable write reuses exact signature and file; malformed retry rejected',async t=>{
  const s=await setup(t),args={...s,envelope:s.input,expiresAtUtc,now};
  await assert.rejects(enqueueDelivery({...args,afterWrite:()=>{throw new Error('SYNTHETIC crash');}}),/crash/);
  const result=await enqueueDelivery(args);assert.equal(result.reused,true);assert.equal((await readOutbox(s.directory,s.trust,{now})).length,1);
  const bad=structuredClone(s.input);bad.payload.round.matchday=8;await assert.rejects(enqueueDelivery({...args,envelope:bad}),/hash/i);
  assert.equal((await fs.readdir(s.directory)).filter(n=>n.endsWith('.json')).length,1);
});
test('outbox freezes final and prevents a second final or subsequent preview',async t=>{
  const s=await setup(t),p=structuredClone(s.input.payload);p.final=true;
  await enqueueDelivery({...s,envelope:envelope(p),expiresAtUtc,now});
  await assert.rejects(enqueueDelivery({...s,envelope:s.input,expiresAtUtc,now}),/Finale/);
  const next=appPackage(syntheticDecisionBundle('no_value'));next.final=true;
  await assert.rejects(enqueueDelivery({...s,envelope:envelope(next),expiresAtUtc,now}),/Finale/);
});
test('two processes cannot enter writer critical section concurrently; abandoned participants recover',async t=>{
  const s=await setup(t),lockModule=new URL('../scripts/lib/private/outbox.mjs',import.meta.url).href;
  const source=`import {privateLock} from ${JSON.stringify(lockModule)};await privateLock(process.argv[1],async()=>{process.stdout.write('LOCKED\\n');await new Promise(r=>process.stdin.once('data',r));});`;
  const child=spawn(process.execPath,['--input-type=module','-e',source,s.directory],{stdio:['pipe','pipe','pipe']});
  t.after(()=>child.kill());await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error('Child lock failed'));});});
  await assert.rejects(privateLock(s.directory,async()=>assert.fail('concurrent entry')),/già in esecuzione/);
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
  const orphan=path.join(s.directory,'locks',`${child.pid}-00000000-0000-0000-0000-000000000000.json.tmp`);await fs.writeFile(orphan,'unfinished');
  assert.equal(await privateLock(s.directory,async()=>true),true);assert.deepEqual(await fs.readdir(path.join(s.directory,'locks')),[]);
});
test('REST atomic publication lost response retries immutable record without duplication',async t=>{
  const s=await setup(t),server=fakeFirestore(),cloud=cloudFor(s,server);server.loseCommitResponse();
  await assert.rejects(cloud.publish(s.frame),/lost/);assert.deepEqual(await cloud.publish(s.frame),{accepted:true,duplicate:true});
  assert.equal((await cloud.head()).sequence,1);assert.equal((await cloud.event(1)).frame.signature,s.frame.signature);
  const altered=structuredClone(s.frame);altered.signature=(altered.signature[0]==='A'?'B':'A')+altered.signature.slice(1);await assert.rejects(cloud.publish(altered),/Conflitto/);
  const commit=server.requests.find(r=>r.options.method==='POST');assert.equal(JSON.parse(commit.options.body).writes.length,2);
});
test('offline phone and failed push leave delivery pending; device ACK is separate from FCM acceptance',async t=>{
  const s=await setup(t),server=fakeFirestore(),cloud=cloudFor(s,server),deviceId='synthetic-device';
  await enqueueDelivery({...s,envelope:s.input,expiresAtUtc,now});
  const failed=await flushOutbox({...s,cloud,deviceId,now,notify:async()=>{throw new Error('SYNTHETIC offline');}});
  assert.equal(failed.pending,1);assert.equal(failed.results[0].push,'failed_retry_later');assert.equal(await cloud.ack(deviceId),null);
  const accepted=await flushOutbox({...s,cloud,deviceId,now,notify:async()=>{}});assert.equal(accepted.results[0].push,'accepted_not_device_ack');
  await cloud.acknowledge(deviceId,1,(await verifyDelivery(s.frame,s.trust,{now})).deliveryHash);
  const done=await flushOutbox({...s,cloud,deviceId,now});assert.equal(done.pending,0);assert.equal(done.results.length,0);
});
test('private import commits chain and experiment atomically, replay deduplicates, altered chain cannot advance',async t=>{
  const s=await setup(t),first=await importPrivateFrame(s.frame,s.trust,{scope:s.scope,now});
  assert.equal(first.reused,false);assert.equal((await importPrivateFrame(s.frame,s.trust,{scope:s.scope,now})).reused,true);
  assert.equal((await readPrivateCursor(s.scope)).sequence,1);
  const second=await signDelivery(s.input,{...s.options,sequence:2,previousDeliveryHash:'f'.repeat(64)},s.privateKey);
  await assert.rejects(importPrivateFrame(second,s.trust,{scope:s.scope,now}),/sequenza/);assert.equal((await readPrivateCursor(s.scope)).sequence,1);
});
test('lost ACK after import retries on next open without importing/notifying twice',async t=>{
  const s=await setup(t),server=fakeFirestore(),cloud=cloudFor(s,server);await cloud.publish(s.frame);let calls=0;
  const fail={...cloud,acknowledge:async()=>{throw new Error('SYNTHETIC ACK network loss');}};
  const args={trust:s.trust,scope:s.scope,deviceId:'synthetic-device',now,onImported:()=>{calls++;}};
  await assert.rejects(syncPrivateInbox({...args,cloud:fail}),/ACK/);
  assert.equal((await readPrivateCursor(s.scope)).sequence,1);
  const result=await syncPrivateInbox({...args,cloud});assert.equal(result.received,0);assert.equal(result.acknowledged,1);assert.equal(calls,1);
});
test('PC can be off after upload: phone retrieves durable signed data after expiry, archive persists in v4 backup',async t=>{
  const s=await setup(t),server=fakeFirestore(),cloud=cloudFor(s,server);await cloud.publish(s.frame);let expired;
  const result=await syncPrivateInbox({cloud,trust:s.trust,scope:s.scope,deviceId:'synthetic-device',now:'2026-10-18T10:00:00.000Z',onImported:r=>{expired=r.expired;}});
  assert.equal(result.received,1);assert.equal(expired,true);
  const experiments=await readExperiments(),backup=await makeBackup({slips:[],preferences:{backgroundSync:false},experiments,exportedAt:syntheticNow});
  assert.equal((await parseBackup(backup)).slips.length,0);await mergeExperiments(backup.experiments);
  assert.equal((await readExperiments()).filter(e=>e.sha256===s.input.sha256).length,1);
});
test('private scopes bind cloud project, receiver, application and channel',async t=>{
  const s=await setup(t),id=await receiverScope(s.config,s.trust);
  assert.notEqual(id,await receiverScope({...s.config,projectId:'demo-other-project'},s.trust));
  assert.notEqual(id,await receiverScope(s.config,{...s.trust,applicationId:'it.personale.lamultipla'}));
});
test('bounded catch-up imports signed NO BETs in order, rejects rollback and freezes final locally',async t=>{
  const s=await setup(t),server=fakeFirestore(),cloud=cloudFor(s,server);await cloud.publish(s.frame);
  const first=await verifyDelivery(s.frame,s.trust,{now}),p=appPackage(syntheticDecisionBundle('missing_rules'));
  const second=await signDelivery(envelope(p),{...s.options,sequence:2,previousDeliveryHash:first.deliveryHash},s.privateKey);
  await cloud.publish(second);p.final=true;
  const v2=await verifyDelivery(second,s.trust,{now}),third=await signDelivery(envelope(p),{...s.options,sequence:3,previousDeliveryHash:v2.deliveryHash},s.privateKey);
  await cloud.publish(third);
  const args={cloud,trust:s.trust,scope:s.scope,deviceId:'synthetic-device',now,limit:1};
  const one=await syncPrivateInbox(args);assert.equal(one.pending,2);assert.equal(one.received,1);
  const rest=await syncPrivateInbox({...args,limit:16});assert.equal(rest.received,2);assert.equal(rest.pending,0);
  await assert.rejects(syncPrivateInbox({...args,cloud:{...cloud,head:async()=>({sequence:1,deliveryHash:first.deliveryHash})}}),/Rollback/);
  const v3=await verifyDelivery(third,s.trust,{now}),fourth=await signDelivery(s.input,{...s.options,sequence:4,previousDeliveryHash:v3.deliveryHash},s.privateKey);
  await assert.rejects(importPrivateFrame(fourth,s.trust,{scope:s.scope,now}),/Finale/);assert.equal((await readPrivateCursor(s.scope)).sequence,3);
});
test('Firebase identity mismatch refused before saving; refresh is serialized and secrets stay in secure adapter',async()=>{
  let stored=null,saves=0,refreshes=0,clock=0;
  const fetchImpl=async(url,options)=>{
    assert.equal(options.redirect,'error');if(url.includes('securetoken')){refreshes++;assert.match(options.body,/grant_type=refresh_token/);
      return new Response(JSON.stringify({user_id:'SYNTHETIC_READER',id_token:'SYNTHETIC_RENEWED',refresh_token:'SYNTHETIC_REFRESH',expires_in:'3600'}));}
    return new Response(JSON.stringify({localId:'SYNTHETIC_READER',idToken:'SYNTHETIC_ID',refreshToken:'SYNTHETIC_REFRESH',expiresIn:'3600'}));
  };
  const options={fetchImpl,load:async()=>stored,save:async v=>{stored=v;saves++;},clock:()=>clock};
  const auth=createPrivateAuth({apiKey:'SYNTHETIC_CONFIG_TEST_ONLY',expectedUid:'SYNTHETIC_READER'},options);
  await auth.signIn('synthetic@example.invalid','SYNTHETIC_TEST_ONLY');clock=3600000;
  assert.deepEqual(await Promise.all([auth.getIdToken(),auth.getIdToken()]),['SYNTHETIC_RENEWED','SYNTHETIC_RENEWED']);assert.equal(refreshes,1);
  const wrong=createPrivateAuth({apiKey:'SYNTHETIC_CONFIG_TEST_ONLY',expectedUid:'OTHER'},options),before=saves;
  await assert.rejects(wrong.signIn('synthetic@example.invalid','SYNTHETIC_TEST_ONLY'),/Identità/);assert.equal(saves,before);
  await auth.signOut();await assert.rejects(auth.getIdToken(),/Accesso/);assert.equal(stored,null);
});
test('canonical statement encoding is deterministic and rejects non-JSON values',()=>{
  assert.equal(canonical({b:1,a:'à'}),canonical({a:'à',b:1}));assert.throws(()=>canonical({value:NaN}));assert.throws(()=>canonical({missing:undefined}));
});
test('Windows vault refuses portable plaintext fallback outside Windows',async()=>{
  if(process.platform!=='win32')await assert.rejects(protectSecret({purpose:'SYNTHETIC_TEST_ONLY'}),/DPAPI richiede Windows/);
});
