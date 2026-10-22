import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {privateLock} from '../scripts/lib/private/process-lock.mjs';
const worker=new URL('./fixtures/process-lock-worker.mjs',import.meta.url);
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-lock-v2-'));t.after(async()=>{const resolved=await fs.realpath(dir);assert.ok(resolved.startsWith(await fs.realpath(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});return dir;}
function child(t,dir,mode,n){
 const p=spawn(process.execPath,[fileURLToPath(worker),dir,mode,String(n??100)],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 const events=[];let stderr='';p.stderr.on('data',b=>stderr+=b);p.on('message',m=>events.push(m));
 const exit=new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',(code,signal)=>resolve({code,signal,stderr}));});
 const event=async name=>{if(events.some(e=>e.event===name))return events.find(e=>e.event===name);return Promise.race([new Promise(resolve=>{const listen=m=>{if(m.event===name){p.off('message',listen);resolve(m);}};p.on('message',listen);}),exit.then(r=>{throw Error('WORKER_EXIT_'+JSON.stringify(r));}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('WORKER_TIMEOUT_'+name)),15000);timer.unref();})]);};
 t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');await exit;}});return {p,events,event,exit};
}
async function psHolder(t,script,input){
 const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{stdio:['pipe','pipe','pipe'],windowsHide:true});let stderr='';p.stderr.on('data',b=>stderr+=b);
 const exit=new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',code=>resolve({code,stderr}));});
 const ready=Promise.race([new Promise(resolve=>{let out='';p.stdout.on('data',b=>{out+=b;if(out.includes('READY'))resolve();});}),exit.then(r=>{throw Error('POWERSHELL_EXIT_'+JSON.stringify(r));}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('POWERSHELL_TIMEOUT')),10000);timer.unref();})]);
 t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.stdin.end('\n');await exit;}});p.stdin.write(input+'\n');await ready;return async()=>{p.stdin.end('\n');assert.equal((await exit).code,0);};
}
const owner=(pid=process.pid)=>{const nonce=randomUUID();return {pid,host:os.hostname(),nonce,choosing:false,ticket:1};};
async function seed(dir,record,raw=JSON.stringify(record)){const locks=path.join(dir,'locks');await fs.mkdir(locks,{recursive:true});const file=path.join(locks,`${record.pid}-${record.nonce}.json`);await fs.writeFile(file,raw);return file;}

