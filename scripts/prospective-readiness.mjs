#!/usr/bin/env node
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ROOT} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {readSnapshot,digest} from './lib/prospective/store.mjs';
import {evaluateJournal} from './lib/prospective/evaluate.mjs';
import {GENERAL_POLICY} from './lib/decision/policy.mjs';
export function checkEvaluationReadiness(journal,results,{now=new Date(),requireOriginalPilot=false,baseline=null}={}){
  if(journal.provenance?.cohortEligible===false)throw new Error('Revision is not the scientific forecast');
  const pilot=GENERAL_POLICY.protectedPilot;
  if(requireOriginalPilot&&(journal.id!==pilot.id||digest(journal)!==pilot.journalSha256))throw new Error('Original pilot hash mismatch');
  if(requireOriginalPilot&&baseline&&(digest(baseline)!=='199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990'||baseline.journalId!==journal.id||baseline.compatible!==true))throw new Error('Original compatible baseline mismatch');
  const due=!requireOriginalPilot||new Date(now).getTime()>=Date.parse(pilot.evaluationFromUtc);
  if(!due)return {status:'WAITING_UNTIL_15_OCTOBER',journalSha256:digest(journal),readOnly:true};
  const evaluation=evaluateJournal(journal,results,{evaluatedAtUtc:new Date(now).toISOString(),markets:baseline?[baseline]:[]});
  return {status:evaluation.counts.pending?'DUE_WITH_PENDING_RESULTS':'DUE_RESULTS_AVAILABLE',journalSha256:digest(journal),
    resultsSha256:digest(results),sourceCommit:results.sourceCommit,acquiredAtUtc:results.acquiredAtUtc,
    counts:evaluation.counts,pending:evaluation.pending,readOnly:true,originalForecastUnchanged:true,baselineProvided:Boolean(baseline),
    note:'Evaluate now on observed results; pending are explicit. No complete-sample postponement or source replacement.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  (async()=>{
    const {values}=parseArgs({options:{journal:{type:'string'},results:{type:'string'},baseline:{type:'string'}},strict:true});
    if(!values.journal||!values.results)throw new Error('Journal and results required');
    const journal=await readSnapshot(await privateInput(ROOT,values.journal)),results=await readSnapshot(await privateInput(ROOT,values.results));
    const baseline=values.baseline?await readSnapshot(await privateInput(ROOT,values.baseline)):null;
    return checkEvaluationReadiness(journal,results,{requireOriginalPilot:true,baseline});
  })().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Verifica risultati rifiutata: origine, integrità o tempi da controllare. Nessuno snapshot modificato.');process.exitCode=1;});
}
