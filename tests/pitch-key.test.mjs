// No GUI is opened: all dialog responses are injected. Real DPAPI, when
// available on Windows, receives only the fixed synthetic string below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {installPitchKey,loadPitchKey,inspectPitchKey} from '../scripts/lib/private/pitch-key.mjs';
import {FOOTBALL_SECURITY_IMPORT} from '../scripts/lib/private/football-data-key.mjs';
import {powershellMemory} from '../scripts/lib/private/windows-vault.mjs';
import {ODDS_KEY_DIALOG_SCRIPT,ODDS_KEY_DECRYPT_SCRIPT} from '../scripts/lib/private/odds-key.mjs';
const windows={skip:process.platform!=='win32'},synthetic='SYNTHETIC_PITCHAPI_TEST_ONLY_20261021',cipher='a'.repeat(256);
const dialog=FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DIALOG_SCRIPT.replaceAll('OddsPapi','PitchAPI');
const decrypt=FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DECRYPT_SCRIPT;
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-pitch-key-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'.local'));return {root,file:path.join(root,'.local/pitchapi/api-key.dpapi')};}

test('pitch key explicitly imports native PowerShell Security without relaxing execution policy',()=>{
 assert.match(FOOTBALL_SECURITY_IMPORT,/Join-Path \$PSHOME 'Modules\\Microsoft\.PowerShell\.Security\\Microsoft\.PowerShell\.Security\.psd1'/);
 assert.match(FOOTBALL_SECURITY_IMPORT,/-ErrorAction Stop/);
 assert.doesNotMatch(FOOTBALL_SECURITY_IMPORT,/Set-ExecutionPolicy|-ExecutionPolicy|Bypass|Unrestricted|PSModulePath\s*=/i);
});
test('pitch key synthetic install/read imports Security in both stages and refuses replacement',windows,async t=>{
 const {root,file}=await setup(t),calls=[];
 const run=async(script,input,options)=>{calls.push({script,input,options});
  if(script===dialog){assert.equal(input,'');assert.equal(options.sta,true);assert.equal(options.showWindow,true);return JSON.stringify({ciphertext:cipher});}
  assert.equal(script,decrypt);assert.equal(input,cipher);return synthetic;};
 const result=await installPitchKey(root,{run});assert.equal(result.encryptedOnDisk,true);assert.equal(result.networkRequests,0);assert.equal(result.providerValidated,false);
 assert.equal((await fs.readFile(file,'utf8')).trim(),cipher);assert.deepEqual(await inspectPitchKey(root,{run}),result);assert.equal(await loadPitchKey(root,{run}),synthetic);
 await assert.rejects(installPitchKey(root,{run:()=>assert.fail('must not open dialog')}),/PITCH_KEY_ALREADY_PRESENT/);
 assert.equal(calls.filter(c=>c.script===dialog).length,1);assert.equal(calls.filter(c=>c.script===decrypt).length,4);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PITCHAPI_TEST_ONLY/);
});
test('pitch key storage is isolated from the existing football-data credential',windows,async t=>{
 const {root,file}=await setup(t),other=path.join(root,'.local/football-data/api-key.dpapi');
 await fs.mkdir(path.dirname(other));await fs.writeFile(other,'SYNTHETIC_EXISTING_ENCRYPTED_BYTES');
 const run=async script=>script===dialog?JSON.stringify({ciphertext:cipher}):synthetic;
 await installPitchKey(root,{run});assert.notEqual(file,other);
 assert.equal(await fs.readFile(other,'utf8'),'SYNTHETIC_EXISTING_ENCRYPTED_BYTES');
 assert.deepEqual((await fs.readdir(path.dirname(file))).sort(),['api-key.dpapi']);
});
test('pitch key cancelled, invalid and failed dialog leaves no credential file',windows,async t=>{
 const cases=[['{"cancelled":true}','PITCH_KEY_CANCELLED'],['{"invalid":true}','PITCH_KEY_FORMAT_INVALID'],['not-json','PITCH_KEY_DIALOG_FAILED'],
  [JSON.stringify({ciphertext:synthetic}),'PITCH_KEY_DIALOG_INVALID']];
 for(const [reply,code] of cases){const {root,file}=await setup(t);await assert.rejects(installPitchKey(root,{run:async()=>reply}),new RegExp(code));await assert.rejects(fs.stat(file),{code:'ENOENT'});}
 const {root,file}=await setup(t);await assert.rejects(installPitchKey(root,{run:async()=>{throw Error(synthetic);}}),error=>error.message==='PITCH_KEY_DIALOG_FAILED'&&!error.message.includes(synthetic));
 await assert.rejects(fs.stat(file),{code:'ENOENT'});
});
test('pitch key invalid decrypted values including DEL are refused before publishing',windows,async t=>{
 for(const value of ['',synthetic+'\n',synthetic+'\u007f',synthetic+'\u0000',' '+synthetic]){
  const {root,file}=await setup(t);let calls=0;
  await assert.rejects(installPitchKey(root,{run:async script=>{calls++;return script===dialog?JSON.stringify({ciphertext:cipher}):value;}}),/PITCH_KEY_FORMAT_INVALID/);
  assert.equal(calls,2);await assert.rejects(fs.stat(file),{code:'ENOENT'});
 }
});
test('pitch key refuses redirected directory and final file without reading targets or showing dialog',windows,async t=>{
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-pitch-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 const a=await setup(t);await fs.symlink(outside,path.dirname(a.file),'junction');
 await assert.rejects(installPitchKey(a.root,{run:()=>assert.fail()}),/PITCH_KEY_PATH_INVALID/);
 const b=await setup(t);await fs.mkdir(path.dirname(b.file));
 // A directory junction at the final filename is always creatable without
 // symbolic-link privileges and must be rejected by the lstat file guard.
 await fs.symlink(outside,b.file,'junction');
 await assert.rejects(loadPitchKey(b.root,{run:()=>assert.fail()}),/PITCH_KEY_PATH_INVALID/);
 assert.deepEqual(await fs.readdir(outside),[]);
});
test('pitch key DPAPI roundtrip uses only synthetic bytes and an isolated temporary store',windows,async t=>{
 const {root,file}=await setup(t);let dialogCalls=0;
 const run=async(script,input,options)=>{
  assert.ok(script.startsWith(FOOTBALL_SECURITY_IMPORT));
  if(script===dialog){dialogCalls++;assert.equal(input,'');assert.equal(options.showWindow,true);
   // Replace the GUI entirely; do not create a form or use the clipboard.
   const protect=FOOTBALL_SECURITY_IMPORT+String.raw`$secure=$null;try{$secure=ConvertTo-SecureString -String ([Console]::In.ReadToEnd()) -AsPlainText -Force;[Console]::Write((@{ciphertext=(ConvertFrom-SecureString -SecureString $secure)}|ConvertTo-Json -Compress));}finally{if($secure){$secure.Dispose();}}`;
   return powershellMemory(protect,synthetic);
  }
  assert.equal(script,decrypt);return powershellMemory(script,input);
 };
 await installPitchKey(root,{run});assert.equal(await loadPitchKey(root,{run}),synthetic);assert.equal(dialogCalls,1);
 const encrypted=await fs.readFile(file,'utf8');assert.match(encrypted.trim(),/^[a-f0-9]{128,65536}$/i);assert.ok(!encrypted.includes(synthetic));
});
