import path from 'node:path';
import {loadAnalysisPlan} from './analysis-plan.mjs';
import {analysisTick} from './analysis-workflow.mjs';
import {analysisAdapters} from './analysis-adapters.mjs';
import {deliveryPump} from './delivery-pump.mjs';
import {digest} from '../prospective/store.mjs';
import {saveJson} from '../private-store.mjs';

const reasons=new Set(['ANALYSIS_PLAN_INVALID','ANALYSIS_PRIVATE_INPUT_REQUIRED','ANALYSIS_SCHEDULE_INVALID',
  'ANALYSIS_CALENDAR_EVIDENCE_REQUIRED','ANALYSIS_PLAN_PIN_MISMATCH','ANALYSIS_STATE_INVALID',
  'ANALYSIS_CLOCK_ROLLBACK','ANALYSIS_CLOCK_OR_WINDOW_INVALID','ANALYSIS_RECEIPT_INVALID',
  'ANALYSIS_INTENT_INVALID','ANALYSIS_ADAPTER_REQUIRED']);
function reason(error,fallback){
  if(error?.code==='ENOENT')return 'PRIVATE_INPUT_MISSING';
  return reasons.has(error?.code)?error.code:reasons.has(error?.message)?error.message:fallback;
}
// The transport must run even if plan loading or replay validation rejects
// this analysis. Only analysisTick/shadow.mjs can produce a decision.
export async function analysisAndDeliveryTick({root,filename,expectedPlanSha256=null,clock=()=>new Date(),
  loadPlan=loadAnalysisPlan,runAnalysis=analysisTick,makeAdapters=analysisAdapters,pump=deliveryPump,saveState=saveJson}){
  let analysis,planSha256=null;
  try{
    const plan=await loadPlan(root,filename,{now:clock()});planSha256=digest(plan);
    if(expectedPlanSha256!==null&&(!/^[a-f0-9]{64}$/.test(expectedPlanSha256)||expectedPlanSha256!==planSha256))
      throw Object.assign(new Error('ANALYSIS_PLAN_PIN_MISMATCH'),{code:'ANALYSIS_PLAN_PIN_MISMATCH'});
    analysis=await runAnalysis({root,plan,adapters:makeAdapters(root,{clock}),clock});
  }catch(error){analysis={mode:'PRIVATE_ANALYSIS_WORKFLOW',state:'blocked',reason:reason(error,'ANALYSIS_RUN_REJECTED')};}
  let delivery;
  try{delivery=await pump({root,channel:'shadow',clock});}
  catch(error){delivery={state:'blocked',reason:reason(error,'PRIVATE_DELIVERY_RUN_REJECTED')};}
  const result={mode:'PRIVATE_ANALYSIS_AND_SHADOW_DELIVERY',analysis,delivery,actualStakeEUR:0,tasksRegistered:false};
  let diagnosticSaved=false;
  try{
    const at=new Date(clock());if(!Number.isFinite(at.getTime()))throw new Error();
    await saveState(path.join(root,'.local/orchestrator/runner-state.private.json'),{
      schema:'lamultipla-analysis-delivery-runner-state-v1',atUtc:at.toISOString(),planSha256,...result});
    diagnosticSaved=true;
  }catch{ /* A local diagnostic failure cannot suppress an already attempted delivery. */ }
  return {...result,diagnosticSaved};
}
