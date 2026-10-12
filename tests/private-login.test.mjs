// Synthetic credential adapters only. Never opens a real window or calls Firebase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readWindowsLogin,WINDOWS_LOGIN_SCRIPT} from '../scripts/lib/private/windows-login.mjs';
import {promptPrivateLogin} from '../scripts/lib/private/login-prompt.mjs';
test('Windows login preserves pasted password bytes including spaces, Unicode and quotes; trims only email',async()=>{
  const password='  SYNTHETIC "à!$`" pasted secret  ',email='  pc@example.invalid  ';
  const credentials=await readWindowsLogin({run:async(script,input,options)=>{
    assert.equal(script,WINDOWS_LOGIN_SCRIPT);assert.equal(input,'');assert.deepEqual(options,{timeoutMs:300000,sta:true});
    assert.ok(!script.includes(password));return JSON.stringify({email,password});
  }});
  assert.deepEqual(credentials,{email:email.trim(),password});
});
test('cancel, empty or malformed dialog response never authenticates and does not echo response',async()=>{
  for(const data of [{cancelled:true},{email:'pc@example.invalid',password:''},{email:'bad',password:'SYNTHETIC_SECRET'},
    {email:'pc@example.invalid',password:'SYNTHETIC_SECRET',extra:true},null]){
    let calls=0;await assert.rejects(promptPrivateLogin({signIn:async()=>calls++},{platform:'win32',announce:()=>{},
      windowsPrompt:()=>readWindowsLogin({run:async()=>JSON.stringify(data)})}),error=>!error.message.includes('SYNTHETIC_SECRET'));
    assert.equal(calls,0);
  }
  await assert.rejects(readWindowsLogin({run:async()=>'{SYNTHETIC_SECRET'}),/non disponibile/);
  await assert.rejects(readWindowsLogin({run:async()=>{throw new Error('SYNTHETIC_SECRET');}}),error=>!error.message.includes('SYNTHETIC_SECRET'));
});
test('Windows prompt does not require terminal paste handling; no credentials in notices or returned result',async()=>{
  const credentials={email:'pc@example.invalid',password:'SYNTHETIC_SECRET'},notices=[],calls=[];
  const result=await promptPrivateLogin({signIn:async(...values)=>calls.push(values)},
    {platform:'win32',windowsPrompt:async()=>credentials,announce:message=>notices.push(message)});
  assert.deepEqual(calls,[['pc@example.invalid','SYNTHETIC_SECRET']]);assert.deepEqual(result,{authenticated:true,passwordStored:false});
  assert.deepEqual(credentials,{email:'',password:''});assert.equal(notices.length,1);assert.ok(!notices[0].includes('SYNTHETIC_SECRET'));
});
test('failed sign-in clears transient credentials and does not silently retry or fall back to console',async()=>{
  const credentials={email:'pc@example.invalid',password:'SYNTHETIC_SECRET'};let calls=0;
  await assert.rejects(promptPrivateLogin({signIn:async()=>{calls++;throw new Error('SYNTHETIC_AUTH_FAILURE');}},
    {platform:'win32',windowsPrompt:async()=>credentials,announce:()=>{}}),/SYNTHETIC_AUTH_FAILURE/);
  assert.equal(calls,1);assert.deepEqual(credentials,{email:'',password:''});
});
