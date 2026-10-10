#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ROOT,loadJson,withLock} from './lib/private-store.mjs';
import {sha256} from './lib/goals/data.mjs';
import {validateRound} from './lib/odds-report.mjs';
import {readSnapshot,writeExclusive,digest} from './lib/prospective/store.mjs';
import {readRegistry,validateCurrentDataset} from './lib/shadow/registry.mjs';
import {refreshDataset} from './lib/shadow/data.mjs';
import {assertNoDecision,decisionPath,freezeForwardForecast,createDecision,persistDecision,validateCycleSchedule} from './lib/shadow/pipeline.mjs';
import {evaluateShadow,shadowProgress} from './lib/shadow/evaluate.mjs';
import {importQuotes} from './oddspapi.mjs';
import {POLICY} from './lib/shadow/policy.mjs';
import {experimentalScreen} from './lib/engine/screen.mjs';
import {requireRegisteredCode} from './lib/engine/registry.mjs';
import {freezeEngine,validateJournal} from './lib/engine/forecast.mjs';
import {manifestFromReport} from './lib/prospective/freeze.mjs';
import {buildContext,contextGate} from './lib/context/dossier.mjs';
import {contextIdentity} from './lib/context/identity.mjs';
import {validateBundle} from './lib/context/evidence.mjs';

const {values}=parseArgs({options:{help:{type:'boolean'},cycle:{type:'boolean'},'live-odds':{type:'boolean'},'refresh-data':{type:'boolean'},
  preview:{type:'boolean'},journal:{type:'string'},study:{type:'string'},report:{type:'string'},assessment:{type:'string'},
  dataset:{type:'string'},schedule:{type:'string'},round:{type:'string'},'max-legs':{type:'string'},'combined-prices':{type:'string'},
  inspect:{type:'string'},evaluate:{type:'string'},results:{type:'string'},progress:{type:'boolean'},
  'extension-journal':{type:'string'},'extension-study':{type:'string'},context:{type:'string'},'context-evidence':{type:'string'}},strict:true});