test('lock single/repeated acquisition uses no rename and releases only its own immutable records',async t=>{
 const dir=await setup(t),rename=fs.rename;let calls=0;
 fs.rename=async()=>{calls++;throw Error('RENAME_MUST_NOT_BE_USED');};t.after(()=>{fs.rename=rename;});
 for(let i=0;i<2000;i++)assert.equal(await privateLock(dir,async()=>i),i);
 assert.equal(calls,0);assert.deepEqual(await fs.readdir(path.join(dir,'locks')),[]);
});
test('lock denies second and third process while owner is active; regular release permits next owner',async t=>{
 const dir=await setup(t),p=child(t,dir,'hold');await p.event('LOCKED');const before=await fs.readdir(path.join(dir,'locks'));
 await assert.rejects(privateLock(dir,()=>assert.fail('second entered')),/già in esecuzione/);
 const third=child(t,dir,'race',1);await third.event('READY');third.p.send('GO');assert.equal((await third.exit).code,0);assert.equal(third.events.filter(e=>e.event==='INTERVAL').length,0);
 assert.deepEqual(await fs.readdir(path.join(dir,'locks')),before);p.p.send('RELEASE');assert.equal((await p.exit).code,0);
 assert.equal(await privateLock(dir,()=>true),true);assert.deepEqual(await fs.readdir(path.join(dir,'locks')),[]);
});
test('lock recovers verified dead owner after crash and preserves foreign incomplete temporaries',async t=>{
 const dir=await setup(t),p=child(t,dir,'hold');await p.event('LOCKED');const abandoned=await fs.readdir(path.join(dir,'locks'));assert.equal(abandoned.length,2);
 p.p.kill('SIGKILL');await p.exit;const temp=path.join(dir,'locks',`${p.p.pid}-${randomUUID()}.json.tmp`);await fs.writeFile(temp,'unfinished');
 assert.equal(await privateLock(dir,()=>true),true);assert.deepEqual(await fs.readdir(path.join(dir,'locks')),[path.basename(temp)]);assert.equal(await fs.readFile(temp,'utf8'),'unfinished');
});
test('lock crash during choosing recovers the dead announcement without publishing a forged ticket',async t=>{
 const dir=await setup(t),p=child(t,dir,'announcement');await p.event('ANNOUNCED');await assert.rejects(privateLock(dir,()=>assert.fail()),/già in esecuzione/);
 p.p.kill('SIGKILL');await p.exit;assert.equal(await privateLock(dir,()=>true),true);
 assert.ok((await fs.readdir(path.join(dir,'locks'))).every(n=>n.endsWith('.tmp')));
});
test('lock recognizes legacy live owner without stealing it',async t=>{
 const dir=await setup(t),p=child(t,dir,'legacy');await p.event('LOCKED');await assert.rejects(privateLock(dir,()=>assert.fail()),/già in esecuzione/);
 p.p.send('RELEASE');assert.equal((await p.exit).code,0);assert.equal(await privateLock(dir,()=>true),true);
});
test('lock rejects incomplete/altered/foreign-host records without deleting or repairing them',async t=>{
 for(const mutate of [r=>r.host='OTHER_HOST',r=>r.nonce=randomUUID(),r=>r.ticket=-1,r=>r.choosing='false']){
  const dir=await setup(t),r=owner(),file=await seed(dir,r);const changed={...r};mutate(changed);const raw=JSON.stringify(changed);await fs.writeFile(file,raw);
  await assert.rejects(privateLock(dir,()=>assert.fail()),/alterato/);assert.equal(await fs.readFile(file,'utf8'),raw);
 }
 const dir=await setup(t),r=owner(),file=await seed(dir,r,'{');await assert.rejects(privateLock(dir,()=>assert.fail()),/alterato/);assert.equal(await fs.readFile(file,'utf8'),'{');
});
test('lock unknown files and orphan live ticket fail closed and remain untouched',async t=>{
 const dir=await setup(t);await fs.mkdir(path.join(dir,'locks'));await fs.writeFile(path.join(dir,'locks','unknown.json'),'SYNTHETIC');await assert.rejects(privateLock(dir,()=>assert.fail()),/sconosciuto/);
 const other=await setup(t),r=owner();r.protocol='lamultipla-private-lock-immutable-ticket-v2';r.ownerSha256='a'.repeat(64);await fs.mkdir(path.join(other,'locks'));const file=path.join(other,'locks',`${r.pid}-${r.nonce}.ticket.json`);await fs.writeFile(file,JSON.stringify(r));await assert.rejects(privateLock(other,()=>assert.fail()),/alterato/);assert.ok(await fs.stat(file));
});
test('lock release preserves a replaced/altered own path rather than deleting another record',async t=>{
 const dir=await setup(t);let altered;
 await assert.rejects(privateLock(dir,async()=>{
  const main=(await fs.readdir(path.join(dir,'locks'))).find(n=>n.endsWith('.json')&&!n.endsWith('.ticket.json'));altered=path.join(dir,'locks',main);
  await fs.writeFile(altered,'SYNTHETIC_ALTERED_OWNER');
 }),/Rilascio lock non verificato/);
 assert.equal(await fs.readFile(altered,'utf8'),'SYNTHETIC_ALTERED_OWNER');
 const other=await setup(t);
 await assert.rejects(privateLock(other,async()=>{
  const main=(await fs.readdir(path.join(other,'locks'))).find(n=>n.endsWith('.json')&&!n.endsWith('.ticket.json'));
  await fs.unlink(path.join(other,'locks',main));
 }),/Rilascio lock non verificato/);
});
test('lock genuine EEXIST during publication never overwrites target or enters the action',async t=>{
 const dir=await setup(t),link=fs.link;let collision;
 fs.link=async(from,to)=>{if(to.endsWith('.ticket.json')){collision=to;await fs.writeFile(to,'SYNTHETIC_FOREIGN_RECORD',{flag:'wx'});}return link(from,to);};t.after(()=>{fs.link=link;});
 await assert.rejects(privateLock(dir,()=>assert.fail('entered after EEXIST')),{code:'EEXIST'});
 assert.equal(await fs.readFile(collision,'utf8'),'SYNTHETIC_FOREIGN_RECORD');
});
test('lock publication permission errors fail closed and clean only owned temporaries',async t=>{
 const dir=await setup(t),link=fs.link;fs.link=async()=>{throw Object.assign(Error('SYNTHETIC_DENIED'),{code:'EPERM'});};t.after(()=>{fs.link=link;});
 await assert.rejects(privateLock(dir,()=>assert.fail()),{code:'EPERM'});assert.deepEqual(await fs.readdir(path.join(dir,'locks')),[]);
 fs.link=link;
 // A denied read is never ignored while the participant still exists. Only
 // confirmed disappearance after a Windows delete-pending EPERM permits entry.
 for(const vanished of [false,true]){
  const other=await setup(t),r=owner(),file=await seed(other,r),read=fs.readFile;let injected=false;
  fs.readFile=async(target,...args)=>{
   if(target===file&&!injected){injected=true;if(vanished)await fs.unlink(file);throw Object.assign(Error('SYNTHETIC_READ_DENIED'),{code:process.platform==='win32'?'EPERM':vanished?'ENOENT':'EACCES'});}
   return read(target,...args);
  };
  try{
   if(vanished)assert.equal(await privateLock(other,()=>true),true);
   else await assert.rejects(privateLock(other,()=>assert.fail('denied participant was ignored')),{code:process.platform==='win32'?'EPERM':'EACCES'});
  }finally{fs.readFile=read;}
  if(!vanished)assert.equal(await fs.readFile(file,'utf8'),JSON.stringify(r));
 }
});
test('lock action failure and nested contention release without masking action error',async t=>{
 const dir=await setup(t);await assert.rejects(privateLock(dir,async()=>{await assert.rejects(privateLock(dir,()=>assert.fail()),/già in esecuzione/);throw Error('SYNTHETIC_ACTION_ERROR');}),/SYNTHETIC_ACTION_ERROR/);
 assert.deepEqual(await fs.readdir(path.join(dir,'locks')),[]);
 for(const reason of [undefined,null,0,'']){let rejected=false;try{await privateLock(dir,()=>{throw reason;});}catch(e){assert.equal(e,reason);rejected=true;}assert.equal(rejected,true);}
});
test('lock multiprocess race detects any sentinel collision or overlapping critical intervals',async t=>{
 const dir=await setup(t),children=Array.from({length:6},()=>child(t,dir,'race',100));await Promise.all(children.map(p=>p.event('READY')));for(const p of children)p.p.send('GO');
 const results=await Promise.all(children.map(p=>p.exit));assert.ok(results.every(r=>r.code===0),JSON.stringify({results,errors:children.flatMap(p=>p.events).filter(e=>['VIOLATION','ERROR'].includes(e.event))}));
 const events=children.flatMap(p=>p.events);assert.equal(events.filter(e=>['VIOLATION','ERROR'].includes(e.event)).length,0,JSON.stringify(events.filter(e=>e.event==='ERROR')));
 const intervals=events.filter(e=>e.event==='INTERVAL').sort((a,b)=>BigInt(a.start)<BigInt(b.start)?-1:1);assert.ok(intervals.length>0,'No critical section was exercised');
 for(let i=1;i<intervals.length;i++)assert.ok(BigInt(intervals[i-1].end)<=BigInt(intervals[i].start),'OVERLAPPING_CRITICAL_SECTIONS');
 t.diagnostic(JSON.stringify({processes:children.length,attempts:600,criticalEntries:intervals.length,windowsAccessRejections:events.filter(e=>e.event==='ACCESS_REJECTED').length,overlaps:0}));
 assert.deepEqual(await fs.readdir(path.join(dir,'locks')),[]);assert.equal(await privateLock(dir,()=>true),true);
});
test('Windows real deny-delete handle reproduces EPERM replacement; immutable ticket publication remains possible',{skip:process.platform!=='win32'},async t=>{
 const dir=await setup(t),target=path.join(dir,'owner.json'),source=path.join(dir,'ticket.tmp');await fs.writeFile(target,'SYNTHETIC_OWNER');await fs.writeFile(source,'SYNTHETIC_TICKET');
 const release=await psHolder(t,"$p=[Console]::ReadLine(); $f=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite); try { [Console]::WriteLine('READY'); [Console]::Out.Flush(); [void][Console]::ReadLine() } finally { $f.Dispose() }",target);
 await assert.rejects(fs.rename(source,target),e=>['EPERM','EACCES'].includes(e.code));assert.equal(await fs.readFile(target,'utf8'),'SYNTHETIC_OWNER');
 await fs.link(source,path.join(dir,'new-ticket.json'));assert.equal(await fs.readFile(path.join(dir,'new-ticket.json'),'utf8'),'SYNTHETIC_TICKET');await release();
 await fs.rename(source,target);assert.equal(await fs.readFile(target,'utf8'),'SYNTHETIC_TICKET');
});
test('Windows real ACL denies publication before action and is restored in isolated directory',{skip:process.platform!=='win32'},async t=>{
 const dir=await setup(t),locks=path.join(dir,'locks');await fs.mkdir(locks);
 const release=await psHolder(t,"$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; $p=[Console]::ReadLine(); $original=Get-Acl -LiteralPath $p; $changed=Get-Acl -LiteralPath $p; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $r=New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::CreateFiles,[Security.AccessControl.AccessControlType]::Deny); $changed.AddAccessRule($r); try { Set-Acl -LiteralPath $p -AclObject $changed -ErrorAction Stop; [Console]::WriteLine('READY'); [Console]::Out.Flush(); [void][Console]::ReadLine() } finally { Set-Acl -LiteralPath $p -AclObject $original -ErrorAction Stop }",locks);
 try{await assert.rejects(privateLock(dir,()=>assert.fail('ACL was bypassed')),e=>['EPERM','EACCES'].includes(e.code));}finally{await release();}
 assert.equal(await privateLock(dir,()=>true),true);
});

