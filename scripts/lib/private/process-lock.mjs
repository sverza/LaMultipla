import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';

const protocol='lamultipla-private-lock-immutable-ticket-v2';
const pattern=/^(\d+)-([a-f0-9-]{36})(\.ticket)?\.json(\.tmp)?$/;
const busy=()=>new Error('Produttore privato già in esecuzione');
const invalid=()=>new Error('Lock incompleto, di altro host o alterato');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const identity=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
function alive(pid){
 try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw new Error('Impossibile verificare il proprietario del lock');}
}
async function readEntry(file){
 try{
  const stat=await fs.lstat(file,{bigint:true});if(!stat.isFile())throw invalid();
  const raw=await fs.readFile(file);
  const after=await fs.lstat(file,{bigint:true});if(!identity(stat,after))throw invalid();
  let record;try{record=JSON.parse(raw.toString('utf8'));}catch{throw invalid();}
  return {file,stat,raw,record};
 }catch(e){
  if(e.code==='ENOENT')return null;
  if(process.platform==='win32'&&e.code==='EPERM'){
   // Windows may report delete-pending as EPERM between enumeration/open.
   // Only a fresh, explicit ENOENT proves withdrawal. Otherwise propagate the
   // denial: never treat an unreadable, still existing participant as absent.
   try{await fs.lstat(file);}catch(check){if(check.code==='ENOENT')return null;throw check;}
  }
  throw e;
 }
}
function validOwner(entry,pid,nonce,{ticket=false,owner=null}={}){
 const r=entry.record,keys=Object.keys(r??{}).sort().join(',');
 if(!r||r.pid!==pid||r.nonce!==nonce||r.host!==os.hostname()||!Number.isSafeInteger(pid)||pid<1
  ||typeof r.choosing!=='boolean'||!Number.isSafeInteger(r.ticket)||r.ticket<0)throw invalid();
 if(ticket){
  if(keys!=='choosing,host,nonce,ownerSha256,pid,protocol,ticket'||r.protocol!==protocol||r.choosing||r.ticket<1||!/^[a-f0-9]{64}$/.test(r.ownerSha256)||owner&&r.ownerSha256!==hash(owner.raw))throw invalid();
 }else if(r.protocol===protocol){
  if(keys!=='choosing,host,nonce,pid,protocol,ticket'||!r.choosing||r.ticket!==0)throw invalid();
 }else if(r.protocol!==undefined||keys!=='choosing,host,nonce,pid,ticket'||r.choosing&&r.ticket!==0||!r.choosing&&r.ticket<1)throw invalid();
}
// Unique nonce paths are never reused by cooperating processes. Check both
// file identity and contents before removing any published record.
async function removeEntry(entry,{partial=false,missingOk=true}={}){
 let stat,raw;
 try{stat=await fs.lstat(entry.file,{bigint:true});if(!stat.isFile()||!identity(stat,entry.stat))throw invalid();raw=await fs.readFile(entry.file);}
 catch(e){if(e.code==='ENOENT'){if(missingOk)return;throw invalid();}throw e;}
 if(!stat.isFile()||!identity(stat,entry.stat)||!(partial?raw.length<=entry.raw.length&&entry.raw.subarray(0,raw.length).equals(raw):raw.equals(entry.raw)))throw invalid();
 const after=await fs.lstat(entry.file,{bigint:true}).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!after){if(missingOk)return;throw invalid();}if(!identity(stat,after))throw invalid();
 await fs.unlink(entry.file).catch(e=>{if(e.code!=='ENOENT')throw e;if(!missingOk)throw invalid();});
}
export async function privateLock(directory,action){
 // Same fail-fast Lamport bakery ordering as v1. Only publication changes:
 // announcement and ticket are immutable files linked to NEW names. Windows
 // never has to replace an existing record using rename/delete sharing.
 const locks=path.join(directory,'locks');await fs.mkdir(locks,{recursive:true,mode:0o700});
 if(!(await fs.lstat(locks)).isDirectory()||await fs.realpath(locks)!==path.resolve(locks))throw invalid();
 const nonce=randomUUID(),name=`${process.pid}-${nonce}.json`,filename=path.join(locks,name);
 const owner={pid:process.pid,host:os.hostname(),nonce,protocol,choosing:true,ticket:0},owned=[];
 async function publish(file,record){
  const raw=Buffer.from(JSON.stringify(record)),temporary=file+'.tmp';let handle;
  try{
   handle=await fs.open(temporary,'wx',0o600);
   const temporaryEntry={file:temporary,raw,stat:await handle.stat({bigint:true}),partial:true};owned.push(temporaryEntry);
   await handle.writeFile(raw);await handle.sync();await handle.close();handle=null;
   // EEXIST/EPERM are errors, never overwrite or weaken an active lock.
   await fs.link(temporary,file);
   const published={file,raw,stat:temporaryEntry.stat};owned.push(published);
   await removeEntry(temporaryEntry);return published;
  }finally{if(handle)await handle.close();}
 }
 async function participants(){
  const names=new Map();
  for(const entry of await fs.readdir(locks)){
   const match=entry.match(pattern);if(!match)throw new Error('Lock privato sconosciuto');
   // A temporary is NOT a published participant. Never delete another owner's
   // temporary, including incomplete files left by a dead process.
   if(match[4])continue;
   const pid=Number(match[1]);if(!Number.isSafeInteger(pid)||pid<1)throw invalid();
   names.set(`${match[1]}-${match[2]}`,{pid,nonce:match[2]});
  }
  const result=[];
  for(const [base,who] of names){
   const main=await readEntry(path.join(locks,base+'.json'));
   const ticket=await readEntry(path.join(locks,base+'.ticket.json'));
   if(!main){
    if(!ticket)continue;validOwner(ticket,who.pid,who.nonce,{ticket:true});
    if(alive(who.pid))throw invalid();await removeEntry(ticket);continue;
   }
   validOwner(main,who.pid,who.nonce);
   if(ticket){if(main.record.protocol!==protocol)throw invalid();validOwner(ticket,who.pid,who.nonce,{ticket:true,owner:main});}
   if(!alive(who.pid)){
    if(ticket)await removeEntry(ticket);await removeEntry(main);continue;
   }
   const r=main.record.protocol===protocol?ticket?.record??main.record:main.record;
   result.push({name:base+'.json',choosing:r.choosing,ticket:r.ticket});
  }
  return result;
 }
 let value,failure,failed=false;
 try{
  const announcement=await publish(filename,owner);
  const ticket=1+Math.max(0,...(await participants()).map(p=>p.ticket));
  if(!Number.isSafeInteger(ticket))throw new Error('Ticket lock esaurito');
  await publish(path.join(locks,`${process.pid}-${nonce}.ticket.json`),{...owner,choosing:false,ticket,ownerSha256:hash(announcement.raw)});
  const others=(await participants()).filter(p=>p.name!==name);
  if(others.some(p=>p.choosing||p.ticket<ticket||p.ticket===ticket&&p.name<name))throw busy();
  for(const entry of owned.filter(e=>!e.partial)){
   const current=await readEntry(entry.file);if(!current||!identity(current.stat,entry.stat)||!current.raw.equals(entry.raw))throw invalid();
  }
  value=await action();
 }catch(e){failure=e;failed=true;}
 const cleanup=[];
 // Withdraw the ticket BEFORE the announcement. Readers see choosing=true
 // during release and fail closed, never an unprotected critical section.
 for(const entry of [...owned].reverse())try{await removeEntry(entry,{partial:entry.partial,missingOk:entry.partial===true});}catch(e){cleanup.push(e);}
 if(cleanup.length)throw new AggregateError(failed?[failure,...cleanup]:cleanup,'Rilascio lock non verificato');
 if(failed)throw failure;return value;
}
