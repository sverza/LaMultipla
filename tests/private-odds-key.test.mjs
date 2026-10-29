// SYNTHETIC adapter tests. Real SecureString/DPAPI is verified only on Windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {installOddsKey,inspectOddsKey,loadOddsKey,ODDS_KEY_DIALOG_SCRIPT,ODDS_KEY_DECRYPT_SCRIPT} from '../scripts/lib/private/odds-key.mjs';
import {buildPowerShellRequest} from '../scripts/lib/private/windows-vault.mjs';
const cipher='a'.repeat(256),secret='SYNTHETIC_ODDSPAPI_TOKEN_ONLY';
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-odds-key-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'.local/oddspapi/api-key.dpapi');return {root,file};}
function mock(calls=[]){return async(script,input,options)=>{
  calls.push({script,input,options});
  if(script===ODDS_KEY_DIALOG_SCRIPT)return JSON.stringify({ciphertext:cipher});
  assert.equal(script,ODDS_KEY_DECRYPT_SCRIPT);assert.equal(input,cipher);return secret;
};}
test('one-time key install writes protected bytes exclusively and unattended reader returns only in-memory key',async t=>{
  const {root,file}=await setup(t),calls=[],run=mock(calls);
  const result=await installOddsKey(root,{run,platform:'win32'});
  assert.equal((await fs.readFile(file,'utf8')).trim(),cipher);assert.equal(result.decryptableByCurrentWindowsUser,true);
  assert.equal(result.providerValidated,false);assert.equal(result.networkRequests,0);assert.equal(result.tasksRegistered,false);
  assert.ok(!JSON.stringify(result).includes(secret));assert.equal(await loadOddsKey(root,{run,platform:'win32'}),secret);
  const inspection=await inspectOddsKey(root,{run,platform:'win32'});assert.equal(inspection.configured,true);assert.ok(!JSON.stringify(inspection).includes(secret));
  assert.equal(calls.filter(c=>c.script===ODDS_KEY_DIALOG_SCRIPT).length,1);
  assert.ok((await fs.readdir(path.dirname(file))).every(name=>name==='api-key.dpapi'));
});
test('existing key is never replaced or prompts opened; concurrent install cannot overwrite a newly created key',async t=>{
  const s=await setup(t);await fs.mkdir(path.dirname(s.file),{recursive:true});await fs.writeFile(s.file,cipher);
  await assert.rejects(installOddsKey(s.root,{platform:'win32',run:async()=>assert.fail()}),{code:'PRIVATE_ODDS_KEY_ALREADY_CONFIGURED'});
  assert.equal(await fs.readFile(s.file,'utf8'),cipher);await fs.unlink(s.file);
  const otherCipher='b'.repeat(256);
  await assert.rejects(installOddsKey(s.root,{platform:'win32',run:async(script,input,options)=>{
    if(script===ODDS_KEY_DIALOG_SCRIPT){await fs.writeFile(s.file,otherCipher,{flag:'wx'});return JSON.stringify({ciphertext:cipher});}
    return mock()(script,input,options);
  }}),{code:'EEXIST'});
  assert.equal(await fs.readFile(s.file,'utf8'),otherCipher);assert.deepEqual(await fs.readdir(path.dirname(s.file)),['api-key.dpapi']);
});
test('cancelled, invalid or secret-containing dialog output leaves no file and only fixed diagnostics',async t=>{
  for(const response of ['{"cancelled":true}','{"invalid":true}','{SYNTHETIC_ODDSPAPI_TOKEN_ONLY',JSON.stringify({ciphertext:secret}),JSON.stringify({ciphertext:cipher,key:secret})]){
    const s=await setup(t);await assert.rejects(installOddsKey(s.root,{platform:'win32',run:async()=>response}),error=>!error.message.includes(secret));
    await assert.rejects(fs.stat(s.file),{code:'ENOENT'});
  }
  const s=await setup(t);await assert.rejects(installOddsKey(s.root,{platform:'win32',run:async()=>{throw new Error(secret);}}),{code:'PRIVATE_ODDS_KEY_DIALOG_FAILED'});
});
test('failed DPAPI and malformed pasted key never publish plaintext or silently retry',async t=>{
  for(const value of ['',secret+'\n',' '+secret,secret+'\u0000',secret+'\t']){
    const s=await setup(t);let calls=0;
    await assert.rejects(installOddsKey(s.root,{platform:'win32',run:async script=>{calls++;return script===ODDS_KEY_DIALOG_SCRIPT?JSON.stringify({ciphertext:cipher}):value;}}),{code:'PRIVATE_ODDS_KEY_FORMAT_INVALID'});
    assert.equal(calls,2);await assert.rejects(fs.stat(s.file),{code:'ENOENT'});
  }
  const s=await setup(t);await assert.rejects(installOddsKey(s.root,{platform:'win32',run:async script=>{
    if(script===ODDS_KEY_DIALOG_SCRIPT)return JSON.stringify({ciphertext:cipher});throw new Error(secret);
  }}),{code:'PRIVATE_ODDS_KEY_DECRYPT_FAILED'});
});
test('unattended missing or tampered key fails without window, plaintext logging or provider access',async t=>{
  const s=await setup(t);await assert.rejects(loadOddsKey(s.root,{platform:'win32',run:async()=>assert.fail()}),{code:'PRIVATE_ODDS_KEY_NOT_CONFIGURED'});
  await fs.mkdir(path.dirname(s.file),{recursive:true});await fs.writeFile(s.file,secret);
  await assert.rejects(inspectOddsKey(s.root,{platform:'win32',run:async()=>assert.fail()}),{code:'PRIVATE_ODDS_KEY_CIPHERTEXT_INVALID'});
  await fs.writeFile(s.file,cipher);await assert.rejects(inspectOddsKey(s.root,{platform:'win32',run:async()=>{throw new Error(secret);}}),error=>error.code==='PRIVATE_ODDS_KEY_DECRYPT_FAILED'&&!error.message.includes(secret));
  await fs.writeFile(s.file,'\uFEFF'+cipher+'\r\n');assert.equal(await loadOddsKey(s.root,{platform:'win32',run:mock()}),secret);
});
test('dialog is visible and pasteable; static scripts never contain pasted bytes, plaintext arguments or fetch',()=>{
  const gui=buildPowerShellRequest(ODDS_KEY_DIALOG_SCRIPT,{timeoutMs:300000,sta:true,showWindow:true}),reader=buildPowerShellRequest(ODDS_KEY_DECRYPT_SCRIPT);
  assert.equal(gui.options.windowsHide,false);assert.ok(gui.args.includes('-STA'));assert.equal(reader.options.windowsHide,true);
  assert.match(ODDS_KEY_DIALOG_SCRIPT,/UseSystemPasswordChar=\$true/);assert.match(ODDS_KEY_DIALOG_SCRIPT,/ShortcutsEnabled=\$true/);
  assert.match(ODDS_KEY_DIALOG_SCRIPT,/ConvertFrom-SecureString -SecureString \$secure/);assert.doesNotMatch(ODDS_KEY_DIALOG_SCRIPT,/-Key |Read-Host|Invoke-WebRequest|Invoke-RestMethod|api\.oddspapi/);
  assert.ok(!gui.args.join(' ').includes(secret));assert.match(ODDS_KEY_DECRYPT_SCRIPT,/ZeroFreeBSTR/);
});
test('key management requires Windows and refuses redirected private directory before showing dialog',async t=>{
  const s=await setup(t);await assert.rejects(installOddsKey(s.root,{platform:'linux',run:async()=>assert.fail()}),{code:'PRIVATE_ODDS_KEY_WINDOWS_REQUIRED'});
  await fs.mkdir(path.join(s.root,'.local'),{recursive:true});
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-key-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  await fs.symlink(outside,path.join(s.root,'.local/oddspapi'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(installOddsKey(s.root,{platform:'win32',run:async()=>assert.fail()}),{code:'PRIVATE_ODDS_KEY_PATH_INVALID'});
  const another=await setup(t);await fs.symlink(outside,path.join(another.root,'.local'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(installOddsKey(another.root,{platform:'win32',run:async()=>assert.fail()}),{code:'PRIVATE_ODDS_KEY_PATH_INVALID'});
  assert.deepEqual(await fs.readdir(outside),[]);
});
