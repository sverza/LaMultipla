// SYNTHETIC ONLY: no real profile, credentials, fixtures, prices or user archive.
import {syntheticDecisionBundle} from './decision.mjs';
import {appPackage} from '../../scripts/lib/decision/app-package.mjs';
import {envelope} from '../../scripts/lib/prospective/store.mjs';
import {base64url,keyFingerprint,signDelivery,verifyDelivery} from '../../shared/private-delivery.mjs';
import {governance} from '../../scripts/lib/decision/governance.mjs';
export async function progressiveDeliveryVectors(now='2026-10-14T09:00:00.000Z',{readerUid='SYNTHETIC_READER'}={}){
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',pair.publicKey)),keyId=await keyFingerprint(spki);
  const trust={readerUid,applicationId:'it.personale.lamultipla.collaudo',channel:'synthetic_shadow',keys:{[keyId]:spki}};
  const phases=['NO_BET_PROVISIONAL','EVIDENCE_INSUFFICIENT','TECHNICALLY_INCOMPLETE','SHADOW_PROPOSAL','NO_BET_FINAL'];
  const cases=[];let previousDeliveryHash=null;
  for(const phase of phases){
    let payload;
    if(phase==='SHADOW_PROPOSAL'){
      const bundle=syntheticDecisionBundle('simulation',{now,matchday:8});bundle.decision.final=true;bundle.decision.governance=governance(bundle.decision);payload=appPackage(bundle);
    }else payload={schema:'lamultipla-app-round-state-v1',id:'SYNTHETIC-ROUND-'+phase,round:{season:'2026/27',matchday:7},generatedAtUtc:now,
      status:'no_bet',phase,mode:'experimental',delivery:'private_local',sourceData:'synthetic_test',final:phase==='NO_BET_FINAL',actualStakeEUR:0,nominalStakeEUR:0,
      operational:{decision:'NO_BET',cause:'MODEL_NOT_AUTHORIZED',authorized:false,publicationAllowed:false},protocolVersion:'analysis-progressive-v1',
      calendarSha256:'a'.repeat(64),attemptHashes:['b'.repeat(64)],reasonCodes:['SYNTHETIC_TEST_ONLY'],nextWindowAtUtc:phase==='NO_BET_FINAL'?null:new Date(Date.parse(now)+3600000).toISOString()};
    const frame=await signDelivery(envelope(payload),{readerUid:trust.readerUid,applicationId:trust.applicationId,channel:trust.channel,keyId,sequence:cases.length+1,previousDeliveryHash,expiresAtUtc:new Date(Date.parse(now)+25*60000).toISOString()},pair.privateKey);
    const verified=await verifyDelivery(frame,trust,{now});previousDeliveryHash=verified.deliveryHash;
    cases.push({phase,frame,deliveryHash:verified.deliveryHash});
  }
  return {purpose:'SYNTHETIC_TEST_ONLY',nowUtc:now,profile:{trust},cases};
}
