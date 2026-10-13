#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {ROOT} from './lib/private-store.mjs';
import {loadAnalysisPlan,privateInput} from './lib/orchestration/analysis-plan.mjs';
import {digest} from './lib/prospective/store.mjs';
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function windowsTaskXml({root,nodePath,userSid,startAtUtc=new Date().toISOString(),analysisPlan=null,planSha256=null}){
  for(const value of [root,nodePath])if(typeof value!=='string'||!/^[A-Za-z]:\\/.test(value)||/["\u0000-\u001f]/.test(value))throw new Error('Windows absolute paths required');
  if(!/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(userSid)||!Number.isFinite(Date.parse(startAtUtc))||new Date(startAtUtc).toISOString()!==startAtUtc)throw new Error('Windows identity/clock invalid');
  const script=root.replace(/\\$/,'')+'\\scripts\\windows-orchestrator.mjs';
  if((analysisPlan===null)!==(planSha256===null))throw new Error('Pinned analysis plan required');
  let args='"'+script+'" --once',description='LaMultipla private delivery pump only.',limit='PT4M';
  if(analysisPlan!==null){
    if(typeof analysisPlan!=='string'||!/^[A-Za-z]:\\/.test(analysisPlan)||/["\u0000-\u001f]/.test(analysisPlan)||!/^[a-f0-9]{64}$/.test(planSha256))throw new Error('Pinned analysis plan invalid');
    const relative=path.win32.relative(path.win32.join(root,'.local'),analysisPlan);
    if(!relative||relative.startsWith('..')||path.win32.isAbsolute(relative))throw new Error('Analysis plan must remain private');
    args='"'+script+'" --analysis-once "'+analysisPlan+'" --plan-sha256 '+planSha256;
    description='LaMultipla pinned private analysis and shadow delivery. No production publication.';limit='PT10M';
  }
  // COM receives Unicode BSTR: avoid a byte-encoding declaration at that boundary.
  return `<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>${description} Shadow, stake 0. Prepared disabled; activation requires explicit authorization.</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>${xml(userSid)}</UserId></LogonTrigger>
    <TimeTrigger><Enabled>true</Enabled><StartBoundary>${xml(startAtUtc)}</StartBoundary><Repetition><Interval>PT5M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition></TimeTrigger>
  </Triggers>
  <Principals><Principal id="CurrentUser"><UserId>${xml(userSid)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>false</Enabled><WakeToRun>false</WakeToRun><ExecutionTimeLimit>${limit}</ExecutionTimeLimit></Settings>
  <Actions Context="CurrentUser"><Exec><Command>${xml(nodePath)}</Command><Arguments>${xml(args)}</Arguments><WorkingDirectory>${xml(root)}</WorkingDirectory></Exec></Actions>
</Task>
`;
}
export async function prepareWindowsTask({root=ROOT,nodePath=process.execPath,userSid,startAtUtc=new Date().toISOString(),analysisPlan=null}={}){
  let planSha256=null;
  if(analysisPlan!==null){analysisPlan=await privateInput(root,analysisPlan);planSha256=digest(await loadAnalysisPlan(root,analysisPlan,{now:new Date(startAtUtc)}));}
  const text=windowsTaskXml({root,nodePath,userSid,startAtUtc,analysisPlan,planSha256}),directory=path.join(root,'.local/orchestrator/task-preparations',randomUUID());
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const filename=path.join(directory,analysisPlan===null?'private-delivery.disabled.xml':'private-analysis.disabled.xml');await fs.writeFile(filename,text,{flag:'wx',mode:0o600});
  const sha256=createHash('sha256').update(text).digest('hex');
  const result={purpose:analysisPlan===null?'PRIVATE_DELIVERY_TASK_PREPARATION_ONLY':'PRIVATE_ANALYSIS_TASK_PREPARATION_ONLY',file:filename,sha256,
    mode:analysisPlan===null?'PRIVATE_DELIVERY_PUMP_ONLY':'PRIVATE_ANALYSIS_AND_SHADOW_DELIVERY',analysisPlan,planSha256,
    taskName:analysisPlan===null?'LaMultipla private delivery shadow':'LaMultipla private analysis shadow',
    analysisEnginePrepared:analysisPlan!==null,analysisEngineEnabled:false,enabled:false,tasksRegistered:false,intervalMinutes:5,logonTriggerPrepared:true,executionTimeLimitMinutes:analysisPlan===null?4:10};
  await fs.writeFile(path.join(directory,'preparation.private.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  (async()=>{
    if(process.platform!=='win32'||!(process.argv.length===2||process.argv.length===4&&process.argv[2]==='--analysis-plan'))throw new Error('Preparazione consentita solo sul PC Windows; piano privato opzionale con --analysis-plan');
    const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{windowsHide:true,timeout:15000});
    return prepareWindowsTask({userSid:stdout.trim(),analysisPlan:process.argv[3]??null});
  })().then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error('Preparazione Windows non riuscita; nessun task registrato.');process.exitCode=1;});
}
