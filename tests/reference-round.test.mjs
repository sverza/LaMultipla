import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateRoundApproval,roundDirectory,loadRoundPackage,ROUND_APPROVAL_SCHEMA,assertRoundWriteNamespace} from '../scripts/lib/reference-odds/round-freeze.mjs';
import {referenceWindow,referenceWindowBounds} from '../scripts/lib/reference-series.mjs';
import {hashValue} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
import {envelope} from '../scripts/lib/prospective/store.mjs';

// Mechanical approval-validation vectors are not user consents or valid archives.
function vector(){const plan={preparedAtUtc:'2026-10-28T11:00:00.000Z',scope:{cohortId:'SYNTHETIC-ONLY',season:'2026/27',round:10},window:{closesAtUtc:'2026-10-31T11:30:00.000Z'}};
 const approval={schema:ROUND_APPROVAL_SCHEMA,scope:plan.scope,packageSha256:hashValue(plan),freezeAuthorized:true,registeredFreezeFitsAuthorized:true,
  sourceRole:'A',reviewer:'SYNTHETIC_TEST_NOT_AN_ACTUAL_REVIEW',provenance:'EXPLICIT_USER_APPROVAL_LOCAL_RECORD',approvedAtUtc:'2026-10-28T12:00:00.000Z',expiresAtUtc:plan.window.closesAtUtc};
 return {plan,approval,now:'2026-10-31T08:00:00.000Z'};}
test('Round approval: new round and registered-fit computations require explicit consent bound to the exact package',()=>{
 const f=vector();assert.doesNotThrow(()=>validateRoundApproval(f.plan,f.approval,f.now));
 for(const a of [null,{...f.approval,freezeAuthorized:false},{...f.approval,registeredFreezeFitsAuthorized:false},
  {...f.approval,packageSha256:'a'.repeat(64)},{...f.approval,scope:{...f.plan.scope,round:8}},
  {...f.approval,provenance:'INFERRED_FROM_PREVIOUS_ROUND'}])assert.throws(()=>validateRoundApproval(f.plan,a,f.now),/APPROVAL/);
});
test('Round approval: future, expired and changed approval-window evidence fails closed',()=>{
 const f=vector();assert.throws(()=>validateRoundApproval(f.plan,f.approval,'2026-10-27T08:00:00.000Z'),/APPROVAL/);
 assert.throws(()=>validateRoundApproval(f.plan,f.approval,'2026-10-31T11:30:00.000Z'),/APPROVAL/);
 assert.throws(()=>validateRoundApproval(f.plan,{...f.approval,expiresAtUtc:'2026-11-01T11:30:00.000Z'},f.now),/APPROVAL/);
});
test('Round G10 window: CET conversion, opening and last admissible millisecond, completion-exclusive cutoff',()=>{
 const events=Array.from({length:10},(_,i)=>({kickoffUtc:i?'2026-11-02T19:45:00Z':'2026-10-31T14:00:00Z'}));
 const w=referenceWindowBounds({events});assert.equal(w.opensAtUtc,'2026-10-31T08:00:00.000Z');assert.equal(w.closesAtUtc,'2026-10-31T11:30:00.000Z');
 assert.throws(()=>referenceWindow({events},'2026-10-31T07:59:59.999Z'));
 assert.doesNotThrow(()=>referenceWindow({events},w.opensAtUtc));assert.doesNotThrow(()=>referenceWindow({events},'2026-10-31T11:29:59.999Z'));
 assert.throws(()=>referenceWindow({events},w.closesAtUtc));
 const rome=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 assert.equal(rome.format(new Date(w.opensAtUtc)),'09:00');assert.equal(rome.format(new Date(w.closesAtUtc)),'12:30');
});
test('Round namespace: future rounds stay separate from the original G8 archive and reject path traversal',()=>{
 const dir=roundDirectory(path.resolve('.'),{cohortId:'reference-g8-20261023-v1',season:'2026/27',round:10});
 assert.ok(dir.endsWith(path.join('rounds','2026-27-round-10-reference-v2')));
 assert.throws(()=>roundDirectory('.', {cohortId:'../../escape',season:'2026/27',round:10}),/SCOPE/);
});
test('Round loader: synthetic/unrecognized packages cannot become authentic, before any new file is written',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lm-round-reject-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'.local'));
 const file=path.join(root,'.local/fake.json');await fs.writeFile(file,JSON.stringify(envelope({schema:'SYNTHETIC_NOT_A_PACKAGE'})));
 const before=await fs.readdir(path.join(root,'.local'));await assert.rejects(loadRoundPackage(root,file),/PACKAGE/);
 assert.deepEqual(await fs.readdir(path.join(root,'.local')),before);
});
test('Round CLI: missing inputs are rejected and no standalone synthetic/authentic toggle exists',()=>{
 for(const args of [['--synthetic','false'],['--plan','none','--freeze-approved','--now','2026-10-31T09:00:00Z']]){
  const r=spawnSync(process.execPath,['scripts/reference-round.mjs',...args],{encoding:'utf8',windowsHide:true});assert.notEqual(r.status,0);
 }
 const r=spawnSync(process.execPath,['scripts/reference-exploration.mjs','--synthetic','false'],{encoding:'utf8',windowsHide:true});assert.notEqual(r.status,0);
});
test('Round filesystem: a directory junction/symlink never bypasses the verified reader namespace',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lm-round-link-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const real=path.join(root,'.local/real');await fs.mkdir(real,{recursive:true});await fs.writeFile(path.join(real,'p.json'),'{}');
 const link=path.join(root,'.local/link');await fs.symlink(real,link,process.platform==='win32'?'junction':'dir');
 await assert.rejects(loadRoundPackage(root,path.join(link,'p.json')),/UNSAFE_PATH/);
});
test('Round filesystem: nested journal directories are checked before the original freezer can write through them',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lm-round-write-path-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'.local'));const scope={cohortId:'SYNTHETIC-ONLY',season:'2026/27',round:10},base=roundDirectory(root,scope);
 await assert.doesNotReject(assertRoundWriteNamespace(root,scope));
 const external=path.join(root,'outside-local');await fs.mkdir(external);await fs.mkdir(base,{recursive:true});
 await fs.symlink(external,path.join(base,'.local'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(assertRoundWriteNamespace(root,scope),/UNSAFE_NAMESPACE/);assert.deepEqual(await fs.readdir(external),[]);
});
