import {keyFingerprint} from './private-delivery.mjs';
import {validateCloudConfig} from './private-cloud.mjs';
export async function validatePrivatePairing(p,applicationId,fingerprint){
  const names=['schema','projectId','apiKey','mobileAppId','senderId','deviceId','trust'];
  if(!p||Object.keys(p).sort().join(',')!==names.sort().join(',')||p.schema!=='lamultipla-private-pairing-v1'
    ||typeof p.apiKey!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(p.apiKey)
    ||typeof p.mobileAppId!=='string'||!/^1:[0-9]+:android:[a-f0-9]+$/.test(p.mobileAppId)
    ||typeof p.senderId!=='string'||!/^\d+$/.test(p.senderId)||p.mobileAppId.split(':')[1]!==p.senderId
    ||typeof p.deviceId!=='string'||!/^[a-z0-9-]{8,64}$/.test(p.deviceId)
    ||p.trust?.applicationId!==applicationId||!['it.personale.lamultipla','it.personale.lamultipla.collaudo'].includes(applicationId)
    ||!p.trust.keys||Object.keys(p.trust.keys).length!==1
    ||Object.keys(p.trust).sort().join(',')!=='applicationId,channel,keys,readerUid')throw new Error('Abbinamento privato non valido');
  validateCloudConfig({projectId:p.projectId,readerUid:p.trust.readerUid,channel:p.trust.channel});
  const [id]=Object.keys(p.trust.keys);
  if(typeof fingerprint!=='string'||fingerprint.trim().toLowerCase()!==id||await keyFingerprint(p.trust.keys[id])!==id)throw new Error('Fingerprint del PC non corrispondente');
  // Parse the key now; a fingerprint alone cannot certify algorithm/curve.
  await crypto.subtle.importKey('spki',Uint8Array.from(atob(p.trust.keys[id].replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(applicationId.endsWith('.collaudo')&&p.trust.channel!=='synthetic_shadow')throw new Error('APK di collaudo: solo canale sintetico');
  return structuredClone(p);
}
