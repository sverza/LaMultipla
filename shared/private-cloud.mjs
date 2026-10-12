import {canonical,validateStatement,textSha256,MAX_FRAME_BYTES} from './private-delivery.mjs';

export function validateCloudConfig(c) {
  if (!c || typeof c.projectId!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(c.projectId)
    || typeof c.readerUid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(c.readerUid) || !['synthetic_shadow','shadow'].includes(c.channel)) throw new Error('Configurazione cloud non valida');
  return c;
}
const sequenceId = n => {
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000000) throw new Error('Sequenza non valida');
  return String(n);
};
export const roundKey = s => s.season.replace('/','-')+'-'+String(s.matchday).padStart(2,'0');
const encode = data => Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v===null?{nullValue:null}:
  typeof v==='number'?{integerValue:String(v)}:{stringValue:v}]));
const decode = doc => doc ? Object.fromEntries(Object.entries(doc.fields??{}).map(([k,v])=>[k,
  'nullValue' in v?null:'integerValue' in v?Number(v.integerValue):v.stringValue])) : null;

// REST with Firebase Auth ID token: server-side Security Rules remain enforced.
// No service-account OAuth/Admin writes and no configurable remote URL.
export function createPrivateCloud(config,{getIdToken,fetchImpl=fetch}={}) {
  validateCloudConfig(config); if(typeof getIdToken!=='function')throw new Error('Autenticazione richiesta');
  const database=`projects/${config.projectId}/databases/(default)`;
  const base=`https://firestore.googleapis.com/v1/${database}/documents`;
  const prefix=`users/${config.readerUid}/channels/${config.channel}`;
  async function request(path,{method='GET',data,missing=false}={}) {
    const token=await getIdToken(); if(typeof token!=='string'||!token)throw new Error('Sessione privata assente');
    const response=await fetchImpl(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(data?{body:JSON.stringify(data)}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(missing&&response.status===404)return null;
    if(!response.ok){const error=new Error(`Trasporto privato HTTP ${response.status}`);error.status=response.status;throw error;}
    const text=await response.text();if(new TextEncoder().encode(text).length>2*MAX_FRAME_BYTES+32768)throw new Error('Risposta privata troppo grande');
    return text?JSON.parse(text):{};
  }
  const getDoc=path=>request('/'+path,{missing:true});
  const write=(path,data,condition)=>({update:{name:`${database}/documents/${path}`,fields:encode(data)},currentDocument:condition});
  const eventPath=n=>`${prefix}/events/${sequenceId(n)}`;
  async function event(n){const d=decode(await getDoc(eventPath(n)));if(!d)return null;
    if(d.sequence!==n||typeof d.body!=='string')throw new Error('Record privato non valido');
    const frame=JSON.parse(d.body),s=validateStatement(JSON.parse(frame.statement));
    if(s.sequence!==n||s.deliveryId!==d.deliveryId||await textSha256(frame.statement)!==d.deliveryHash)throw new Error('Indice privato incoerente');
    return {frame,...d};
  }
  async function head(){const doc=await getDoc(`${prefix}/head/current`);const h=decode(doc);
    if(h&&(!Number.isSafeInteger(h.sequence)||h.sequence<1||!/^[a-f0-9]{64}$/.test(h.deliveryHash)||!/^[a-f0-9]{64}$/.test(h.deliveryId)))throw new Error('Testa privata non valida');
    return h?{...h,updateTime:doc.updateTime}:null;
  }
  async function publish(frame){
    const s=validateStatement(JSON.parse(frame.statement));
    if(s.readerUid!==config.readerUid||s.channel!==config.channel)throw new Error('Destinatario cloud errato');
    const body=JSON.stringify(frame);if(new TextEncoder().encode(body).length>MAX_FRAME_BYTES)throw new Error('Consegna troppo grande');
    const hash=await textSha256(frame.statement),previous=await event(s.sequence);
    if(previous){if(previous.body!==body)throw new Error('Conflitto immutabile sulla consegna');return {accepted:true,duplicate:true};}
    const h=await head();
    if(s.sequence!==(h?.sequence??0)+1||s.previousDeliveryHash!==(h?.deliveryHash??null))throw new Error('Testa cambiata: consegna fuori sequenza');
    const final=await getDoc(`${prefix}/finals/${roundKey(s)}`);
    if(final)throw new Error('Finale della giornata già esistente');
    const metadata={sequence:s.sequence,deliveryId:s.deliveryId,deliveryHash:hash};
    const writes=[write(eventPath(s.sequence),{...metadata,body,previousDeliveryHash:s.previousDeliveryHash,
      kind:s.kind,roundKey:roundKey(s),expiresAtUtc:s.expiresAtUtc},{exists:false}),
      write(`${prefix}/head/current`,metadata,h?{updateTime:h.updateTime}:{exists:false})];
    if(s.kind==='final')writes.push(write(`${prefix}/finals/${roundKey(s)}`,metadata,{exists:false}));
    await request(':commit',{method:'POST',data:{writes}});return {accepted:true,duplicate:false};
  }
  async function acknowledge(deviceId,n,hash){
    sequenceId(n);
    if(!/^[a-z0-9-]{8,64}$/.test(deviceId)||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Ricevuta non valida');
    const path=`${prefix}/acks/${deviceId}`,existing=await getDoc(path),old=decode(existing);
    if(old?.sequence>n)throw new Error('Ricevuta retrograda');
    if(old?.sequence===n){if(old.deliveryHash!==hash)throw new Error('Ricevuta in conflitto');return;}
    await request(':commit',{method:'POST',data:{writes:[write(path,{sequence:n,deliveryHash:hash},existing?{updateTime:existing.updateTime}:{exists:false})]}});
  }
  async function ack(deviceId){if(!/^[a-z0-9-]{8,64}$/.test(deviceId))throw new Error('Dispositivo non valido');const value=decode(await getDoc(`${prefix}/acks/${deviceId}`));if(value){sequenceId(value.sequence);if(!/^[a-f0-9]{64}$/.test(value.deliveryHash))throw new Error('ACK non valido');}return value;}
  async function device(deviceId){if(!/^[a-z0-9-]{8,64}$/.test(deviceId))throw new Error('Dispositivo non valido');return decode(await getDoc(`${prefix}/devices/${deviceId}`));}
  async function registerDevice(deviceId,fcmToken,applicationId){
    if(!/^[a-z0-9-]{8,64}$/.test(deviceId)||typeof fcmToken!=='string'||!fcmToken||fcmToken.length>4096
      ||!['it.personale.lamultipla','it.personale.lamultipla.collaudo'].includes(applicationId))throw new Error('Registrazione privata non valida');
    const path=`${prefix}/devices/${deviceId}`,old=await getDoc(path);
    const matches=doc=>{const value=decode(doc);return value?.fcmToken===fcmToken&&value.applicationId===applicationId;};
    if(matches(old))return;
    try{await request(':commit',{method:'POST',data:{writes:[write(path,{fcmToken,applicationId},old?{updateTime:old.updateTime}:{exists:false})]}});}
    catch(error){
      // Native token rotation can race the foreground CAS; a lost response can
      // also follow a successful commit. Confirm exact desired values once.
      if(error.status&&![409,412].includes(error.status))throw error;
      if(matches(await getDoc(path)))return;throw error;
    }
  }
  return {head,event,publish,acknowledge,ack,device,registerDevice,canonical};
}
