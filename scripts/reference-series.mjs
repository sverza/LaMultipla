#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {readSnapshot} from './lib/prospective/store.mjs';
import {referenceSeriesPreflight,freezeReferenceSeries,verifyReferenceReceipt} from './lib/reference-series.mjs';
import {loadReferencePlan,inspectReferenceReadiness,assembleReferenceSchedule,writeReferencePlan} from './lib/reference-readiness.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const modes=['inspect','verify','assemble','preflight','freeze-approved'];
const {values}=parseArgs({strict:true,options:{plan:{type:'string'},inspect:{type:'boolean'},verify:{type:'boolean'},assemble:{type:'boolean'},preflight:{type:'boolean'},'freeze-approved':{type:'boolean'},calendar:{type:'string'},official:{type:'string'},approval:{type:'string'},out:{type:'string'},help:{type:'boolean'}}});
async function main(){if(values.help){console.log('--plan PRIVATE_ENVELOPE (--inspect | --preflight | --freeze-approved); --verify is read-only and requires no plan. --assemble --plan TEMPLATE --official PRIVATE_EVIDENCE --approval PRIVATE_APPROVAL --out PRIVATE_DIRECTORY [--calendar PRIVATE_SNAPSHOT]. Assembly reads latest existing calendar cache when omitted; never acquires data. Freeze requires explicit cohort+forecast approval and first window. No odds, decision or delivery.');return;}
 if(modes.filter(m=>values[m]).length!==1||!values.assemble&&['calendar','official','approval','out'].some(k=>values[k]))throw Error('REFERENCE_SERIES_MODE_REQUIRED');
 if(values.verify){if(values.plan)throw Error('REFERENCE_SERIES_MODE_REQUIRED');return verifyReferenceReceipt(ROOT);}
 if(!values.plan)throw Error('REFERENCE_SERIES_MODE_REQUIRED');
 const {plan,input}=await loadReferencePlan(ROOT,values.plan,{allowDraft:Boolean(values.inspect||values.assemble)});
 if(values.inspect)return inspectReferenceReadiness(input);
 if(values.assemble){
  if(!values.official||!values.approval||!values.out)throw Error('REFERENCE_ASSEMBLY_INPUTS_REQUIRED');
  let calendarFile=values.calendar;
  if(!calendarFile){const state=await loadJson(await privateInput(ROOT,'.local/oddspapi/calendar-state.private.json'));
   if(state.schema!=='lamultipla-private-calendar-state-v1'||state.pendingId||!/^[a-f0-9]{64}$/.test(state.latestId))throw Error('REFERENCE_EXISTING_CALENDAR_REQUIRED');
   calendarFile=path.join('.local/oddspapi/calendar-acquisitions',state.latestId,'snapshot.json');}
  input.calendar=await readSnapshot(await privateInput(ROOT,calendarFile));input.approval=await readSnapshot(await privateInput(ROOT,values.approval));
  const official=await readSnapshot(await privateInput(ROOT,values.official)),documentBytes=await fs.readFile(await privateInput(ROOT,official.documentFile));
  const schedule=await assembleReferenceSchedule({proposal:input.proposal,calendar:input.calendar,official,documentBytes});
  const paths=Object.fromEntries(['proposalFile','studyV1File','studyV2File','datasetFile'].map(k=>[k,plan[k]]));
  return writeReferencePlan({root:ROOT,out:values.out,input,schedule,paths:{...paths,approvalFile:values.approval,calendarFile}});
 }
 return values.preflight?referenceSeriesPreflight(input):freezeReferenceSeries(input);
}
main().then(result=>{if(result)console.log(JSON.stringify(result,null,2));if(result?.state==='BLOCKED')process.exitCode=1;}).catch(error=>{
 console.error(/^REFERENCE_[A-Z_]+$/.test(error.message)?error.message:'REFERENCE_INPUT_INTEGRITY_OR_EVIDENCE_REQUIRED');process.exitCode=1;});
