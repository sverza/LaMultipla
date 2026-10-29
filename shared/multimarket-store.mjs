// Separate IndexedDB; no migrations, writes or cursors in legacy/v4 databases.
import {canonical,textSha256} from './private-delivery.mjs';
import {validateMultimarketTrust,verifyMultimarketFrame} from './multimarket-experiment.mjs';
export const MULTIMARKET_DATABASE='lamultipla-mm-local-test-v1';
const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(MULTIMARKET_DATABASE,1);r.onupgradeneeded=()=>{
 for(const name of ['keys','frames'])r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function readAll(name){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(name),r=tx.objectStore(name).getAll();let rows;
 r.onsuccess=()=>{rows=r.result;};tx.oncomplete=()=>resolve(rows);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function importMultimarketTrust(input){const trust=await validateMultimarketTrust(input),db=await open();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('keys','readwrite'),store=tx.objectStore('keys'),r=store.get(trust.keyId);
 r.onsuccess=()=>{if(r.result&&canonical(r.result.trust)!==canonical(trust)){tx.abort();return;}if(!r.result)store.add({id:trust.keyId,trust});};
 tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error??Error('Chiave di collaudo in conflitto'));});}finally{db.close();}return trust;
}
export async function readMultimarketTrust(){const rows=await readAll('keys');return Promise.all(rows.map(async r=>{const t=await validateMultimarketTrust(r.trust);if(t.keyId!==r.id)throw Error('Chiave locale alterata');return t;}));}
export async function importMultimarketFrame(frame,{now=new Date()}={}){
 const keyId=JSON.parse(frame?.statementJson??'null')?.keyId,trust=(await readMultimarketTrust()).find(t=>t.keyId===keyId);
 if(!trust)throw Error('Importare prima la chiave pubblica di collaudo verificata');
 const verified=await verifyMultimarketFrame(frame,trust,{now}),id=verified.envelope.sha256,db=await open();let reused=false;
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('frames','readwrite'),store=tx.objectStore('frames'),r=store.get(id);
 r.onsuccess=()=>{if(r.result){if(r.result.frameSha256!==verified.frameSha256){tx.abort();return;}reused=true;}else store.add({id,frame:verified.frame,frameSha256:verified.frameSha256});};
 tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error??Error('Duplicato multimercato in conflitto'));});}finally{db.close();}
 return {...verified,reused};
}
export async function readMultimarketExperiments({now=new Date()}={}){
 const keys=await readMultimarketTrust(),rows=await readAll('frames');return Promise.all(rows.map(async row=>{
  const trust=keys.find(t=>t.keyId===JSON.parse(row.frame.statementJson).keyId);if(!trust)throw Error('Firma locale non verificabile');
  const value=await verifyMultimarketFrame(row.frame,trust,{now,archiveExpired:true});
  if(row.id!==value.envelope.sha256||row.frameSha256!==value.frameSha256)throw Error('Archivio multimercato alterato');return value;
 }));
}
export async function exportMultimarketBackup({now=new Date()}={}){
 const values=await readMultimarketExperiments({now}),trust=await readMultimarketTrust(),payload={schema:'lamultipla-mm-local-test-backup-v1',
  exportedAtUtc:new Date(now).toISOString(),trust,frames:values.map(v=>v.frame)};
 return {payload,sha256:await textSha256(canonical(payload))};
}
export async function validateMultimarketBackup(input,{now=new Date()}={}){
 if(input?.payload?.schema!=='lamultipla-mm-local-test-backup-v1'||!Array.isArray(input.payload.trust)||!Array.isArray(input.payload.frames)
  ||input.payload.trust.length>100||input.payload.frames.length>1000||await textSha256(canonical(input.payload))!==input.sha256)throw Error('Backup multimercato alterato');
 const keys=await Promise.all(input.payload.trust.map(validateMultimarketTrust));
 for(const frame of input.payload.frames){const key=keys.find(k=>k.keyId===JSON.parse(frame.statementJson).keyId);if(!key)throw Error('Chiave backup assente');await verifyMultimarketFrame(frame,key,{now,archiveExpired:true});}
 return structuredClone(input.payload);
}
export async function restoreMultimarketBackup(input,{now=new Date()}={}){
 const payload=await validateMultimarketBackup(input,{now}),values=[];
 for(const frame of payload.frames){const trust=payload.trust.find(k=>k.keyId===JSON.parse(frame.statementJson).keyId);values.push(await verifyMultimarketFrame(frame,trust,{now,archiveExpired:true}));}
 const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction(['keys','frames'],'readwrite');let reason;
  const add=(name,id,row,equal)=>{const store=tx.objectStore(name),request=store.get(id);request.onsuccess=()=>{
   if(request.result&&!equal(request.result)){reason=Error('Ripristino multimercato in conflitto; nessun file sostituito');tx.abort();}
   else if(!request.result)store.add({id,...row});};};
  for(const trust of payload.trust)add('keys',trust.keyId,{trust},r=>canonical(r.trust)===canonical(trust));
  for(const v of values)add('frames',v.envelope.sha256,{frame:v.frame,frameSha256:v.frameSha256},r=>r.frameSha256===v.frameSha256);
  tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(reason??tx.error);
 });}finally{db.close();}return {restored:values.length};
}
