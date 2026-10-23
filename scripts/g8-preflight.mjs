#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {verifyEnvelope} from './lib/prospective/store.mjs';
import {prepareRoundDraft,assessReferenceData} from './lib/g8-preparation.mjs';
const {values}=parseArgs({strict:true,options:{public:{type:'string'},source:{type:'string'},dataset:{type:'string'},help:{type:'boolean'}}});
async function main(){if(values.help){console.log('--public PRIVATE_JSON --source PRIVATE_PROVENANCE --dataset PRIVATE_DATASET. Offline preparation only; no forecast, provider request, activation or writes.');return;}
 const read=async p=>{const v=await loadJson(await privateInput(ROOT,p));return v?.schema==='lamultipla-prospective-envelope-v1'?verifyEnvelope(v):v;};
 const publicData=await read(values.public),source=await read(values.source),dataset=await read(values.dataset);
 const draft=prepareRoundDraft({publicData,source,season:'2026/27',matchday:8});console.log(JSON.stringify({draft,reference:assessReferenceData(dataset,draft)},null,2));}
main().catch(()=>{console.error('G8 preflight blocked: verify private inputs and source provenance; no forecast executed');process.exitCode=1;});
