#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {ROOT} from './lib/private-store.mjs';
import {loadFrozenReference,loadScreenFiles,runReferenceScreen,referenceQuotePlan} from './lib/reference-screen.mjs';
const {values}=parseArgs({strict:true,options:{help:{type:'boolean'},plan:{type:'string'},report:{type:'string'},assessment:{type:'string'},
 context:{type:'string'},'context-evidence':{type:'string'},'combined-prices':{type:'string'},attempt:{type:'string'},
 'quote-plan':{type:'boolean'},'latest-report':{type:'boolean'}}});
async function main(){
 if(values.help){console.log('Offline only: --plan PRIVATE_REFERENCE_PLAN (--quote-plan | --attempt 0001 [--report PRIVATE_REPORT | --latest-report] [--assessment FILE] [--context SNAPSHOT | --context-evidence FILE] [--combined-prices FILE]). No API, forecast, queue or delivery. Missing report produces an incomplete update.');return;}
 if(!values.plan||!values['quote-plan']&&!values.attempt||values['quote-plan']&&Object.keys(values).some(k=>!['plan','quote-plan'].includes(k)))throw Error('REFERENCE_SCREEN_PLAN_AND_ATTEMPT_REQUIRED');
 const reference=await loadFrozenReference(ROOT,values.plan);
 if(values['quote-plan']){console.log(JSON.stringify(await referenceQuotePlan(ROOT,reference),null,2));return;}
 const files=await loadScreenFiles(ROOT,{...values,latestReport:values['latest-report'],contextEvidence:values['context-evidence'],combinedPrices:values['combined-prices']});
 console.log(JSON.stringify(await runReferenceScreen({root:ROOT,reference,files,attemptId:values.attempt}),null,2));
}
main().catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'REFERENCE_SCREEN_STOPPED_CHECK_PRIVATE_INPUTS');process.exitCode=1;});
