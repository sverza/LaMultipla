import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {signDelivery,verifyDelivery,deliveryId} from '../../../shared/private-delivery.mjs';
import {parseDecisionEnvelope} from '../../../shared/decision-v4.mjs';
import {writeExclusive,readSnapshot} from '../prospective/store.mjs';

export async function privateLock(directory,action){
  // Lamport bakery participants have unique names, never reused. Removing a
  // dead participant cannot unlink a new owner's lock during crash recovery.
  // Local filesystem on one host only; process IDs cannot arbitrate a share.
  const locks=path.join(directory,'locks');await fs.mkdir(locks,{recursive:true,mode:0o700});
  const nonce=randomUUID(),name=`${process.pid}-${nonce}.json`,filename=path.join(locks,name);
  const owner={pid:process.pid,host:os.hostname(),nonce,choosing:true,ticket:0};
  async function participants(){const result=[];
    for(const entry of await fs.readdir(locks)){
      const temporary=entry.endsWith('.json.tmp');
      const match=entry.match(/^(\d+)-([a-f0-9-]{36})\.json(?:\.tmp)?$/);if(!match)throw new Error('Lock privato sconosciuto');
      if(temporary){try{process.kill(Number(match[1]),0);}catch(e){if(e.code!=='ESRCH')throw e;await fs.unlink(path.join(locks,entry)).catch(e=>{if(e.code!=='ENOENT')throw e;});}continue;}
      const pid=Number(match[1]);if(!Number.isSafeInteger(pid)||pid<1)throw new Error('PID non valido');
      const file=path.join(locks,entry);let record;
      try{record=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')continue;record={pid,host:os.hostname(),nonce:match[2],choosing:true,ticket:0};}
      if(record.pid!==pid||record.nonce!==match[2]||record.host!==os.hostname())throw new Error('Lock di altro host o alterato');
      try{process.kill(pid,0);}catch(e){if(e.code!=='ESRCH')throw new Error('Impossibile verificare il proprietario del lock');
        await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});continue;}
      if(typeof record.choosing!=='boolean'||!Number.isSafeInteger(record.ticket)||record.ticket<0)throw new Error('Lock incompleto');
      result.push({name:entry,...record});
    }return result;
  }
  let handle=await fs.open(filename,'wx',0o600);
  try{
    await handle.writeFile(JSON.stringify(owner));await handle.sync();await handle.close();handle=null;
    owner.ticket=1+Math.max(0,...(await participants()).map(p=>p.ticket));
    if(!Number.isSafeInteger(owner.ticket))throw new Error('Ticket lock esaurito');owner.choosing=false;
    const temporary=filename+'.tmp';await fs.writeFile(temporary,JSON.stringify(owner),{flag:'wx',mode:0o600});
    await fs.rename(temporary,filename);
    const others=(await participants()).filter(p=>p.name!==name);
    if(others.some(p=>p.choosing||p.ticket<owner.ticket||p.ticket===owner.ticket&&p.name<name))throw new Error('Produttore privato già in esecuzione');
    return await action();
  }finally{
    if(handle)await handle.close();await fs.unlink(filename).catch(e=>{if(e.code!=='ENOENT')throw e;});
    await fs.unlink(filename+'.tmp').catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
}
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
      if(!r.expired&&notify){try{await notify(r.statement);push='accepted_not_device_ack';}catch{push='failed_retry_later';}}
      results.push({sequence:r.statement.sequence,deliveryId:r.statement.deliveryId,serverAccepted:accepted.accepted,push});
    }return {acknowledged:ack?.sequence??0,pending:records.length-(ack?.sequence??0),results};
  });
}
