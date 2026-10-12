import fs from 'node:fs/promises';
import path from 'node:path';
import {privateLock} from './process-lock.mjs';
export {privateLock} from './process-lock.mjs';
import {signDelivery,verifyDelivery,deliveryId} from '../../../shared/private-delivery.mjs';
import {parseDecisionEnvelope} from '../../../shared/decision-v4.mjs';
import {writeExclusive,readSnapshot} from '../prospective/store.mjs';

export async function readOutbox(directory,trust,{now=new Date()}={}){
  let names=[];try{names=await fs.readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
  const result=[];for(const name of names.filter(n=>/^\d{12}\.json$/.test(n)).sort()){
    const frame=await readSnapshot(path.join(directory,name)),verified=await verifyDelivery(frame,trust,{now,archiveExpired:true});
    if(verified.statement.sequence!==result.length+1||verified.statement.previousDeliveryHash!==(result.at(-1)?.deliveryHash??null))throw new Error('Outbox non contiguo o alterato');
    result.push(verified);
  }return result;
}
export async function enqueueDelivery({directory,envelope,trust,privateKey,expiresAtUtc,now=new Date(),afterWrite=async()=>{}}){
  return privateLock(directory,async()=>{
    envelope=await parseDecisionEnvelope(envelope);
    const records=await readOutbox(directory,trust,{now}),p=envelope.payload;
    const id=await deliveryId({...trust,season:p?.round?.season,matchday:p?.round?.matchday,kind:p?.final?'final':'preview',envelopeSha256:envelope.sha256});
    const existing=records.find(r=>r.statement.deliveryId===id);if(existing)return {record:existing,reused:true};
    if(records.some(r=>r.statement.kind==='final'&&r.statement.season===p?.round?.season&&r.statement.matchday===p?.round?.matchday))throw new Error('Finale locale già congelato');
    const keyIds=Object.keys(trust.keys);if(keyIds.length!==1)throw new Error('Chiave di firma attiva richiesta');
    const frame=await signDelivery(envelope,{readerUid:trust.readerUid,applicationId:trust.applicationId,channel:trust.channel,keyId:keyIds[0],
      sequence:records.length+1,previousDeliveryHash:records.at(-1)?.deliveryHash??null,expiresAtUtc},privateKey);
    const verified=await verifyDelivery(frame,trust,{now});
    const filename=path.join(directory,String(verified.statement.sequence).padStart(12,'0')+'.json');
    await writeExclusive(filename,frame);await afterWrite(); // a crash here must reuse the immutable frame
    return {record:verified,reused:false};
  });
}
export async function flushOutbox({directory,trust,cloud,deviceId,now=new Date(),notify,limit=16}){
  if(!Number.isInteger(limit)||limit<1||limit>32)throw new Error('Budget consegna non valido');
  return privateLock(directory,async()=>{
    const records=await readOutbox(directory,trust,{now}),ack=await cloud.ack(deviceId);
    if(ack&&(!records[ack.sequence-1]||records[ack.sequence-1].deliveryHash!==ack.deliveryHash))throw new Error('ACK non collegato all’outbox');
    const pending=records.filter(r=>r.statement.sequence>(ack?.sequence??0)).slice(0,limit),results=[];
    for(const r of pending){
      const accepted=await cloud.publish(r.frame);let push='expired_archive';
      if(!r.expired&&!notify)push='not_configured';
      if(!r.expired&&notify){try{await notify(r.frame);push='accepted_not_device_ack';}catch{push='failed_retry_later';}}
      results.push({sequence:r.statement.sequence,deliveryId:r.statement.deliveryId,serverAccepted:accepted.accepted,push});
    }return {acknowledged:ack?.sequence??0,pending:records.length-(ack?.sequence??0),results};
  });
}