const directory=path.join(ROOT,'.local/shadow');
const clock=()=>new Date();
const files=async folder=>{try{return(await fs.readdir(folder)).filter(n=>n.endsWith('.json')).map(n=>path.join(folder,n));}catch(e){if(e.code==='ENOENT')return [];throw e;}};
async function engineIdentity(){
  async function sourceFiles(folder){const out=[];for(const entry of await fs.readdir(path.join(ROOT,folder),{withFileTypes:true})){
    const relative=folder+'/'+entry.name;if(entry.isDirectory())out.push(...await sourceFiles(relative));else if(/\.(mjs|ps1)$/.test(entry.name))out.push(relative);}return out;}
  const paths=(await sourceFiles('scripts')).sort();
  const text=await Promise.all(paths.map(p=>fs.readFile(path.join(ROOT,p),'utf8')));
  return {engineCodePaths:paths,engineCodeSha256:sha256(text.map((t,i)=>paths[i]+'\n'+t.replace(/\r\n/g,'\n')).join('\n')),
    protocolSha256:sha256((await fs.readFile(path.join(ROOT,POLICY.protocolPath),'utf8')).replace(/\r\n/g,'\n'))};
}
async function main(){
  if(values.help){console.log('Local: --journal FILE --study FILE --report FILE [--assessment FILE] [--preview]');
    console.log('Cycle: --cycle --study FILE --round FILE --schedule FILE (--report FILE | --live-odds) [--refresh-data]');
    console.log('Context: --context SNAPSHOT or --context-evidence LOCAL_NOTES; otherwise league-only dossier is generated, with missing themes explicit.');
    console.log('Read-only: --inspect FILE. Future evaluation: --evaluate DECISION --journal FILE --results FILE. --progress');return;}
  if(values.inspect){console.log(JSON.stringify(await readSnapshot(values.inspect),null,2));return;}
  const maxLegs=values['max-legs']===undefined?4:Number(values['max-legs']);if(![2,3,4,5,6].includes(maxLegs))throw new Error('--max-legs must be 2..6');
  await withLock(directory,async()=>{
    if(values.evaluate){
      if(!values.journal||!values.results)throw new Error('--journal and --results required');
      const decision=await readSnapshot(values.evaluate),journal=await readSnapshot(values.journal),results=await readSnapshot(values.results);
      if(!/^[A-Za-z0-9_-]+$/.test(journal.id))throw new Error('Invalid journal id');
      const markets=await Promise.all((await files(path.join(ROOT,'.local/model/prospective/markets',journal.id))).map(readSnapshot));
      const output=evaluateShadow(decision,journal,results,{now:clock(),markets}),filename=path.join(directory,'evaluations',digest(decision)+'-'+digest(results)+'.json');
      await writeExclusive(filename,output);console.log('Valutazione shadow privata:',filename);console.log(JSON.stringify({candidatesSettled:output.candidatesSettled,simulation:output.simulation}));return;
    }
    if(values.progress){
      const decisions=await Promise.all((await files(path.join(directory,'decisions'))).map(readSnapshot));
      const evaluations=await Promise.all((await files(path.join(directory,'evaluations'))).map(readSnapshot));
      const output=shadowProgress(decisions,evaluations,clock()),filename=path.join(directory,'progress',digest(output)+'.json');
      await writeExclusive(filename,output);console.log('Progressione shadow privata:',filename);console.log(JSON.stringify(output,null,2));return;
    }
    if(!values.study)throw new Error('--study required');
    if(values.context&&values['context-evidence'])throw new Error('Choose frozen context or new context evidence, not both');
    const registry=await readRegistry(ROOT,values.study,loadJson),assessment=values.assessment?await loadJson(values.assessment):{};
    const contextInput=values.context?await readSnapshot(values.context):null,contextEvidence=values['context-evidence']?await loadJson(values['context-evidence']):undefined;
    if(contextEvidence)validateBundle(contextEvidence,clock().toISOString()); // malformed/private evidence refused before acquisition
    if(values['extension-journal']&&!values['extension-study']||values['extension-study']&&!values['extension-journal']&&!values.cycle)throw new Error('Experimental study required; local mode also requires its journal');
    const extension=values['extension-study']?{journal:values['extension-journal']?await readSnapshot(values['extension-journal']):null,study:await readSnapshot(values['extension-study'])}:null;
    if(extension)await requireRegisteredCode(ROOT,extension.study); // before acquisition
    const input=values['combined-prices']?await loadJson(values['combined-prices']):[];
    const combinedPrices=input.payload?.verifications??input.verifications??input;if(!Array.isArray(combinedPrices))throw new Error('Combined price verification array required');
    let report,journal,preparedForecast,reportPath=values.report,journalPath=values.journal,dataset=registry.dataset;
    if(values.cycle){
      if(!values.round||!values.schedule||Boolean(values.report)===Boolean(values['live-odds'])||values.journal)throw new Error('Cycle requires round/schedule and exactly one odds source');
      const schedule=await loadJson(values.schedule),rawRound=await loadJson(values.round);
      const round={...rawRound,fixtureIds:rawRound.fixtureIds??schedule.events?.map(e=>e.fixtureId)};validateRound(round);
      if(!values.preview)await assertNoDecision(decisionPath(directory,round.season,round.matchday)); // before any network
      validateCycleSchedule(round,schedule,clock());
      if(values.dataset&&values['refresh-data'])throw new Error('Choose dataset or refresh, not both');
      if(values.dataset)dataset=validateCurrentDataset(await loadJson(values.dataset),clock()).dataset;
      if(values['refresh-data']){
        dataset=await refreshDataset({now:clock(),clock});validateCurrentDataset(dataset,clock());
        const filename=path.join(directory,'datasets',digest(dataset)+'.json');await writeExclusive(filename,dataset);console.log('Nuovo dataset privato:',filename);
      }
      if(extension){if(!extension.journal)extension.journal=(await freezeEngine({root:ROOT,study:extension.study,dataset,schedule,clock})).journal;
        validateJournal(extension.journal,extension.study);
        if(extension.journal.manifest.season!==round.season||extension.journal.manifest.matchday!==round.matchday||clock()-Date.parse(extension.journal.generatedAtUtc)>24*3600000||Date.parse(extension.journal.generatedAtUtc)>clock())throw new Error('Experimental forecast round/age invalid before acquisition');}
      if(values['live-odds']){
        // New forecasts are independent of prices and must precede their acquisition.
        preparedForecast=await freezeForwardForecast({schedule,registry,dataset,root:ROOT,clock});journal=preparedForecast.journal;journalPath=preparedForecast.filename;
        if(clock()-Date.parse(journal.generatedAtUtc)>24*3600000||Date.parse(journal.generatedAtUtc)>clock())throw new Error('Frozen v1 forecast expired/future; no quote acquisition');
        if(contextInput)contextGate(contextInput,journal,clock());
        if(contextEvidence)buildContext({manifest:journal.manifest,dataset,evidence:contextEvidence,now:clock()}); // exact identity preflight
        const imported=await importQuotes({round,key:process.env.ODDSPAPI_API_KEY});report=imported.report;reportPath=imported.filename;
        manifestFromReport(report,schedule); // binding checked before any decision; never rewrite forecast
      }
      else report=await loadJson(values.report);
      const forecast=preparedForecast??await freezeForwardForecast({report,schedule,registry,dataset,root:ROOT,clock});journal=forecast.journal;journalPath=forecast.filename;
      console.log(forecast.reused?'Forecast congelato riutilizzato:':'Nuovo forecast congelato:',journalPath);
    }else{
      if(!values.journal||!values.report||values['live-odds']||values['refresh-data']||values.dataset)throw new Error('Local mode requires journal/report; no network options');
      journal=await readSnapshot(values.journal);report=await loadJson(values.report);
      if(!values.preview)await assertNoDecision(decisionPath(directory,journal.manifest.season,journal.manifest.matchday));
    }
    const context=contextInput??{...buildContext({manifest:journal.manifest,dataset,evidence:contextEvidence,now:clock()}),provenance:await contextIdentity(ROOT)};
    if(!contextInput)await writeExclusive(path.join(ROOT,'.local/context/dossiers',digest(context)+'.json'),context);
    const decision=createDecision({journal,report,study:registry.study,assessment,maxLegs,combinedPrices,now:clock(),context,
      provenance:{...await engineIdentity(),repositoryCommit:registry.identity.repositoryCommit,repositoryDirty:registry.identity.repositoryDirty,journalPath,reportPath,
        quoteAcquisition:report.acquisition??null,mode:values.cycle?'cycle':'local',
        sourceData:report.source.mode==='synthetic_test'?'synthetic_test':'local_original_artifacts'}});
    if(extension){decision.experimentalMarkets=experimentalScreen({...extension,report,assessment,now:clock()});
      for(const r of decision.experimentalMarkets.records)r.contextState=decision.contextGate.entries.find(e=>e.fixtureId===r.fixtureId)?.state??'CONTEXT_REVIEW_REQUIRED';}
    const frozen=await persistDecision(decision,directory,{preview:values.preview});
    console.log(values.preview?'Anteprima shadow privata:':'Decisione shadow congelata:',frozen.filename);
    console.log(JSON.stringify({sha256:frozen.sha256,decision:decision.decision,cause:decision.noBetCause,...decision.opportunities.counts,
      combinations:decision.selector.counts.combinations,proposal:decision.selector.selected?.id??null,actualStakeEUR:0,
      billableAttemptsThisRun:values['live-odds']?report.acquisition?.billableAttempts??0:0,
      remainingLowerBoundAfterAcquisition:values['live-odds']?report.acquisition?.remainingLowerBound??null:null,
      globalIssues:decision.opportunities.globalIssues,
      exclusionReasons:Object.fromEntries([...new Set(decision.opportunities.screening.flatMap(s=>s.reasons))].map(reason=>[reason,decision.opportunities.screening.filter(s=>s.reasons.includes(reason)).length])),
      policyVersion:decision.policy.version,final:!values.preview,operationallyApproved:false}));
    console.log(JSON.stringify({contextReadyFixtures:decision.contextGate.eligibleFixtureIds.length,rawEVCandidates:decision.contextGate.rawEVCandidates,
      contextReadyCandidates:decision.contextGate.contextReadyCandidates,contextPolicyVersion:decision.contextPolicyVersion,probabilityAdjustment:null}));
    if(decision.experimentalMarkets)console.log(JSON.stringify({experimentalMarkets:decision.experimentalMarkets.counts,eligibleForSelector:false}));
  });
}
main().catch(error=>{console.error('Shadow interrotto:',error.code==='EEXIST'?'Snapshot già esistente: nessuna sovrascrittura':error.safeMessage??error.message);process.exitCode=1;});