test('lock preserves corrupt dead records instead of inventing an owner during recovery',async t=>{
 const dir=await setup(t),p=child(t,dir,'hold');await p.event('LOCKED');p.p.kill('SIGKILL');await p.exit;
 const main=(await fs.readdir(path.join(dir,'locks'))).find(n=>!n.endsWith('.ticket.json')),file=path.join(dir,'locks',main);await fs.writeFile(file,'{');
 await assert.rejects(privateLock(dir,()=>assert.fail('corrupt dead owner was ignored')),/alterato/);assert.equal(await fs.readFile(file,'utf8'),'{');
});

test('synthetic G8 multiprocess freeze rejects concurrent owner, recovers real process crash and verifies immutable receipt',async t=>{
 const dir=await setup(t),first=child(t,dir,'freeze-crash');const v1=await first.event('V1_WRITTEN'),before=await fs.readFile(v1.file);
 const base=path.join(dir,'.local/research-review/cohorts/reference-g8-20261023-v1'),intent=await fs.readFile(path.join(base,'freeze-intent.json'));
 const second=child(t,dir,'freeze-recover');await second.event('REJECTED');assert.equal((await second.exit).code,0);
 first.p.kill('SIGKILL');await first.exit;
 const recovered=child(t,dir,'freeze-recover'),verified=await recovered.event('FROZEN_VERIFIED');assert.equal((await recovered.exit).code,0);assert.equal(verified.verification.status,'FROZEN_VERIFIED');
 assert.deepEqual(await fs.readFile(v1.file),before);assert.deepEqual(await fs.readFile(path.join(base,'freeze-intent.json')),intent);
 const receipt=await fs.readFile(path.join(base,'freeze-receipt.json')),again=child(t,dir,'freeze-recover');const replay=await again.event('FROZEN_VERIFIED');assert.equal((await again.exit).code,0);assert.equal(replay.reused,true);
 assert.deepEqual(await fs.readFile(path.join(base,'freeze-receipt.json')),receipt);assert.deepEqual(await fs.readdir(path.join(base,'locks')),[]);
});
