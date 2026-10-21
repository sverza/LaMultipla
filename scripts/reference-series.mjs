#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {readSnapshot} from './lib/prospective/store.mjs';
import {readRegistry} from './lib/shadow/registry.mjs';
import {referenceSeriesPreflight,freezeReferenceSeries} from './lib/reference-series.mjs';
const {values}=parseArgs({strict:true,options:{plan:{type:'string'},preflight:{type:'boolean'},'freeze-approved':{type:'boolean'},help:{type:'boolean'}}});
async function main(){if(values.help){console.log('--plan PRIVATE_ENVELOPE (--preflight | --freeze-approved). Requires explicit cohort+forecast approval and fresh complete calendar in first window. No provider, odds, decision or delivery.');return;}
 if(!values.plan||Boolean(values.preflight)===Boolean(values['freeze-approved']))throw Error('REFERENCE_SERIES_MODE_REQUIRED');
 const plan=await readSnapshot(await privateInput(ROOT,values.plan));if(plan.schema!=='lamultipla-reference-series-plan-v1')throw Error('REFERENCE_SERIES_PLAN_INVALID');
 const sealed=async key=>readSnapshot(await privateInput(ROOT,plan[key])),schedule=await loadJson(await privateInput(ROOT,plan.scheduleFile));
 const registry=await readRegistry(ROOT,await privateInput(ROOT,plan.studyV1File),loadJson);
 const input={root:ROOT,proposal:await sealed('proposalFile'),approval:await sealed('approvalFile'),calendar:await sealed('calendarFile'),dataset:await sealed('datasetFile'),study:await sealed('studyV2File'),registry,schedule};
 const result=values.preflight?await referenceSeriesPreflight(input):await freezeReferenceSeries(input);console.log(JSON.stringify(result,null,2));}
main().catch(()=>{console.error('Reference series blocked: verify explicit approval, original window, immutable inputs and calendar. No quote acquisition or delivery.');process.exitCode=1;});
