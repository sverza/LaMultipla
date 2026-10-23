// SYNTHETIC local filesystem/IPC worker only; never a service or scheduler.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {privateLock} from '../../scripts/lib/private/process-lock.mjs';
const [directory,mode,attempts='100']=process.argv.slice(2);
const message=()=>new Promise(resolve=>process.once('message',resolve));
const send=value=>process.send?.(value);
if(mode.startsWith('freeze-')){
 globalThis.fetch=()=>{throw Error('SYNTHETIC_FREEZE_NETWORK_FORBIDDEN');};
 const {freezeReferenceSeries,verifyReferenceReceipt}=await import('../../scripts/lib/reference-series.mjs');
 const {writeExclusive,readSnapshot}=await import('../../scripts/lib/prospective/store.mjs');
 const input={root:directory,proposal:{id:'reference-g8-20261023-v1'},calendar:{synthetic:true},study:{synthetic:true},schedule:{events:Array.from({length:10},(_,i)=>({fixtureId:'SYNTHETIC-'+i,kickoffUtc:'2026-10-23T18:45:00Z'}))}};
 const journal=async(root,kind)=>{const filename=path.join(root,'synthetic-'+kind+'.json');let payload;
  try{payload=await readSnapshot(filename);}catch(e){if(e.code!=='ENOENT')throw e;payload={synthetic:true,generatedAtUtc:'2026-10-23T13:00:00.000Z',trainingCutoffUtc:'2026-10-01T00:00:00.000Z',entries:Array.from({length:10},(_,i)=>({fixtureId:'SYNTHETIC-'+i})),counts:{synthetic:10}};await writeExclusive(filename,payload);}
  return {filename,journal:payload};};
 try{
  const result=await freezeReferenceSeries(input,{clock:()=>new Date('2026-10-23T13:00:00.000Z'),preflight:async()=>({synthetic:true,window:{opensAtUtc:'2026-10-23T12:45:00.000Z',closesAtUtc:'2026-10-23T16:15:00.000Z'}}),
   freezeV1:async({root})=>{const j=await journal(root,'v1');if(mode==='freeze-crash'){send({event:'V1_WRITTEN',file:j.filename});await message();}return j;},freezeV2:({root})=>journal(root,'v2')});
  send({event:'FROZEN_VERIFIED',verification:await verifyReferenceReceipt(directory),reused:result.reused??false});
 }catch(e){if(e.message!=='Produttore privato già in esecuzione')throw e;send({event:'REJECTED'});}
}else if(mode==='hold'){
 await privateLock(directory,async()=>{send({event:'LOCKED'});await message();});send({event:'DONE'});
}else if(mode==='legacy'){
 const locks=path.join(directory,'locks');await fs.mkdir(locks,{recursive:true});const nonce=randomUUID(),file=path.join(locks,`${process.pid}-${nonce}.json`);
 await fs.writeFile(file,JSON.stringify({pid:process.pid,host:os.hostname(),nonce,choosing:false,ticket:1}),{flag:'wx'});
 send({event:'LOCKED'});await message();await fs.unlink(file);send({event:'DONE'});
}else if(mode==='announcement'){
 const original=fs.link;
 fs.link=async(from,to)=>{await original(from,to);if(to.endsWith('.json')&&!to.endsWith('.ticket.json')){send({event:'ANNOUNCED'});await message();}};
 await privateLock(directory,()=>send({event:'UNEXPECTED_ACTION'}));
}else if(mode==='race'){
 send({event:'READY'});await message();let successes=0;
 for(let i=0;i<Number(attempts);i++){
  try{await privateLock(directory,async()=>{
   const start=process.hrtime.bigint().toString(),file=path.join(directory,'critical.sentinel');let handle;
   try{handle=await fs.open(file,'wx');}catch(e){send({event:'VIOLATION',code:e.code});throw Error('MUTUAL_EXCLUSION_VIOLATION');}
   try{await handle.close();await delay(2);}finally{await fs.unlink(file);}
   const end=process.hrtime.bigint().toString();send({event:'INTERVAL',start,end,pid:process.pid});successes++;
  });}catch(e){
   if(e.message==='Produttore privato già in esecuzione')continue;
   if(['EPERM','EACCES'].includes(e.code)&&e.syscall==='open'&&e.path?.startsWith(path.join(directory,'locks')+path.sep)){
    send({event:'ACCESS_REJECTED',code:e.code,syscall:e.syscall});continue;
   }
   send({event:'ERROR',message:e.message,code:e.code??null});process.exitCode=2;break;
  }
 }
 send({event:'DONE',successes});
}else throw Error('UNKNOWN_SYNTHETIC_MODE');
process.disconnect?.();
