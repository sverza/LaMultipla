#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {ROOT} from './lib/private-store.mjs';
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function windowsTaskXml({root,nodePath,userSid,startAtUtc=new Date().toISOString()}){
  for(const value of [root,nodePath])if(typeof value!=='string'||!/^[A-Za-z]:\\/.test(value)||/["\u0000-\u001f]/.test(value))throw new Error('Windows absolute paths required');
  if(!/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(userSid)||!Number.isFinite(Date.parse(startAtUtc))||new Date(startAtUtc).toISOString()!==startAtUtc)throw new Error('Windows identity/clock invalid');
  const script=root.replace(/\\$/,'')+'\\scripts\\windows-orchestrator.mjs';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>LaMultipla private delivery pump only. Shadow, stake 0. Prepared disabled; activation requires explicit authorization.</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>${xml(userSid)}</UserId></LogonTrigger>
    <TimeTrigger><Enabled>true</Enabled><StartBoundary>${xml(startAtUtc)}</StartBoundary><Repetition><Interval>PT5M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition></TimeTrigger>
  </Triggers>
  <Principals><Principal id="CurrentUser"><UserId>${xml(userSid)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>false</Enabled><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT4M</ExecutionTimeLimit></Settings>
  <Actions Context="CurrentUser"><Exec><Command>${xml(nodePath)}</Command><Arguments>${xml('"'+script+'" --once')}</Arguments><WorkingDirectory>${xml(root)}</WorkingDirectory></Exec></Actions>
</Task>
`;
}
export async function prepareWindowsTask({root=ROOT,nodePath=process.execPath,userSid,startAtUtc=new Date().toISOString()}={}){
  const text=windowsTaskXml({root,nodePath,userSid,startAtUtc}),directory=path.join(root,'.local/orchestrator/task-preparations',randomUUID());
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const filename=path.join(directory,'private-delivery.disabled.xml');await fs.writeFile(filename,text,{flag:'wx',mode:0o600});
  const sha256=createHash('sha256').update(text).digest('hex');
  const result={purpose:'PRIVATE_DELIVERY_TASK_PREPARATION_ONLY',file:filename,sha256,mode:'PRIVATE_DELIVERY_PUMP_ONLY',analysisEngineEnabled:false,enabled:false,tasksRegistered:false,intervalMinutes:5,logonTriggerPrepared:true};
  await fs.writeFile(path.join(directory,'preparation.private.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  (async()=>{
    if(process.platform!=='win32'||process.argv.length!==2)throw new Error('Preparazione consentita solo sul PC Windows, senza argomenti');
    const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{windowsHide:true,timeout:15000});
    return prepareWindowsTask({userSid:stdout.trim()});
  })().then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error('Preparazione Windows non riuscita; nessun task registrato.');process.exitCode=1;});
}
