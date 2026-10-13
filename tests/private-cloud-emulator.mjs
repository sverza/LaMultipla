// Local demo emulator ONLY. Never runs against a real cloud project.
import assert from 'node:assert/strict';
import {createPrivateCloud} from '../shared/private-cloud.mjs';
import {signDelivery,base64url,keyFingerprint,verifyDelivery} from '../shared/private-delivery.mjs';
import {syntheticDecisionBundle,syntheticNow} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {envelope} from '../scripts/lib/prospective/store.mjs';
const project='demo-lamultipla-private',host='127.0.0.1:8087';
if(process.env.FIRESTORE_EMULATOR_HOST!==host)throw new Error('Local demo emulator required');
const uid='SYNTHETIC_READER',writer='SYNTHETIC_WRITER',database=`projects/${project}/databases/(default)/documents`;
const now=Date.now()/1000;
function token(sub){return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({
  sub,user_id:sub,aud:project,iss:`https://securetoken.google.com/${project}`,iat:Math.floor(now),exp:Math.floor(now)+3600,
  firebase:{sign_in_provider:'password',identities:{}}})).toString('base64url')+'.';}
const nativeFetch=fetch;
const emulatorFetch=(url,options)=>{
  assert.ok(url.startsWith(`https://firestore.googleapis.com/v1/${database}`));
  return nativeFetch(url.replace('https://firestore.googleapis.com',`http://${host}`),options);
};
const config={projectId:project,readerUid:uid,channel:'synthetic_shadow'};
const cloudFor=identity=>createPrivateCloud(config,{getIdToken:async()=>token(identity),fetchImpl:emulatorFetch});
const endpoint=`http://${host}/v1/${database}`,prefix=`users/${uid}/channels/synthetic_shadow`;
let r=await nativeFetch(endpoint+`/users/${uid}/access/config`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
  body:JSON.stringify({fields:{writerUid:{stringValue:writer}}})});assert.equal(r.status,200,await r.text());
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const spki=base64url(await crypto.subtle.exportKey('spki',pair.publicKey)),keyId=await keyFingerprint(spki);
const trust={readerUid:uid,applicationId:'it.personale.lamultipla.collaudo',channel:'synthetic_shadow',keys:{[keyId]:spki}};
const options={readerUid:uid,applicationId:trust.applicationId,channel:trust.channel,keyId,sequence:1,previousDeliveryHash:null,expiresAtUtc:'2026-10-17T12:55:00.000Z'};
const frame=await signDelivery(envelope(appPackage(syntheticDecisionBundle())),options,pair.privateKey);
const publisher=cloudFor(writer),reader=cloudFor(uid),stranger=cloudFor('SYNTHETIC_STRANGER');
assert.equal((await nativeFetch(endpoint+'/'+prefix+'/head/current')).status,403);
await assert.rejects(stranger.head(),/403/);await assert.rejects(reader.publish(frame),/403/);
assert.equal((await publisher.publish(frame)).accepted,true);assert.equal((await publisher.publish(frame)).duplicate,true);
assert.equal((await reader.event(1)).frame.signature,frame.signature);
const verified=await verifyDelivery(frame,trust,{now:syntheticNow});
await assert.rejects(publisher.acknowledge('synthetic-device',1,verified.deliveryHash),/403/);
await assert.rejects(reader.acknowledge('synthetic-device',1,'f'.repeat(64)),/403/);
await reader.acknowledge('synthetic-device',1,verified.deliveryHash);assert.equal((await publisher.ack('synthetic-device')).sequence,1);
await assert.rejects(publisher.registerDevice('synthetic-device','SYNTHETIC_FCM_TEST_ONLY',trust.applicationId),/403/);
await reader.registerDevice('synthetic-device','SYNTHETIC_FCM_TEST_ONLY',trust.applicationId);
assert.equal((await publisher.device('synthetic-device')).fcmToken,'SYNTHETIC_FCM_TEST_ONLY');
const patch=async(document,fields,identity)=>nativeFetch(endpoint+'/'+prefix+'/'+document,{method:'PATCH',headers:{Authorization:'Bearer '+token(identity),'Content-Type':'application/json'},body:JSON.stringify({fields})});
await reader.registerDevice('synthetic-device','SYNTHETIC_FCM_TEST_ONLY',trust.applicationId,1);
assert.equal((await publisher.device('synthetic-device')).roundStateProtocol,1);
await assert.rejects(publisher.registerDevice('synthetic-device','SYNTHETIC_WRITER_ROTATION_FORBIDDEN',trust.applicationId,1),/403/);
assert.equal((await patch('devices/synthetic-device',{fcmToken:{stringValue:'SYNTHETIC_FCM_TEST_ONLY'},applicationId:{stringValue:trust.applicationId},roundStateProtocol:{integerValue:'2'}},uid)).status,403);
assert.equal((await patch('devices/synthetic-device',{fcmToken:{stringValue:'SYNTHETIC_FCM_TEST_ONLY'},applicationId:{stringValue:trust.applicationId},admin:{booleanValue:true}},uid)).status,403);
assert.equal((await patch('events/1',{sequence:{integerValue:'1'}},writer)).status,403);
assert.equal((await patch('head/current',{sequence:{integerValue:'8'},deliveryId:{stringValue:'f'.repeat(64)},deliveryHash:{stringValue:'f'.repeat(64)}},writer)).status,403);
const finalPayload=appPackage(syntheticDecisionBundle('no_value'));finalPayload.final=true;
const final=await signDelivery(envelope(finalPayload),{...options,sequence:2,previousDeliveryHash:verified.deliveryHash},pair.privateKey);
assert.equal((await publisher.publish(final)).accepted,true);
const later=await signDelivery(envelope(appPackage(syntheticDecisionBundle('missing_rules'))),{...options,sequence:3,previousDeliveryHash:(await verifyDelivery(final,trust,{now:syntheticNow})).deliveryHash},pair.privateKey);
await assert.rejects(publisher.publish(later),/Finale/);
const forbidden=await nativeFetch(endpoint+`/users/${uid}/access/config`,{method:'PATCH',headers:{Authorization:'Bearer '+token(uid),'Content-Type':'application/json'},
  body:JSON.stringify({fields:{writerUid:{stringValue:uid}}})});assert.equal(forbidden.status,403);
console.log(JSON.stringify({sourceData:'SYNTHETIC_TEST_ONLY',project,tests:'rules_auth_roles_atomic_chain_immutable_final_ack',cloudRequests:0,production:false}));
