import {EXPERIMENT_DATABASE,EXPERIMENT_DATABASE_VERSION,upgradeExperimentDatabase} from './experimental-store.mjs';
import {canonical,textSha256,verifyDelivery} from './private-delivery.mjs';
const names=['snapshots','private-deliveries','private-cursors','private-finals'];
const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(EXPERIMENT_DATABASE,EXPERIMENT_DATABASE_VERSION);
  r.onupgradeneeded=()=>upgradeExperimentDatabase(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const initial=id=>({id,sequence:0,deliveryHash:null});
export async function receiverScope(config,trust){
  return textSha256(canonical({projectId:config.projectId,readerUid:trust.readerUid,channel:trust.channel,applicationId:trust.applicationId}));
}
export async function readPrivateCursor(scope){const db=await open();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('private-cursors'),r=tx.objectStore('private-cursors').get(scope);let result;
  r.onsuccess=()=>{result=r.result??initial(scope);};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error);
});}finally{db.close();}}
// Signature verification finishes before the transaction. The archive, chain
// cursor and final index commit together. No access to the slips database.
export async function importPrivateFrame(frame,trust,{scope,now=new Date()}={}){
  if(typeof scope!=='string'||!/^[a-f0-9]{64}$/.test(scope))throw new Error('Ambito privato non valido');
  const verified=await verifyDelivery(frame,trust,{now,archiveExpired:true}),s=verified.statement;
  const id=scope+':'+s.sequence,round=scope+':'+s.season+':'+s.matchday,db=await open();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(names,'readwrite'),snapshots=tx.objectStore('snapshots'),deliveries=tx.objectStore('private-deliveries');
    const cursors=tx.objectStore('private-cursors'),finals=tx.objectStore('private-finals');let result,failure;
    const abort=message=>{failure=new Error(message);tx.abort();};
    const r=cursors.get(scope);r.onsuccess=()=>{
      const c=r.result??initial(scope),old=deliveries.get(id);
      old.onsuccess=()=>{
        if(old.result){if(old.result.deliveryHash!==verified.deliveryHash||old.result.frame.signature!==frame.signature)abort('Replay privato in conflitto');
          else result={...verified,reused:true};return;}
        if(s.sequence!==c.sequence+1||s.previousDeliveryHash!==c.deliveryHash){abort('Consegna privata fuori sequenza');return;}
        const f=finals.get(round);f.onsuccess=()=>{
          if(f.result){abort('Finale ricevuto già congelato');return;}
          const snapshot=snapshots.get(verified.envelope.sha256);snapshot.onsuccess=()=>{
            if(!snapshot.result)snapshots.add({id:verified.envelope.sha256,envelope:verified.envelope});
            deliveries.add({id,frame:verified.frame,deliveryHash:verified.deliveryHash,expiredAtReception:verified.expired});
            if(s.kind==='final')finals.add({id:round,deliveryId:s.deliveryId});
            cursors.put({id:scope,sequence:s.sequence,deliveryHash:verified.deliveryHash});
            result={...verified,reused:false};
          };
        };
      };
    };
    tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure??tx.error??new Error('Importazione privata interrotta'));
  });}finally{db.close();}
}
export async function syncPrivateInbox({cloud,trust,scope,deviceId,now=new Date(),limit=16,onImported=()=>{}}){
  if(!Number.isInteger(limit)||limit<1||limit>32)throw new Error('Budget ricezione non valido');
  let cursor=await readPrivateCursor(scope);const head=await cloud.head();
  if(!head){if(cursor.sequence)throw new Error('Archivio remoto assente');return {received:0,pending:0,acknowledged:0};}
  if(!Number.isSafeInteger(head.sequence)||head.sequence>1000000||head.sequence<cursor.sequence
    ||head.sequence===cursor.sequence&&head.deliveryHash!==cursor.deliveryHash)throw new Error('Rollback o conflitto remoto');
  let received=0;
  for(let n=cursor.sequence+1;n<=head.sequence&&received<limit;n++){
    const event=await cloud.event(n);if(!event)throw new Error('Consegna remota mancante');
    const result=await importPrivateFrame(event.frame,trust,{scope,now});
    if(!result.reused){received++;await onImported(result);}
    cursor=await readPrivateCursor(scope);
  }
  if(cursor.sequence===head.sequence&&cursor.deliveryHash!==head.deliveryHash)throw new Error('Testa remota incoerente');
  // ACK only after durable import. A failed ACK is retried even with no new events.
  if(cursor.sequence)await cloud.acknowledge(deviceId,cursor.sequence,cursor.deliveryHash);
  return {received,pending:Math.max(0,head.sequence-cursor.sequence),acknowledged:cursor.sequence};
}
