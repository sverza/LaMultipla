import path from 'node:path';
import {loadRoundPackage,roundPreflight,freezeRoundApproved,verifyFrozenRound} from './lib/reference-odds/round-freeze.mjs';
const args=process.argv.slice(2),allowed=new Set(['--plan','--approval','--evidence','--inspect','--preflight','--freeze-approved','--verify']);
const values={};for(let i=0;i<args.length;i++){const k=args[i];if(!allowed.has(k)||Object.hasOwn(values,k))throw Error('REFERENCE_ROUND_ARGUMENT_INVALID');
 values[k]=['--plan','--approval','--evidence'].includes(k)?args[++i]:true;}
if(!values['--plan']||['--inspect','--preflight','--freeze-approved','--verify'].filter(k=>values[k]).length!==1)throw Error('ONE_EXPLICIT_ROUND_OPERATION_REQUIRED');
const root=path.resolve('.'),plan=values['--plan'];
try{
 let result;
 if(values['--inspect']){const loaded=await loadRoundPackage(root,plan);result={status:'PACKAGE_VERIFIED_FREEZE_NOT_AUTHORIZED',scope:loaded.plan.scope,
  window:loaded.plan.window,packageReference:loaded.planReference,readOnly:true,providerRequests:0,forecastExecuted:false};}
 else if(values['--verify']){const r=await verifyFrozenRound(root,plan);result={status:r.status,receiptReference:r.receiptReference??null,receiptSha256:r.receiptSha256??null,
  completedAtUtc:r.completedAtUtc??null,readOnly:true,providerRequests:0,forecastExecuted:false};}
 else if(values['--preflight']){const r=await roundPreflight(root,plan,{approvalFile:values['--approval'],evidenceFile:values['--evidence']});
  result={status:'READY',scope:r.plan.scope,window:r.plan.window,readOnly:true,providerRequests:0,forecastExecuted:false};}
 else result=await freezeRoundApproved(root,plan,{approvalFile:values['--approval'],evidenceFile:values['--evidence']});
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error(JSON.stringify({status:'STOP',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'REFERENCE_ROUND_VALIDATION_FAILED',forecastSuccess:false}));process.exitCode=1;}
