#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {verifyEnvelope} from './lib/prospective/store.mjs';
import {auditOriginalAvailability} from './lib/results-lab/quality.mjs';
const {values}=parseArgs({strict:true,options:{help:{type:'boolean'},'audit-cc0':{type:'boolean'},manifest:{type:'string'},observation:{type:'string'},previous:{type:'string',multiple:true}}});
async function main(){
 if(values.help){console.log('--audit-cc0 --manifest PRIVATE_FILE --observation PRIVATE_ENVELOPE [--previous PRIVATE_ENVELOPE]. Read-only local availability audit; no evaluation, network, source switching, writes or forecast.');return;}
 if(!values['audit-cc0']||!values.manifest||!values.observation)throw Error('RESULT_LAB_READONLY_INPUTS_REQUIRED');
 const read=async file=>{const v=await loadJson(await privateInput(ROOT,file));return v?.schema==='lamultipla-prospective-envelope-v1'?verifyEnvelope(v):v;};
 const manifest=await read(values.manifest),observation=await read(values.observation),previous=await Promise.all((values.previous??[]).map(read));
 console.log(JSON.stringify(auditOriginalAvailability(manifest.manifest??manifest,observation,{previous}),null,2));
}
main().catch(()=>{console.error('Results lab input invalid or unavailable; private details withheld');process.exitCode=1;});
