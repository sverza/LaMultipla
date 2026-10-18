#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {ROOT,loadJson,withLock} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {readSnapshot,writeExclusive,digest} from './lib/prospective/store.mjs';
import {requireRegisteredCode} from './lib/engine/registry.mjs';
import {buildMultimarketDiagnosticOptimized as buildMultimarketDiagnostic} from './lib/diagnostic-performance/multimarket.mjs';
import {diagnosticPerformanceIdentity} from './lib/diagnostic-performance/identity.mjs';
import {diagnosticHtml} from './lib/diagnostics/html.mjs';
import {diagnosticPreflight,freezeIndependentDiagnostic} from './lib/diagnostics/freeze.mjs';
import {controlledSelectorScenarios,selectorFunnel} from './lib/diagnostics/selector-audit.mjs';
import {diagnosticIdentity} from './lib/diagnostics/identity.mjs';
const {values}=parseArgs({strict:true,options:{help:{type:'boolean'},preflight:{type:'boolean'},freeze:{type:'boolean'},report:{type:'boolean'},
  'synthetic-audit':{type:'boolean'},'audit-selector':{type:'boolean'},study:{type:'string'},dataset:{type:'string'},schedule:{type:'string'},calendar:{type:'string'},
  journal:{type:'string'},'odds-report':{type:'string'},assessment:{type:'string'},context:{type:'string'},decision:{type:'string'},inspect:{type:'string'}}});
const directory=path.join(ROOT,'.local/diagnostics/multimarket');
const raw=async f=>loadJson(await privateInput(ROOT,f)),sealed=async f=>readSnapshot(await privateInput(ROOT,f));
async function main(){
  if(values.help){console.log('Private only: --preflight --study FILE --dataset FILE --schedule FILE | --freeze plus --calendar SNAPSHOT | --report --study FILE --journal FILE [--odds-report FILE] [--assessment FILE] [--context FILE] [--decision FILE] | --synthetic-audit | --audit-selector --decision FILE | --inspect FILE. No provider, delivery or tuning commands.');return;}
  if(['preflight','freeze','report','synthetic-audit','audit-selector','inspect'].filter(k=>values[k]).length!==1)throw new Error('DIAGNOSTIC_ONE_MODE_REQUIRED');
  if(values.inspect){const r=await sealed(values.inspect);if(!r.schema?.includes('diagnostic')&&!r.schema?.includes('audit'))throw new Error('DIAGNOSTIC_REPORT_REQUIRED');console.log(JSON.stringify(r,null,2));return;}
  const now=new Date();let payload;
  if(values['synthetic-audit'])payload=controlledSelectorScenarios();
  else if(values['audit-selector']){if(!values.decision)throw new Error('DIAGNOSTIC_DECISION_REQUIRED');payload=selectorFunnel(await sealed(values.decision));}
  else{
    if(!values.study)throw new Error('DIAGNOSTIC_STUDY_REQUIRED');const study=await sealed(values.study);await requireRegisteredCode(ROOT,study);
    if(values.preflight||values.freeze){
      if(!values.dataset||!values.schedule)throw new Error('DIAGNOSTIC_DATASET_SCHEDULE_REQUIRED');
      const input=await raw(values.dataset),dataset=input.schema==='lamultipla-prospective-envelope-v1'?input.payload:input,schedule=await raw(values.schedule);
      // Envelope integrity is checked, never bypassed merely because payload is present.
      if(input.schema==='lamultipla-prospective-envelope-v1'&&digest(input.payload)!==input.sha256)throw new Error('DIAGNOSTIC_DATASET_HASH_MISMATCH');
      if(values.preflight){console.log(JSON.stringify(await diagnosticPreflight({root:ROOT,study,dataset,schedule,now})));return;}
      if(!values.calendar)throw new Error('DIAGNOSTIC_CALENDAR_REQUIRED');const calendar=await sealed(values.calendar);
      return withLock(directory,async()=>{
        const attempt=path.join(directory,'freeze-attempts',randomUUID());
        await writeExclusive(path.join(attempt,'intent.json'),{schema:'lamultipla-diagnostic-freeze-intent-v1',startedAtUtc:new Date().toISOString(),
          studySha256:digest(study),datasetSha256:digest(dataset),scheduleSha256:digest(schedule),calendarSha256:digest(calendar),code:await diagnosticIdentity(ROOT)});
        try{const result=await freezeIndependentDiagnostic({root:ROOT,study,dataset,schedule,calendar});
          await writeExclusive(path.join(attempt,'outcome.json'),{state:'FROZEN_OR_RECOVERED',completedAtUtc:new Date().toISOString(),journalFile:result.filename,journalSha256:digest(result.journal),reused:result.reused});
          console.log(JSON.stringify({journalFile:result.filename,journalSha256:digest(result.journal),reused:result.reused,
            counts:result.journal.counts,attemptFile:path.join(attempt,'intent.json'),providerRequests:0,actualStakeEUR:0,eligibleForSelector:false}));
        }catch{await writeExclusive(path.join(attempt,'outcome.json'),{state:'INCOMPLETE_OR_REJECTED',completedAtUtc:new Date().toISOString(),automaticRetry:false});throw new Error('DIAGNOSTIC_FREEZE_STOPPED');}
      });
    }
    if(!values.journal)throw new Error('DIAGNOSTIC_JOURNAL_REQUIRED');
    await diagnosticPerformanceIdentity(ROOT);
    payload=buildMultimarketDiagnostic({journal:await sealed(values.journal),study,now,
      report:values['odds-report']?await raw(values['odds-report']):null,assessment:values.assessment?await raw(values.assessment):{},
      context:values.context?await sealed(values.context):null,decision:values.decision?await sealed(values.decision):null});
  }
  return withLock(directory,async()=>{
    payload.codeIdentity=await diagnosticIdentity(ROOT);
    if(payload.schema==='lamultipla-multimarket-diagnostic-v1')payload.performanceAdapter=await diagnosticPerformanceIdentity(ROOT);
    const filename=path.join(directory,'reports',digest(payload)+'.json');await writeExclusive(filename,payload);
    let htmlFile=null;if(payload.schema==='lamultipla-multimarket-diagnostic-v1'){
      htmlFile=filename.replace(/\.json$/,'.html');await fs.writeFile(htmlFile,diagnosticHtml(payload),{flag:'wx',mode:0o600});}
    console.log(JSON.stringify({file:filename,htmlFile,schema:payload.schema,counts:payload.counts??null,
      sourceData:payload.sourceData??null,providerRequests:0,deliveries:0,actualStakeEUR:0}));
  });
}
main().catch(()=>{console.error('Diagnostica interrotta: verificare versione, input privati, identità, tempi e snapshot già presenti. Nessuna acquisizione quote o consegna.');process.exitCode=1;});
