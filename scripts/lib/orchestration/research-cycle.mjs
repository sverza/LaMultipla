import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {privateLock} from '../private/process-lock.mjs';
import {digest,readSnapshot,writeExclusive} from '../prospective/store.mjs';
import {validateManifest} from '../results-lab/quality.mjs';
import {metrics,truth} from '../goals/metrics.mjs';

export const RESEARCH_CYCLE_VERSION='research-cycle-dry-run-v1';
export const RESEARCH_STAGES=Object.freeze(['capture_local','quality','dataset_version','evaluate','review','refit_plan','next_ready']);
const instant=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const fail=code=>{throw Error(code);};
const optional=async file=>{try{return await readSnapshot(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const validGoals=v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=30);
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value;}

// This is an inert stage plugin for the existing Windows orchestrator. No network,
// trainer, provider, cloud or operating-system scheduler capability is accepted.
export function createResearchPlan(input,{now=new Date()}={}){
 const at=new Date(now).getTime();
 if(input?.schema!=='lamultipla-research-cycle-input-v1'||!Number.isFinite(at)||!['synthetic','local-only'].includes(input.mode))fail('RESEARCH_INPUT_INVALID');
 validateManifest(input.manifest);
 const observation=input.observation;
 if(!observation||!safeId(observation.sourceId)||!instant(observation.acquiredAtUtc)||Date.parse(observation.acquiredAtUtc)>at
  ||!Array.isArray(observation.rows)||observation.permission!=='LOCAL_REVIEW_ONLY'||typeof observation.license!=='string'||!observation.license.trim())fail('RESEARCH_OBSERVATION_INVALID');
 if(input.mode==='synthetic'&&(input.manifest.synthetic!==true||observation.synthetic!==true))fail('RESEARCH_SYNTHETIC_BINDING_REQUIRED');
 if(input.previousObservation&&(!instant(input.previousObservation.acquiredAtUtc)||Date.parse(input.previousObservation.acquiredAtUtc)>Date.parse(observation.acquiredAtUtc)
  ||input.previousObservation.sourceId!==observation.sourceId||!Array.isArray(input.previousObservation.rows)))fail('RESEARCH_HISTORY_INVALID');
 if(input.refitPolicy&&(!safeId(input.refitPolicy.id)||!['fixed','registered-refit'].includes(input.refitPolicy.kind)))fail('RESEARCH_REFIT_POLICY_INVALID');
 const immutable=clone(input);
 return {schema:'lamultipla-research-cycle-plan-v1',version:RESEARCH_CYCLE_VERSION,mode:input.mode,inputSha256:digest(immutable),input:immutable,
  stages:[...RESEARCH_STAGES],capabilities:{network:false,provider:false,cloud:false,forecast:false,training:false,promotion:false,scheduler:false},actualStakeEUR:0};
}

export function researchQuality(input,{now=new Date()}={}){
 const at=new Date(now).getTime(),events=new Map(input.manifest.events.map(e=>[e.fixtureId,e])),current=input.observation.rows,past=input.previousObservation?.rows??[];
 const issue=[],rows=[];
 for(const sourceRows of [current,past])for(const r of sourceRows){
  const e=events.get(r.fixtureId);
  if(!e||r.home!==e.home||r.away!==e.away||r.kickoffUtc!==e.kickoffUtc)issue.push({fixtureId:r.fixtureId??null,reason:'IDENTITY_OR_KICKOFF_MISMATCH'});
 }
 for(const e of input.manifest.events){
  const matching=current.filter(r=>r.fixtureId===e.fixtureId),previous=past.filter(r=>r.fixtureId===e.fixtureId),reasons=[];
  if(matching.length>1||previous.length>1)reasons.push('DUPLICATE_RESULT');
  if(previous.length&&!matching.length)reasons.push('PREVIOUS_RESULT_REMOVED');
  const r=matching[0],old=previous[0];
  if(r&&old&&old.status==='FINISHED'&&old.regularTime===true&&validGoals(old.goals)
   &&digest([r.status,r.regularTime,r.goals])!==digest([old.status,old.regularTime,old.goals]))reasons.push('SOURCE_REVISION_REQUIRES_REVIEW');
  if(!r)reasons.push('RESULT_MISSING');
  else{
   if(r.home!==e.home||r.away!==e.away||r.kickoffUtc!==e.kickoffUtc)reasons.push('IDENTITY_OR_KICKOFF_MISMATCH');
   if(r.status!=='FINISHED'||r.regularTime!==true||!validGoals(r.goals))reasons.push('REGULATION_RESULT_NOT_VERIFIED');
   if(!instant(r.observedAtUtc)||Date.parse(r.observedAtUtc)>Date.parse(input.observation.acquiredAtUtc)||Date.parse(r.observedAtUtc)<Date.parse(e.kickoffUtc))reasons.push('RESULT_OBSERVATION_TIME_INVALID');
  }
  rows.push({fixtureId:e.fixtureId,state:reasons.length?'PENDING_OR_WITHHELD':'LOCALLY_RECONCILED',reasons,...(!reasons.length?{goals:r.goals}:{})});
 }
 return {rows,issues:issue,blocked:issue.length>0||rows.some(r=>r.reasons.some(reason=>['DUPLICATE_RESULT','PREVIOUS_RESULT_REMOVED','SOURCE_REVISION_REQUIRES_REVIEW','IDENTITY_OR_KICKOFF_MISMATCH'].includes(reason))),
  acquisitionAgeHours:(at-Date.parse(input.observation.acquiredAtUtc))/3600000,sourceSha256:digest(input.observation),previousSourceSha256:input.previousObservation?digest(input.previousObservation):null,
  staleness:'AGE_REPORTED_NOT_PROOF_OF_CURRENT_SOURCE',originalSourceReplaced:false};
}

function probability(p,key){return key==='oneXTwo'?Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12:typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;}
export function evaluateResearchPairs(input,quality,{now=new Date()}={}){
 if(!input.forecasts)return {state:'NO_FORECASTS_SUPPLIED',models:[],markets:{},forecastCreated:false};
 // A real-data evaluator needs the separately approved source/cohort registration.
 if(input.mode!=='synthetic')return {state:'REAL_EVALUATION_REQUIRES_APPROVED_PROTOCOL',models:[],markets:{},forecastCreated:false};
 const forecast=input.forecasts,at=new Date(now).getTime(),models=forecast.models,entries=forecast.entries;
 if(!Array.isArray(models)||models.length<2||models.some(m=>!safeId(m.id)||!['reference','challenger','baseline'].includes(m.role)||!instant(m.registeredAtUtc))
  ||new Set(models.map(m=>m.id)).size!==models.length||models.filter(m=>m.role==='reference').length!==1||!models.some(m=>m.role==='baseline')
  ||!Array.isArray(entries)||new Set(entries.map(e=>e.fixtureId)).size!==entries.length)fail('RESEARCH_FORECAST_METADATA_INVALID');
 const events=new Map(input.manifest.events.map(e=>[e.fixtureId,e])),results=new Map(quality.rows.map(r=>[r.fixtureId,r])),excluded=[],records=[];
 for(const entry of entries){const event=events.get(entry.fixtureId);
  if(!event||!instant(entry.generatedAtUtc)||Date.parse(entry.generatedAtUtc)>=Date.parse(event.kickoffUtc)||Date.parse(entry.generatedAtUtc)>at
   ||models.some(m=>Date.parse(m.registeredAtUtc)>Date.parse(entry.generatedAtUtc)))fail('RESEARCH_RETROACTIVE_FORECAST_REFUSED');
  if(entry.home!==event.home||entry.away!==event.away||entry.kickoffUtc!==event.kickoffUtc||!entry.probabilities)fail('RESEARCH_FORECAST_IDENTITY_INVALID');
  for(const [id,p] of Object.entries(entry.probabilities))if(!models.some(m=>m.id===id)||!p||Object.entries(p).some(([key,v])=>!['oneXTwo','btts','over'].includes(key)||!probability(v,key)))fail('RESEARCH_PROBABILITY_INVALID');
 }
 for(const event of input.manifest.events){const entry=entries.find(e=>e.fixtureId===event.fixtureId),result=results.get(event.fixtureId);
  if(!entry){excluded.push({fixtureId:event.fixtureId,reason:'FORECAST_MISSING_NOT_RECREATED'});continue;}
  if(result.state!=='LOCALLY_RECONCILED'){excluded.push({fixtureId:event.fixtureId,reason:'RESULT_PENDING_OR_WITHHELD'});continue;}
  records.push({fixtureId:event.fixtureId,y:truth(result),...Object.fromEntries(models.map(m=>[m.id,entry.probabilities[m.id]??{}]))});
 }
 const reference=models.find(m=>m.role==='reference').id;
 const markets=Object.fromEntries(['oneXTwo','btts','over'].map(key=>{
  const paired=records.filter(r=>models.every(m=>probability(r[m.id][key],key))),scores=Object.fromEntries(models.map(m=>[m.id,metrics(paired,key,m.id)]));
  return [key,{n:paired.length,fixtureIds:paired.map(r=>r.fixtureId),scores,differenceFromReference:Object.fromEntries(models.filter(m=>m.id!==reference).map(m=>[m.id,paired.length?{logLoss:scores[m.id].logLoss-scores[reference].logLoss,brier:scores[m.id].brier-scores[reference].brier}:null]))}];
 }));
 return {state:'SYNTHETIC_DESCRIPTIVE_ONLY',models,markets,excluded,forecastCreated:false,modelUpdated:false,promotion:false,cohortEligible:false};
}

export function builtInResearchHandlers(){return {
 capture_local:({input})=>({sourceSha256:digest(input.observation),sourceId:input.observation.sourceId,acquiredAtUtc:input.observation.acquiredAtUtc,networkCalls:0}),
 quality:({input,now})=>researchQuality(input,{now}),
 dataset_version:({input,outputs})=>({state:'LOCAL_CANDIDATE_ONLY',sourceSha256:outputs.quality.sourceSha256,rows:outputs.quality.rows.filter(r=>r.state==='LOCALLY_RECONCILED'),
  datasetSha256:digest(outputs.quality.rows),trainingUpdated:false,protocolId:input.refitPolicy?.id??null}),
 evaluate:({input,outputs,now})=>evaluateResearchPairs(input,outputs.quality,{now}),
 review:({outputs})=>({state:'DESCRIPTIVE_REVIEW_ONLY',evaluationSha256:digest(outputs.evaluate),dataProblems:outputs.quality.rows.filter(r=>r.state!=='LOCALLY_RECONCILED'),
  hypotheses:[],negativeModelsRetained:true,automaticRetuning:false,promotion:false}),
 refit_plan:({input,outputs})=>({state:input.refitPolicy?.kind==='registered-refit'?'PREPARED_NOT_EXECUTED':'FIXED_MODEL_NO_REFIT',policyId:input.refitPolicy?.id??null,
  datasetSha256:outputs.dataset_version.datasetSha256,requiresApprovedProtocol:true,trainingExecuted:false}),
 next_ready:({input,outputs,now})=>({state:'DRY_RUN_COMPLETE_NOT_ACTIVATED',datasetSha256:outputs.dataset_version.datasetSha256,
  events:input.manifest.events.map(e=>({fixtureId:e.fixtureId,kickoffUtc:e.kickoffUtc,state:Date.parse(e.kickoffUtc)<=Date.parse(now)?'PAST_NO_RETROACTIVE_FORECAST':'FUTURE_REQUIRES_FREEZE_AUTHORIZATION'})),
  tasksActivated:false,deliveries:0,providerRequests:0})
};}

// Handlers are trusted LOCAL test adapters, not runtime module paths or API clients.
// Production integration must continue to use the existing round manager/ledger.
export async function researchCycleTick({directory,input,clock=()=>new Date(),handlers=builtInResearchHandlers(),resumeRetryable=false}){
 const now=new Date(clock()).toISOString(),plan=createResearchPlan(input,{now});
 if(typeof resumeRetryable!=='boolean')fail('RESEARCH_RETRY_FLAG_INVALID');
 if(RESEARCH_STAGES.some(stage=>typeof handlers[stage]!=='function')||Object.keys(handlers).some(stage=>!RESEARCH_STAGES.includes(stage)))fail('RESEARCH_HANDLER_SET_INVALID');
 plan.adapterIdentity={version:RESEARCH_CYCLE_VERSION,codeSha256:digest((await fs.readFile(fileURLToPath(import.meta.url),'utf8')).replace(/\r\n/g,'\n')),
  handlersSha256:digest(Object.fromEntries(RESEARCH_STAGES.map(stage=>[stage,Function.prototype.toString.call(handlers[stage])])))};
 const cycleId=digest(plan),cycleDirectory=path.join(directory,cycleId);
 return privateLock(directory,async()=>{
  const planFile=path.join(cycleDirectory,'plan.json'),existing=await optional(planFile);
  if(existing&&digest(existing)!==digest(plan))fail('RESEARCH_PLAN_CHANGED');
  if(!existing)await writeExclusive(planFile,plan);
  const outputs={};
  for(const stage of RESEARCH_STAGES){
   const stageDir=path.join(cycleDirectory,stage);let names=[];
   try{names=(await fs.readdir(stageDir)).filter(n=>/^\d{4}$/.test(n)).sort();}catch(e){if(e.code!=='ENOENT')throw e;}
   if(names.some((n,i)=>Number(n)!==i+1))fail('RESEARCH_ATTEMPT_HISTORY_GAP');
   let attempt=names.length+1;
   for(const name of names){
    const dir=path.join(stageDir,name),intent=await readSnapshot(path.join(dir,'intent.json')),outcome=await optional(path.join(dir,'outcome.json'));
    if(intent.cycleId!==cycleId||intent.stage!==stage||intent.inputSha256!==digest({input:plan.input,outputs}))fail('RESEARCH_CHECKPOINT_BINDING_INVALID');
    if(!outcome)return {state:'AMBIGUOUS_STAGE_REQUIRES_REVIEW',cycleId,stage,attempt:name,outputs,automaticRetry:false};
    if(outcome.intentSha256!==digest(intent))fail('RESEARCH_OUTCOME_BINDING_INVALID');
    if(outcome.state==='COMPLETE'){outputs[stage]=outcome.output;attempt=0;break;}
    if(outcome.state!=='LOCAL_FAILURE_RETRYABLE'||!resumeRetryable)return {state:outcome.state,cycleId,stage,outputs,automaticRetry:false};
   }
   if(!attempt){if(stage==='quality'&&outputs.quality.blocked)return {state:'SOURCE_CONFLICT_REQUIRES_REVIEW',cycleId,stage,outputs,automaticRetry:false};continue;}
   const dir=path.join(stageDir,String(attempt).padStart(4,'0')),intent={cycleId,stage,attempt,startedAtUtc:now,inputSha256:digest({input:plan.input,outputs}),mode:plan.mode,externalEffectsAllowed:false};
   await writeExclusive(path.join(dir,'intent.json'),intent);
   let output;
   try{output=await handlers[stage](freeze({input:clone(plan.input),outputs:clone(outputs),now}));if(output===undefined)fail('RESEARCH_HANDLER_OUTPUT_REQUIRED');}
   catch(error){
    if(error?.ambiguous===true)return {state:'AMBIGUOUS_STAGE_REQUIRES_REVIEW',cycleId,stage,outputs,automaticRetry:false};
    const state=error?.localRetryable===true?'LOCAL_FAILURE_RETRYABLE':'LOCAL_FAILURE_REQUIRES_REVIEW';
    await writeExclusive(path.join(dir,'outcome.json'),{state,intentSha256:digest(intent),finishedAtUtc:now,errorCode:state});
    return {state,cycleId,stage,outputs,automaticRetry:false};
   }
   await writeExclusive(path.join(dir,'outcome.json'),{state:'COMPLETE',intentSha256:digest(intent),finishedAtUtc:now,output});outputs[stage]=output;
   if(stage==='quality'&&output.blocked)return {state:'SOURCE_CONFLICT_REQUIRES_REVIEW',cycleId,stage,outputs,automaticRetry:false};
  }
  // Recovered QC checkpoints must also block before dataset/evaluation dispatch.
  if(outputs.quality.blocked)return {state:'SOURCE_CONFLICT_REQUIRES_REVIEW',cycleId,outputs,automaticRetry:false};
  return {state:'DRY_RUN_COMPLETE',cycleId,directory:cycleDirectory,outputs,automaticActionsActivated:false};
 });
}
