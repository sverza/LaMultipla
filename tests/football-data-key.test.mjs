// No GUI is opened: all dialog responses are injected. Real DPAPI, when
// available on Windows, receives only the fixed synthetic string below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {installFootballDataKey,loadFootballDataKey,FOOTBALL_SECURITY_IMPORT} from '../scripts/lib/private/football-data-key.mjs';
import {powershellMemory} from '../scripts/lib/private/windows-vault.mjs';
import {ODDS_KEY_DIALOG_SCRIPT,ODDS_KEY_DECRYPT_SCRIPT} from '../scripts/lib/private/odds-key.mjs';
const windows={skip:process.platform!=='win32'},synthetic='SYNTHETIC_FOOTBALL_DATA_TEST_ONLY_20261021',cipher='a'.repeat(256);
const dialog=FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DIALOG_SCRIPT.replaceAll('OddsPapi','football-data.org');
const decrypt=FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DECRYPT_SCRIPT;
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-football-key-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'.local'));return {root,file:path.join(root,'.local/football-data/api-key.dpapi')};}

test('football key explicitly imports native PowerShell Security without relaxing execution policy',()=>{
 assert.match(FOOTBALL_SECURITY_IMPORT,/Join-Path \$PSHOME 'Modules\\Microsoft\.PowerShell\.Security\\Microsoft\.PowerShell\.Security\.psd1'/);
 assert.match(FOOTBALL_SECURITY_IMPORT,/-ErrorAction Stop/);
 assert.doesNotMatch(FOOTBALL_SECURITY_IMPORT,/Set-ExecutionPolicy|-ExecutionPolicy|Bypass|Unrestricted|PSModulePath\s*=/i);
});
test('football key synthetic install/read imports Security in both stages and refuses replacement',windows,async t=>{
 const {root,file}=await setup(t),calls=[];
 const run=async(script,input,options)=>{calls.push({script,input,options});
  if(script===dialog){assert.equal(input,'');assert.equal(options.sta,true);assert.equal(options.showWindow,true);return JSON.stringify({ciphertext:cipher});}
  assert.equal(script,decrypt);assert.equal(input,cipher);return synthetic;};
 const result=await installFootballDataKey(root,{run});assert.equal(result.encryptedOnDisk,true);assert.equal(result.networkRequests,0);assert.equal(result.providerValidated,false);
 assert.equal((await fs.readFile(file,'utf8')).trim(),cipher);assert.equal(await loadFootballDataKey(root,{run}),synthetic);
 await assert.rejects(installFootballDataKey(root,{run:()=>assert.fail('must not open dialog')}),/FOOTBALL_KEY_ALREADY_PRESENT/);
 assert.equal(calls.filter(c=>c.script===dialog).length,1);assert.equal(calls.filter(c=>c.script===decrypt).length,2);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_FOOTBALL_DATA_TEST_ONLY/);
});
test('football key cancelled, invalid and failed dialog leaves no credential file',windows,async t=>{
 const cases=[['{"cancelled":true}','FOOTBALL_KEY_CANCELLED'],['{"invalid":true}','FOOTBALL_KEY_FORMAT_INVALID'],['not-json','FOOTBALL_KEY_DIALOG_FAILED'],
  [JSON.stringify({ciphertext:synthetic}),'FOOTBALL_KEY_NOT_SAVED']];
 for(const [reply,code] of cases){const {root,file}=await setup(t);await assert.rejects(installFootballDataKey(root,{run:async()=>reply}),new RegExp(code));await assert.rejects(fs.stat(file),{code:'ENOENT'});}
 const {root,file}=await setup(t);await assert.rejects(installFootballDataKey(root,{run:async()=>{throw Error(synthetic);}}),error=>error.message==='FOOTBALL_KEY_DIALOG_FAILED'&&!error.message.includes(synthetic));
 await assert.rejects(fs.stat(file),{code:'ENOENT'});
});
test('football key invalid decrypted values including DEL are refused before publishing',windows,async t=>{
 for(const value of ['',synthetic+'\n',synthetic+'\u007f',synthetic+'\u0000',' '+synthetic]){
  const {root,file}=await setup(t);let calls=0;
  await assert.rejects(installFootballDataKey(root,{run:async script=>{calls++;return script===dialog?JSON.stringify({ciphertext:cipher}):value;}}),/FOOTBALL_KEY_INVALID/);
  assert.equal(calls,2);await assert.rejects(fs.stat(file),{code:'ENOENT'});
 }
});
test('football key refuses redirected directory and final file without reading targets or showing dialog',windows,async t=>{
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-football-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 const a=await setup(t);await fs.symlink(outside,path.dirname(a.file),'junction');
 await assert.rejects(installFootballDataKey(a.root,{run:()=>assert.fail()}),/FOOTBALL_KEY_PATH_INVALID/);
 const b=await setup(t);await fs.mkdir(path.dirname(b.file));
 // A directory junction at the final filename is always creatable without
 // symbolic-link privileges and must be rejected by the lstat file guard.
 await fs.symlink(outside,b.file,'junction');
 await assert.rejects(loadFootballDataKey(b.root,{run:()=>assert.fail()}),/FOOTBALL_KEY_PATH_INVALID/);
 assert.deepEqual(await fs.readdir(outside),[]);
});
test('football key DPAPI roundtrip uses only synthetic bytes and an isolated temporary store',windows,async t=>{
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
 await installFootballDataKey(root,{run});assert.equal(await loadFootballDataKey(root,{run}),synthetic);assert.equal(dialogCalls,1);
 const encrypted=await fs.readFile(file,'utf8');assert.match(encrypted.trim(),/^[a-f0-9]{128,65536}$/i);assert.ok(!encrypted.includes(synthetic));
});
