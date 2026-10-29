import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {privateLock} from '../private/outbox.mjs';
import {loadJson,saveJson} from '../private-store.mjs';
import {digest,readSnapshot,writeExclusive} from '../prospective/store.mjs';
import {privateChannelPaths} from '../private/channels.mjs';
const execute=promisify(execFile),validCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000;
async function optional(filename){try{return await loadJson(filename);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function flushPrivateCli(root,channel='synthetic_shadow'){
  privateChannelPaths(root,channel);
  // Credentials remain in the existing DPAPI adapter. Never echo child output
  // on failure, nor put tokens or keys into argv/environment/logs.
  let output;try{output=await execute(process.execPath,[path.join(root,'scripts/private-delivery.mjs'),'--flush',...(channel==='shadow'?['--channel','shadow']:[])],
    {cwd:root,windowsHide:true,timeout:120000,maxBuffer:256*1024});}catch(error){
    const http=String(error.stderr??'').match(/\bHTTP ([45][0-9]{2})\b/),failure=new Error('PRIVATE_FLUSH_FAILED');
    failure.code=error.killed?'PRIVATE_FLUSH_TIMEOUT':http?'HTTP_'+http[1]:'PRIVATE_FLUSH_EXIT';throw failure;
  }
  let result;try{result=JSON.parse(output.stdout);}catch{throw new Error('PRIVATE_FLUSH_INVALID');}
  if(!validCount(result.acknowledged)||!validCount(result.pending)||!Array.isArray(result.results)||result.jobsEnabled!==false)throw new Error('PRIVATE_FLUSH_INVALID');
  return {acknowledged:result.acknowledged,pending:result.pending,notifications:result.notifications==='configured'?'configured':'not_configured'};
}
export async function deliveryPump({root,channel='synthetic_shadow',clock=()=>new Date(),flush=()=>flushPrivateCli(root,channel),afterReceipt=async()=>{}}){
  const paths=privateChannelPaths(root,channel),directory=paths.orchestration,outbox=paths.outbox;
  return privateLock(directory,async()=>{
    const now=new Date(clock()),at=now.getTime();if(!Number.isFinite(at))throw new Error('ORCHESTRATOR_CLOCK_INVALID');
    const statePath=path.join(directory,'delivery-state.private.json');
    const state=await optional(statePath)??{schema:'lamultipla-delivery-pump-state-v1',acknowledged:0,failures:0,lastObservedAtUtc:null,nextAttemptAtUtc:null,inFlight:false};
    if(state.schema!=='lamultipla-delivery-pump-state-v1'||!validCount(state.acknowledged)||!Number.isInteger(state.failures)||state.failures<0||state.failures>1000000
      ||typeof state.inFlight!=='boolean'||[state.lastObservedAtUtc,state.nextAttemptAtUtc].some(t=>t!==null&&!Number.isFinite(Date.parse(t))))throw new Error('ORCHESTRATOR_STATE_INVALID');
    if(state.lastObservedAtUtc&&at<Date.parse(state.lastObservedAtUtc))throw new Error('ORCHESTRATOR_CLOCK_ROLLBACK');
    let names=[];try{names=(await fs.readdir(outbox)).filter(n=>/^\d{12}\.json$/.test(n)).sort();}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!names.length){if(state.acknowledged)throw new Error('ORCHESTRATOR_OUTBOX_ROLLBACK');return {state:'idle',acknowledged:0,pending:0,networkAttempted:false};}
    if(names.some((n,i)=>Number(n.slice(0,12))!==i+1))throw new Error('ORCHESTRATOR_OUTBOX_GAP');
    const tip=await readSnapshot(path.join(outbox,names.at(-1))),tipHash=digest(tip),sequence=names.length;
    if(sequence<state.acknowledged)throw new Error('ORCHESTRATOR_OUTBOX_ROLLBACK');
    const receiptPath=path.join(directory,'receipts',tipHash+'.json');let receipt;
    try{receipt=await readSnapshot(receiptPath);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(receipt){
      if(receipt.schema!=='lamultipla-delivery-pump-receipt-v1'||receipt.tipHash!==tipHash||receipt.sequence!==sequence||receipt.acknowledged!==sequence
        ||!Number.isFinite(Date.parse(receipt.confirmedAtUtc))||Date.parse(receipt.confirmedAtUtc)>at)throw new Error('ORCHESTRATOR_RECEIPT_INVALID');
      // Receipt is written before mutable state; repair after a crash between them.
      await saveJson(statePath,{...state,acknowledged:sequence,failures:0,lastObservedAtUtc:now.toISOString(),nextAttemptAtUtc:null,inFlight:false,lastFailure:null});
      return {state:'acknowledged',acknowledged:sequence,pending:0,networkAttempted:false};
    }
    if(state.acknowledged===sequence)throw new Error('ORCHESTRATOR_RECEIPT_MISSING');
    if(!state.inFlight&&state.nextAttemptAtUtc&&at<Date.parse(state.nextAttemptAtUtc))return {state:'backoff',acknowledged:state.acknowledged,pending:sequence-state.acknowledged,networkAttempted:false,nextAttemptAtUtc:state.nextAttemptAtUtc};
    const intent={...state,lastObservedAtUtc:now.toISOString(),inFlight:true};await saveJson(statePath,intent);
    try{
      const result=await flush();
      if(!validCount(result.acknowledged)||!validCount(result.pending)||result.acknowledged<state.acknowledged||result.acknowledged>sequence
        ||result.pending!==sequence-result.acknowledged)throw new Error('PRIVATE_FLUSH_INVALID');
      const completed=new Date(clock());if(!Number.isFinite(completed.getTime())||completed<now)throw new Error('ORCHESTRATOR_CLOCK_ROLLBACK');
      const pending=result.pending>0,nextAttemptAtUtc=pending?new Date(completed.getTime()+5*60000).toISOString():null;
      if(!pending){await writeExclusive(receiptPath,{schema:'lamultipla-delivery-pump-receipt-v1',tipHash,sequence,acknowledged:sequence,confirmedAtUtc:completed.toISOString()});await afterReceipt();}
      await saveJson(statePath,{...intent,acknowledged:result.acknowledged,failures:0,inFlight:false,lastObservedAtUtc:completed.toISOString(),nextAttemptAtUtc,lastFailure:null});
      return {state:pending?'waiting_ack':'acknowledged',...result,networkAttempted:true,nextAttemptAtUtc};
    }catch(error){
      const failureCode=/^(?:HTTP_[45][0-9]{2}|PRIVATE_FLUSH_TIMEOUT|PRIVATE_FLUSH_EXIT)$/.test(error.code??'')?error.code:'PRIVATE_DELIVERY_RETRY_REQUIRED';
      const failures=Math.min(state.failures+1,1000000),failed=new Date(clock()),nextAttemptAtUtc=new Date(Math.max(at,failed.getTime())+Math.min(30,5*2**Math.min(failures-1,3))*60000).toISOString();
      await saveJson(statePath,{...intent,inFlight:false,failures,lastObservedAtUtc:new Date(Math.max(at,failed.getTime())).toISOString(),nextAttemptAtUtc,lastFailure:failureCode});
      return {state:'retry_required',lastFailure:failureCode,acknowledged:state.acknowledged,pending:sequence-state.acknowledged,networkAttempted:true,nextAttemptAtUtc};
    }
  });
}
