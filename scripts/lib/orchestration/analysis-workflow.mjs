import path from 'node:path';
import {privateLock} from '../private/outbox.mjs';
import {optionalJson,saveJson} from '../private-store.mjs';
import {digest,readSnapshot,writeExclusive} from '../prospective/store.mjs';
import {assertFutureRound} from '../decision/policy.mjs';

export const ANALYSIS_STAGES=Object.freeze(['dataset','forecast','quotes','decision','package','queue']);
async function optionalSnapshot(file){try{return await readSnapshot(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function exclusiveSame(file,value){try{await writeExclusive(file,value);}catch(e){
  if(e.code!=='EEXIST'||digest(await readSnapshot(file))!==digest(value))throw e;
}}
// This coordinates existing producers; it never chooses bets or modifies a
// probability. Only the shadow CLI adapter may produce the final decision.
export async function analysisTick({root,plan,adapters,clock=()=>new Date(),afterReceipt=async()=>{}}){
  assertFutureRound(plan.round);
  const directory=path.join(root,'.local/orchestrator/analysis',`${plan.round.season.replace('/','-')}-round-${String(plan.round.matchday).padStart(2,'0')}`);
  return privateLock(directory,async()=>{
    const at=new Date(clock()),now=at.getTime(),planSha256=digest(plan);
    if(!Number.isFinite(now)||!Number.isFinite(Date.parse(plan.window?.opensAtUtc))||!Number.isFinite(Date.parse(plan.window?.closesAtUtc))
      ||Date.parse(plan.window.opensAtUtc)>=Date.parse(plan.window.closesAtUtc))throw new Error('ANALYSIS_CLOCK_OR_WINDOW_INVALID');
    await exclusiveSame(path.join(directory,'plan.json'),plan);
    const stateFile=path.join(directory,'state.private.json');
    let state=await optionalJson(stateFile)??{schema:'lamultipla-analysis-state-v1',planSha256,lastObservedAtUtc:null,nextAttemptAtUtc:null,failures:0};
    if(state.schema!=='lamultipla-analysis-state-v1'||state.planSha256!==planSha256
      ||!Number.isInteger(state.failures)||state.failures<0||state.failures>1000000
      ||[state.lastObservedAtUtc,state.nextAttemptAtUtc].some(t=>t!==null&&!Number.isFinite(Date.parse(t))))throw new Error('ANALYSIS_STATE_INVALID');
    if(state.lastObservedAtUtc&&now<Date.parse(state.lastObservedAtUtc))throw new Error('ANALYSIS_CLOCK_ROLLBACK');
    const report=async(status,stage,nextAttemptAtUtc=null,reason=null)=>{
      const observed=new Date(clock());if(!Number.isFinite(observed.getTime())||observed<at)throw new Error('ANALYSIS_CLOCK_ROLLBACK');
      state={...state,lastObservedAtUtc:observed.toISOString(),nextAttemptAtUtc,status,stage,reason};
      await saveJson(stateFile,state);
      return {mode:'PRIVATE_ANALYSIS_WORKFLOW',state:status,stage,reason,nextAttemptAtUtc,actualStakeEUR:0,tasksRegistered:false};
    };
    if(now<Date.parse(plan.window.opensAtUtc))return report('waiting_window',null,plan.window.opensAtUtc);
    if(state.nextAttemptAtUtc&&now<Date.parse(state.nextAttemptAtUtc))return report('backoff',state.stage,state.nextAttemptAtUtc,state.reason);
    const results={};let inputSha256=planSha256;
    for(const stage of ANALYSIS_STAGES){
      const adapter=adapters[stage];if(!adapter?.run||!adapter?.validate)throw new Error('ANALYSIS_ADAPTER_REQUIRED');
      const file=path.join(directory,'receipts',stage+'.json'),intentFile=path.join(directory,'intents',stage+'.json');
      let receipt=await optionalSnapshot(file);
      if(receipt){
        if(receipt.schema!=='lamultipla-analysis-stage-receipt-v1'||receipt.planSha256!==planSha256||receipt.stage!==stage||receipt.inputSha256!==inputSha256
          ||!Number.isFinite(Date.parse(receipt.completedAtUtc))||Date.parse(receipt.completedAtUtc)>new Date(clock()).getTime())throw new Error('ANALYSIS_RECEIPT_INVALID');
        await adapter.validate(receipt.result,{plan,results,now:new Date(clock())});
        results[stage]=receipt.result;inputSha256=digest(receipt);continue;
      }
      let intent=await optionalSnapshot(intentFile);
      if(intent&&(intent.planSha256!==planSha256||intent.inputSha256!==inputSha256||intent.stage!==stage
        ||!Number.isFinite(Date.parse(intent.startedAtUtc))))throw new Error('ANALYSIS_INTENT_INVALID');
      const context={root,directory,plan,results,now:new Date(clock()),intent};
      // Recover committed outputs before checking deadlines. Recovery never
      // retimes or reruns a forecast/paid acquisition/final decision.
      let result=intent&&adapter.recover?await adapter.recover(context):null;
      if(result==null){
        if(stage==='quotes'&&intent)return report('review_required',stage,null,'QUOTE_ATTEMPT_INTERRUPTED');
        if(['dataset','forecast','quotes'].includes(stage)&&new Date(clock()).getTime()>=Date.parse(plan.window.closesAtUtc))
          return report('deadline_missed',stage,null,'NO_RETROSPECTIVE_FORECAST_OR_ACQUISITION');
        try{
          if(adapter.before)await adapter.before(context);
          if(!intent){intent={schema:'lamultipla-analysis-stage-intent-v1',planSha256,stage,inputSha256,startedAtUtc:new Date(clock()).toISOString()};
            await writeExclusive(intentFile,intent);context.intent=intent;}
          result=await adapter.run(context);
        }catch(error){
          const reason=/^(?:ANALYSIS_[A-Z_]+|QUOTE_[A-Z_]+|PRIVATE_[A-Z_]+)$/.test(error.code??'')?error.code:'ANALYSIS_STAGE_FAILED';
          if(stage==='quotes'&&intent||reason==='PRIVATE_QUEUE_PACKAGE_EXPIRED')return report('review_required',stage,null,reason);
          state.failures=Math.min(state.failures+1,1000000);
          return report('retry_required',stage,new Date(new Date(clock()).getTime()+Math.min(60,5*2**Math.min(state.failures-1,4))*60000).toISOString(),reason);
        }
      }
      await adapter.validate(result,{plan,results,now:new Date(clock())});
      receipt={schema:'lamultipla-analysis-stage-receipt-v1',planSha256,stage,inputSha256,result,
        startedAtUtc:intent.startedAtUtc,completedAtUtc:new Date(clock()).toISOString()};
      await writeExclusive(file,receipt);await afterReceipt(stage);
      results[stage]=result;inputSha256=digest(receipt);state.failures=0;
    }
    return report('queued','queue');
  });
}
