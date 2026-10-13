import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadJson} from '../private-store.mjs';
import {readSnapshot,writeExclusive,digest} from '../prospective/store.mjs';
import {readRegistry,validateCurrentDataset} from '../shadow/registry.mjs';
import {refreshDataset} from '../shadow/data.mjs';
import {freezeForwardForecast,decisionPath} from '../shadow/pipeline.mjs';
import {journalId,manifestFromReport} from '../prospective/freeze.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {importQuotes} from '../../oddspapi.mjs';
import {appPackage} from '../decision/app-package.mjs';
import {verifyDecisionBundle} from '../decision/delivery.mjs';
import {windowsVault} from '../private/windows-vault.mjs';
import {loadOddsKey} from '../private/odds-key.mjs';
import {readOutbox} from '../private/outbox.mjs';
import {parseDecisionEnvelope} from '../../../shared/decision-v4.mjs';
import {privateChannelPaths} from '../private/channels.mjs';
import {ensureShadowReception} from '../private/reception-ready.mjs';
const execute=promisify(execFile);
const failure=code=>Object.assign(new Error(code),{code});
async function existing(file){try{return await readSnapshot(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function saved(file,value){try{await writeExclusive(file,value);}catch(e){if(e.code!=='EEXIST'||digest(await readSnapshot(file))!==digest(value))throw e;}return file;}
export const loadUnattendedOddsKey=loadOddsKey;
export function shadowArguments(root,plan,results){
  const args=[path.join(root,'scripts/shadow.mjs'),'--study',plan.inputs.studyFile.file,'--journal',results.forecast.filename,
    '--report',results.quotes.filename,'--max-legs',String(plan.maxLegs),'--context-dataset',path.join(root,'.local/shadow/datasets',digest(results.dataset)+'.json')];
  for(const [key,option] of [['contextFile','--context'],['contextEvidenceFile','--context-evidence'],['assessmentFile','--assessment'],['combinedPricesFile','--combined-prices']])
    if(plan.inputs[key])args.push(option,plan.inputs[key].file);
  return args;
}
export function analysisAdapters(root,{clock=()=>new Date(),keyLoader=()=>loadUnattendedOddsKey(root),quoteOptions={}}={}){
  const inputsUnchanged=async plan=>{for(const [name,input] of Object.entries(plan.inputs))
    if(digest(await loadJson(input.file))!==plan.inputHashes[name])throw failure('ANALYSIS_INPUT_CHANGED');};
  const schedule=plan=>({...plan.schedule,scheduleSource:plan.schedule.source});
  const forecastFile=plan=>path.join(root,'.local/model/prospective/journals',journalId(plan.schedule)+'.json');
  const finalFile=plan=>decisionPath(path.join(root,'.local/shadow'),plan.round.season,plan.round.matchday);
  const quoteId=ctx=>digest({plan:ctx.intent.planSha256,forecast:digest(ctx.results.forecast.journal)});
  const recoverQuotes=async ctx=>{
    const directory=path.join(root,'.local/oddspapi/acquisitions',quoteId(ctx)),filename=path.join(directory,'report.json');
    try{const report=await loadJson(filename);
      if(report.acquisition?.id!==quoteId(ctx)||report.acquisition.roundSha256!==digest(ctx.plan.round))throw failure('QUOTE_RECOVERY_INVALID');
      return {report,filename};}catch(e){if(e.code==='ENOENT')return null;throw e;}
  };
  const bundle=(plan,results,decision)=>({decision,journal:results.forecast.journal,report:results.quotes.report,
    study:plan.inputs.studyFile.value,assessment:plan.inputs.assessmentFile?.value??{}});
  const validateDecision=(decision,ctx)=>{
    if(decision.final!==true||decision.round.season!==ctx.plan.round.season||decision.round.matchday!==ctx.plan.round.matchday)throw failure('ANALYSIS_DECISION_INVALID');
    verifyDecisionBundle(bundle(ctx.plan,ctx.results,decision));
  };
  return {
    dataset:{before:({plan})=>inputsUnchanged(plan),run:async()=>{
      const dataset=await refreshDataset({now:clock(),clock});validateCurrentDataset(dataset,clock());
      await saved(path.join(root,'.local/shadow/datasets',digest(dataset)+'.json'),dataset);return dataset;
    },validate:async(dataset,{now})=>{validateCurrentDataset(dataset,now);
      if(digest(await readSnapshot(path.join(root,'.local/shadow/datasets',digest(dataset)+'.json')))!==digest(dataset))throw failure('ANALYSIS_DATASET_INVALID');
    }},
    forecast:{before:({plan})=>inputsUnchanged(plan),recover:async({plan})=>{const journal=await existing(forecastFile(plan));return journal?{journal,filename:forecastFile(plan)}:null;},
      run:async({plan,results})=>{const registry=await readRegistry(root,plan.inputs.studyFile.file,loadJson);
        const frozen=await freezeForwardForecast({schedule:schedule(plan),registry,dataset:results.dataset,root,clock});return {journal:frozen.journal,filename:frozen.filename};},
      validate:async(result,{plan,results,now})=>{
        if(result.filename!==forecastFile(plan)||digest(await readSnapshot(result.filename))!==digest(result.journal)
          ||digest(result.journal.manifest.events)!==digest(plan.schedule.events.map(e=>({fixtureId:e.fixtureId,home:canonicalTeam(e.home),away:canonicalTeam(e.away),kickoffUtc:e.kickoffUtc,season:plan.round.season,matchday:plan.round.matchday})))
          ||result.journal.provenance.datasetSha256!==digest(results.dataset)||result.journal.provenance.studySha256!==plan.inputHashes.studyFile
          ||Date.parse(result.journal.generatedAtUtc)>=Date.parse(plan.window.closesAtUtc)||Date.parse(result.journal.generatedAtUtc)>new Date(now).getTime())throw failure('ANALYSIS_FORECAST_INVALID');
      }},
    quotes:{before:async({plan,results,now})=>{
      await inputsUnchanged(plan);
      if(new Date(now)-Date.parse(results.forecast.journal.generatedAtUtc)>24*3600000)throw failure('QUOTE_FORECAST_EXPIRED');
      // Delivery channel must be ready before spending any provider quota.
      const stored=await windowsVault(privateChannelPaths(root,'shadow').writer).load();
      if(stored?.profile?.trust?.channel!=='shadow')throw failure('PRIVATE_REAL_CHANNEL_NOT_CONFIGURED');
      await ensureShadowReception(root,{stored});
      await keyLoader();
    },recover:recoverQuotes,run:async ctx=>{
      const imported=await importQuotes({...quoteOptions,round:ctx.plan.round,directory:path.join(root,'.local/oddspapi'),key:await keyLoader(),clock,acquisitionId:quoteId(ctx)});
      return {report:imported.report,filename:imported.filename};
    },validate:async(result,{plan,results,now})=>{
      const id=digest({plan:digest(plan),forecast:digest(results.forecast.journal)});
      if(result.filename!==path.join(root,'.local/oddspapi/acquisitions',id,'report.json')
        ||digest(await loadJson(result.filename))!==digest(result.report)||result.report.source.mode!=='api'
        ||!Number.isFinite(Date.parse(result.report.fetchedAtUtc))||Date.parse(result.report.fetchedAtUtc)>new Date(now).getTime()
        ||Date.parse(result.report.fetchedAtUtc)>=Date.parse(plan.window.closesAtUtc))throw failure('QUOTE_REPORT_INVALID');
      const manifest=manifestFromReport(result.report,schedule(plan));
      if(digest(manifest.events)!==digest(results.forecast.journal.manifest.events)
        ||Date.parse(result.report.fetchedAtUtc)<Date.parse(results.forecast.journal.generatedAtUtc))throw failure('QUOTE_REPORT_FORECAST_MISMATCH');
    }},
    decision:{before:({plan})=>inputsUnchanged(plan),recover:({plan})=>existing(finalFile(plan)),run:async({plan,results})=>{
      try{await execute(process.execPath,shadowArguments(root,plan,results),{cwd:root,windowsHide:true,timeout:180000,maxBuffer:512*1024});}
      catch{throw failure('ANALYSIS_SHADOW_CLI_FAILED');}
      return readSnapshot(finalFile(plan));
    },validate:validateDecision},
    package:{run:async({plan,results,directory})=>{
      const payload=appPackage(bundle(plan,results,results.decision)),filename=path.join(directory,'app-v4.json');
      await saved(filename,payload);return {filename,sha256:digest(payload)};
    },recover:async({directory})=>{const filename=path.join(directory,'app-v4.json'),payload=await existing(filename);return payload?{filename,sha256:digest(payload)}:null;},
      validate:async(result,{plan,results})=>{
        const payload=await readSnapshot(result.filename);await parseDecisionEnvelope({schema:'lamultipla-prospective-envelope-v1',payload,sha256:result.sha256});
        if(digest(payload)!==digest(appPackage(bundle(plan,results,results.decision))))throw failure('ANALYSIS_PACKAGE_INVALID');
      }},
    queue:{recover:async({results})=>{
      const stored=await windowsVault(privateChannelPaths(root,'shadow').writer).load();
      if(!stored)throw failure('PRIVATE_REAL_CHANNEL_NOT_CONFIGURED');
      const records=await readOutbox(privateChannelPaths(root,'shadow').outbox,stored.profile.trust,{now:clock()});
      const record=records.find(r=>r.envelope.sha256===results.package.sha256);
      return record?{sequence:record.statement.sequence,deliveryId:record.statement.deliveryId,actualStakeEUR:0}:null;
    },before:({results,now})=>{
      if(new Date(now).getTime()>=Date.parse(results.decision.generatedAtUtc)+30*60000)throw failure('PRIVATE_QUEUE_PACKAGE_EXPIRED');
    },run:async({results})=>{
      let output;try{output=await execute(process.execPath,[path.join(root,'scripts/private-delivery.mjs'),'--queue',results.package.filename,'--channel','shadow'],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:64*1024});}
      catch{throw failure('PRIVATE_QUEUE_FAILED');}
      let value;try{value=JSON.parse(output.stdout);}catch{throw failure('PRIVATE_QUEUE_INVALID');}
      return {sequence:value.sequence,deliveryId:value.deliveryId,actualStakeEUR:value.actualStakeEUR};
    },validate:result=>{if(!Number.isSafeInteger(result.sequence)||result.sequence<1||!/^[a-f0-9]{64}$/.test(result.deliveryId)||result.actualStakeEUR!==0)throw failure('PRIVATE_QUEUE_INVALID');}}
  };
}
