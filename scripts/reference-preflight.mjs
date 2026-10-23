#!/usr/bin/env node
// Deliberately read-only entry point: no freeze, assembly, network or clock flags.
import {parseArgs} from 'node:util';
import {ROOT} from './lib/private-store.mjs';
import {loadReferencePlan,inspectReferenceReadiness} from './lib/reference-readiness.mjs';
async function main(){
 const {values}=parseArgs({strict:true,options:{plan:{type:'string'},help:{type:'boolean'}}});
 if(values.help){console.log('--plan PRIVATE_PLAN_OR_TEMPLATE. Local read-only checks only; no approval, registration, forecast, acquisition, delivery or scheduling.');return;}
 if(!values.plan)throw Error('REFERENCE_PREFLIGHT_PLAN_REQUIRED');
 const {input}=await loadReferencePlan(ROOT,values.plan,{allowDraft:true});
 const result=await inspectReferenceReadiness(input);console.log(JSON.stringify(result,null,2));
 if(result.state==='BLOCKED')process.exitCode=1;
}
main().catch(error=>{console.error(/^REFERENCE_[A-Z_]+$/.test(error.message)?error.message:'REFERENCE_LOCAL_INPUT_CHECK_FAILED');process.exitCode=1;});
