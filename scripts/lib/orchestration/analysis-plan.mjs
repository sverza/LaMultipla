import fs from 'node:fs/promises';
import path from 'node:path';
import {loadJson} from '../private-store.mjs';
import {digest} from '../prospective/store.mjs';
import {validateCycleSchedule} from '../shadow/pipeline.mjs';
import {assertFutureRound} from '../decision/policy.mjs';

export async function privateInput(root,filename){
  if(typeof filename!=='string'||!filename)throw new Error('ANALYSIS_PRIVATE_INPUT_REQUIRED');
  const base=await fs.realpath(path.join(root,'.local')),resolved=await fs.realpath(path.resolve(root,filename));
  const relative=path.relative(base,resolved);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('ANALYSIS_PRIVATE_INPUT_REQUIRED');
  return resolved;
}
export function analysisWindow(schedule){
  const first=Math.min(...schedule.events.map(e=>Date.parse(e.kickoffUtc)));
  return {firstKickoffUtc:new Date(first).toISOString(),opensAtUtc:new Date(first-60*60000).toISOString(),
    closesAtUtc:new Date(first-5*60000).toISOString()};
}
export function validateAnalysisSchedule(schedule,now){
  assertFutureRound(schedule);
  const times=schedule?.events?.map(e=>Date.parse(e.kickoffUtc))??[];
  if(times.length!==10||times.some(t=>!Number.isFinite(t)))throw new Error('ANALYSIS_SCHEDULE_INVALID');
  const round={season:schedule.season,matchday:schedule.matchday,fixtureIds:schedule.events.map(e=>e.fixtureId),
    fromUtc:new Date(Math.min(...times)).toISOString(),toUtc:new Date(Math.max(...times)+1).toISOString()};
  // Structural check at a pre-kickoff clock; the live deadline is enforced by
  // the workflow, also when resuming an existing frozen decision after kickoff.
  validateCycleSchedule(round,schedule,new Date(Math.min(...times)-6*60000));
  const s=schedule.source,at=new Date(now).getTime();
  const official=u=>{try{const v=new URL(u);return v.protocol==='https:'&&!v.username&&!v.password&&!v.port
    &&![...v.searchParams.keys()].some(k=>/token|key|password|auth/i.test(k))
    &&(v.hostname==='legaseriea.it'||v.hostname.endsWith('.legaseriea.it'));}catch{return false;}};
  if(!s||!official(s.officialUrl)||!official(s.officialPdfUrl)
    ||!Number.isFinite(Date.parse(s.confirmedAtUtc))||Date.parse(s.confirmedAtUtc)>at
    ||!Number.isFinite(Date.parse(s.providerObservedAtUtc))||Date.parse(s.providerObservedAtUtc)>at
    ||!/^[a-f0-9]{64}$/.test(s.providerFixturesSha256))throw new Error('ANALYSIS_CALENDAR_EVIDENCE_REQUIRED');
  return round;
}
export async function loadAnalysisPlan(root,filename,{now=new Date()}={}){
  const input=await loadJson(await privateInput(root,filename));
  const allowed=['schema','scheduleFile','studyFile','contextFile','contextEvidenceFile','assessmentFile','combinedPricesFile','maxLegs'];
  if(input?.schema!=='lamultipla-private-analysis-plan-v1'||Object.keys(input).some(k=>!allowed.includes(k))
    ||input.contextFile&&input.contextEvidenceFile||input.maxLegs!==undefined&&![2,3,4,5,6].includes(input.maxLegs))throw new Error('ANALYSIS_PLAN_INVALID');
  const inputs={};
  for(const key of allowed.filter(k=>k.endsWith('File'))){
    if(input[key]){const file=await privateInput(root,input[key]);inputs[key]={file,value:await loadJson(file)};}
  }
  if(!inputs.scheduleFile||!inputs.studyFile)throw new Error('ANALYSIS_PLAN_INVALID');
  const schedule=inputs.scheduleFile.value,round=validateAnalysisSchedule(schedule,now);
  // Paths and exact bytes of all admitted inputs are pinned in the private
  // plan receipt. A changed review/schedule cannot silently replace a run.
  return {schema:input.schema,round,schedule,inputs,maxLegs:input.maxLegs??4,window:analysisWindow(schedule),
    inputHashes:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,digest(v.value)]))};
}
