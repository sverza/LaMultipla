import {canonical,textSha256,base64url,unbase64url,keyFingerprint} from './private-delivery.mjs';
import {validatePrivatePairing} from './private-pairing.mjs';
export const TRANSITION_DOMAIN='lamultipla-private-pairing-transition-v1\n';
const names=['schema','keyId','projectId','readerUid','applicationId','fromDeviceId','fromChannel','toChannel',
  'expectedSequence','expectedDeliveryHash','profileSha256','generatedAtUtc','expiresAtUtc'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const validCursor=c=>Number.isSafeInteger(c?.sequence)&&c.sequence>=0&&c.sequence<=1000000
  &&(c.sequence===0?c.deliveryHash===null:typeof c.deliveryHash==='string'&&/^[a-f0-9]{64}$/.test(c.deliveryHash));
async function profiles(before,after){
  const id=Object.keys(before?.trust?.keys??{})[0];
  await validatePrivatePairing(before,before?.trust?.applicationId,id);
  await validatePrivatePairing(after,before.trust.applicationId,id,{allowShadowTransition:true});
  if(before.trust.channel!=='synthetic_shadow'||after.trust.channel!=='shadow'||after.deviceId===before.deviceId)throw new Error();
  for(const field of ['schema','projectId','apiKey','mobileAppId','senderId'])if(before[field]!==after[field])throw new Error();
  if(before.trust.readerUid!==after.trust.readerUid||canonical(before.trust.keys)!==canonical(after.trust.keys))throw new Error();
  return id;
}
export async function createShadowTransition({profile,nextProfile,cursor,privateKey,now=new Date()}){
  const at=new Date(now);if(!Number.isFinite(at.getTime())||!validCursor(cursor))throw new Error('Transizione privata non valida');
  const keyId=await profiles(profile,nextProfile),profileJson=JSON.stringify(nextProfile);
  const statement=canonical({schema:'lamultipla-private-pairing-transition-statement-v1',keyId,projectId:profile.projectId,
    readerUid:profile.trust.readerUid,applicationId:profile.trust.applicationId,fromDeviceId:profile.deviceId,
    fromChannel:'synthetic_shadow',toChannel:'shadow',expectedSequence:cursor.sequence,expectedDeliveryHash:cursor.deliveryHash,
    profileSha256:await textSha256(profileJson),generatedAtUtc:at.toISOString(),expiresAtUtc:new Date(at.getTime()+7*86400000).toISOString()});
  const signature=base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,new TextEncoder().encode(TRANSITION_DOMAIN+statement)));
  const frame={schema:'lamultipla-private-pairing-transition-v1',statement,signature,profileJson};
  await verifyShadowTransition(frame,{profile,cursor,now});return frame;
}
export async function verifyShadowTransition(frame,{profile,cursor,now=new Date()}){
  try{
    if(!exact(frame,['schema','statement','signature','profileJson'])||frame.schema!=='lamultipla-private-pairing-transition-v1'
      ||typeof frame.statement!=='string'||frame.statement.length>4096||typeof frame.profileJson!=='string'
      ||new TextEncoder().encode(JSON.stringify(frame)).length>16384||!validCursor(cursor))throw new Error();
    const statement=JSON.parse(frame.statement),nextProfile=JSON.parse(frame.profileJson),id=await profiles(profile,nextProfile);
    if(!exact(statement,names)||frame.statement!==canonical(statement)||statement.schema!=='lamultipla-private-pairing-transition-statement-v1'
      ||statement.keyId!==id||statement.projectId!==profile.projectId||statement.readerUid!==profile.trust.readerUid
      ||statement.applicationId!==profile.trust.applicationId||statement.fromDeviceId!==profile.deviceId
      ||statement.fromChannel!=='synthetic_shadow'||statement.toChannel!=='shadow'
      ||statement.expectedSequence!==cursor.sequence||statement.expectedDeliveryHash!==cursor.deliveryHash
      ||statement.profileSha256!==await textSha256(frame.profileJson))throw new Error();
    const at=new Date(now).getTime(),generated=Date.parse(statement.generatedAtUtc),expires=Date.parse(statement.expiresAtUtc);
    if(!Number.isFinite(at)||!Number.isFinite(generated)||!Number.isFinite(expires)
      ||new Date(generated).toISOString()!==statement.generatedAtUtc||new Date(expires).toISOString()!==statement.expiresAtUtc
      ||generated>at||expires<=at||expires-generated!==7*86400000)throw new Error();
    const spki=profile.trust.keys[id];if(await keyFingerprint(spki)!==id)throw new Error();
    const key=await crypto.subtle.importKey('spki',unbase64url(spki),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const signature=unbase64url(frame.signature);
    if(signature.length!==64||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signature,new TextEncoder().encode(TRANSITION_DOMAIN+frame.statement)))throw new Error();
    return {profile:structuredClone(nextProfile),statement};
  }catch{throw new Error('Transizione privata non valida, scaduta o archivio non allineato');}
}
