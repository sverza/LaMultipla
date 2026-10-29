// Observation only: no publish, register, ACK write, signing or ADB dependency.
import {keyFingerprint,unbase64url,verifyDelivery} from '../../../shared/private-delivery.mjs';
import {validateCloudConfig} from '../../../shared/private-cloud.mjs';
import {digest} from '../prospective/store.mjs';
const fail=code=>{throw Error(code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export async function auditPrivateTransport({profile,records,shadowPrepared=false,cloud=null,deliveryId=null,now=new Date()}){
 const observedAtUtc=new Date(now).toISOString(),trust=profile?.trust;
 validateCloudConfig({projectId:profile?.projectId,readerUid:trust?.readerUid,channel:trust?.channel});
 const keys=Object.keys(trust?.keys??{});
 if(keys.length!==1||await keyFingerprint(trust.keys[keys[0]])!==keys[0]
  ||!['it.personale.lamultipla','it.personale.lamultipla.collaudo'].includes(trust.applicationId)
  ||!/^[a-z0-9-]{8,64}$/.test(profile.deviceId)||!Array.isArray(records))fail('TRANSPORT_AUDIT_PROFILE_INVALID');
 await crypto.subtle.importKey('spki',unbase64url(trust.keys[keys[0]]),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 const originalRecords=records;
 records=[];for(const record of originalRecords){
  const verified=await verifyDelivery(record.frame,trust,{now,archiveExpired:true});
  if(record.deliveryHash!==verified.deliveryHash||digest(record.statement)!==digest(verified.statement))fail('TRANSPORT_AUDIT_LOCAL_FRAME_CONFLICT');
  records.push(verified);
 }
 // readOutbox verifies signatures first. Also require the returned chain to
 // agree with this recipient rather than merely trusting an arbitrary list.
 for(const [i,r] of records.entries())if(r.statement.sequence!==i+1||r.statement.previousDeliveryHash!==(records[i-1]?.deliveryHash??null)
  ||r.statement.readerUid!==trust.readerUid||r.statement.channel!==trust.channel||r.statement.applicationId!==trust.applicationId
  ||!hash(r.deliveryHash))fail('TRANSPORT_AUDIT_LOCAL_CHAIN_INVALID');
 if(deliveryId!==null&&!hash(deliveryId))fail('TRANSPORT_AUDIT_DELIVERY_ID_INVALID');
 const target=deliveryId?records.find(r=>r.statement.deliveryId===deliveryId):null;
 if(deliveryId&&!target)fail('TRANSPORT_AUDIT_DELIVERY_NOT_IN_LOCAL_OUTBOX');
 const result={schema:'lamultipla-private-transport-audit-v1',observedAtUtc,adbRequired:false,
  projectId:profile.projectId,applicationId:trust.applicationId,channel:trust.channel,readerSha256:digest(trust.readerUid),deviceSha256:digest(profile.deviceId),
  keyFingerprint:keys[0],localFrames:records.length,localTipHash:records.at(-1)?.deliveryHash??null,
  sourceCompatibility:{synthetic:trust.channel==='synthetic_shadow',original:trust.channel==='shadow',
   newSyntheticQueueAllowed:trust.channel==='synthetic_shadow'&&!shadowPrepared,
   roundStateQueueAllowed:trust.channel==='shadow',retiredSyntheticChannel:trust.channel==='synthetic_shadow'&&shadowPrepared},
  testApplication:trust.applicationId==='it.personale.lamultipla.collaudo',
  status:'LOCAL_ONLY',cloudRead:false,cloudRequests:0,registrationVerified:false,roundStateProtocol:null,
  deviceOnlineVerified:false,installedApkVersionVerified:false,acknowledged:null,pending:null,deliveryProof:null,
  executionAuthorized:false,publicationExecuted:false,cloudWrites:0,fcmSends:0,actualStakeEUR:0};
 if(!cloud)return result;
 // Exactly three reads; one additional event read only for an explicit ID.
 const device=await cloud.device(profile.deviceId);result.cloudRequests++;
 const head=await cloud.head();result.cloudRequests++;
 const ack=await cloud.ack(profile.deviceId);result.cloudRequests++;
 if(head&&(!Number.isSafeInteger(head.sequence)||head.sequence<1||head.sequence>records.length
  ||head.deliveryHash!==records[head.sequence-1]?.deliveryHash||head.deliveryId!==records[head.sequence-1]?.statement.deliveryId))fail('TRANSPORT_AUDIT_CLOUD_HEAD_CONFLICT');
 if(ack&&(!Number.isSafeInteger(ack.sequence)||ack.sequence<1||ack.sequence>(head?.sequence??0)
  ||ack.deliveryHash!==records[ack.sequence-1]?.deliveryHash))fail('TRANSPORT_AUDIT_ACK_CONFLICT');
 result.cloudRead=true;result.registrationVerified=device?.applicationId===trust.applicationId&&typeof device?.fcmToken==='string'&&device.fcmToken.length>0&&device.fcmToken.length<=4096;
 result.roundStateProtocol=device?.roundStateProtocol??null;result.acknowledged=ack?.sequence??0;result.pending=records.length-result.acknowledged;
 result.status=!result.registrationVerified?'RECEIVER_NOT_REGISTERED':result.pending?'PENDING':'NO_PENDING_DELIVERY';
 if(target){
  const event=await cloud.event(target.statement.sequence);result.cloudRequests++;
  if(event&&((head?.sequence??0)<target.statement.sequence||event.deliveryHash!==target.deliveryHash||digest(event.frame)!==digest(target.frame)))fail('TRANSPORT_AUDIT_CLOUD_EVENT_CONFLICT');
  const accepted=Boolean(event),ackCoversTarget=accepted&&(ack?.sequence??0)>=target.statement.sequence;
  result.deliveryProof={deliveryId,sequence:target.statement.sequence,deliveryHash:target.deliveryHash,cloudAccepted:accepted,
   ackCoversTarget,expiredNow:target.expired,ackObservedAtUtc:ackCoversTarget?observedAtUtc:null,
   ackProducedAtUtc:null,phoneUiPersistenceManuallyVerified:false};
  result.status=!result.registrationVerified?'RECEIVER_NOT_REGISTERED':ackCoversTarget?'ACK_VERIFIED':accepted?'CLOUD_ACCEPTED_ACK_PENDING':'NOT_PUBLISHED';
 }
 return result;
}
