import fs from 'node:fs/promises';
import path from 'node:path';
import {loadJson,optionalJson,saveJson} from '../private-store.mjs';
import {digest,readSnapshot,writeExclusive} from '../prospective/store.mjs';
import {privateLock} from '../private/process-lock.mjs';
import {privateInput,validateAnalysisSchedule} from './analysis-plan.mjs';
import {collectPrivateCalendar} from './calendar-collection.mjs';
import {discoverCalendar,validatePublicCalendar} from './calendar-discovery.mjs';
import {PROGRESSIVE_POLICY,validateRoundIdentity,timing,fail} from './progressive-policy.mjs';
import {analysisTick} from './analysis-workflow.mjs';
import {progressiveAdapters} from './progressive-adapters.mjs';
import {roundDirectory,attemptDirectory,writeSame} from '../shadow/progressive.mjs';
import {decisionPath} from '../shadow/pipeline.mjs';
import {canonicalTeam,sha256} from '../goals/data.mjs';
import {randomUUID} from 'node:crypto';
const optional=async file=>{try{return await readSnapshot(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export async function loadManagerConfig(root,filename){
  const config=await loadJson(await privateInput(root,filename)),allowed=['schema','studyFile','scheduleFiles','contextFile','contextEvidenceFile','assessmentFile','combinedPricesFile','maxLegs'];
  if(config?.schema!=='lamultipla-progressive-manager-config-v1'||Object.keys(config).some(k=>!allowed.includes(k))
    ||!config.studyFile||!Array.isArray(config.scheduleFiles)||!config.scheduleFiles.length||config.scheduleFiles.length>38
    ||config.contextFile&&config.contextEvidenceFile||![2,3,4,5,6].includes(config.maxLegs??4))fail('PROGRESSIVE_CONFIG_INVALID');
  const inputs={};
  for(const key of allowed.filter(k=>k.endsWith('File')))if(config[key]){const file=await privateInput(root,config[key]);inputs[key]={file,value:await loadJson(file)};}
  const schedules=await Promise.all(config.scheduleFiles.map(async p=>loadJson(await privateInput(root,p))));
  if(new Set(schedules.map(s=>s.season+':'+s.matchday)).size!==schedules.length)fail('PROGRESSIVE_DUPLICATE_ROUND');
  return {config,inputs,schedules};
}
export function reconcileCalendar(schedule,snapshot,now){
  const identity=validateRoundIdentity(schedule);validateAnalysisSchedule(schedule,now);
  const at=new Date(now).getTime(),source=schedule.source;
  if(at-Date.parse(source.confirmedAtUtc)>86400000||at-Date.parse(snapshot.observedAtUtc)>PROGRESSIVE_POLICY.calendarMaxAgeMinutes*60000
    ||source.providerFixturesSha256!==digest(snapshot.fixtures)||source.providerObservedAtUtc!==snapshot.observedAtUtc)fail('PROGRESSIVE_CALENDAR_RECONFIRM_REQUIRED');
  const discovered=discoverCalendar(snapshot.source,snapshot.fixtures,{now}),publicRows=validatePublicCalendar(snapshot.source,{now}).rows;
  if(discovered.season!==schedule.season)fail('PROGRESSIVE_CALENDAR_SEASON_MISMATCH');
  const wall=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const events=schedule.events.map(e=>{
    const row=publicRows.find(m=>m.home===canonicalTeam(e.home)&&m.away===canonicalTeam(e.away)),provider=discovered.providerFixtures.find(f=>f.fixtureId===e.fixtureId);
    const parts=Object.fromEntries(wall.formatToParts(new Date(e.kickoffUtc)).map(p=>[p.type,p.value]));
    let status=e.status??'scheduled',reason=null;
    if(!row||row.matchday!==schedule.matchday||row.date!==parts.year+'-'+parts.month+'-'+parts.day||row.time!==parts.hour+':'+parts.minute)reason='CC0_SCHEDULE_DISCREPANCY';
    if(provider&&(provider.home!==canonicalTeam(e.home)||provider.away!==canonicalTeam(e.away)||provider.kickoffUtc!==e.kickoffUtc))reason='PROVIDER_IDENTITY_OR_KICKOFF_CHANGED';
    if(!provider&&Date.parse(e.kickoffUtc)>at&&status==='scheduled')reason='PROVIDER_FUTURE_FIXTURE_MISSING';
    if(provider?.statusId===3)status='cancelled';
    if(!['scheduled','cancelled','postponed','unknown'].includes(status))fail('PROGRESSIVE_CALENDAR_STATUS_INVALID');
    if(reason)status='unknown';
    return {...e,status,...(reason?{calendarIssue:reason}:{})};
  });
  return {schedule:{...schedule,events},identity,discovered};
}
function classify(decision,result){
  if(!decision)return 'TECHNICALLY_INCOMPLETE';
  if(decision.final)return 'SHADOW_PROPOSAL_FROZEN';
  if(result.state!=='attempt_recorded')return 'TECHNICALLY_INCOMPLETE';
  return ['NO_VALUE','UNCERTAIN_VALUE','NOT_ENOUGH_DISTINCT_OPPORTUNITIES','JOINT_VALUE_NOT_DEMONSTRATED','TIMING_OPPORTUNITIES_EXHAUSTED'].includes(decision.noBetCause)?
    'NO_BET_PROVISIONAL':'EVIDENCE_INSUFFICIENT';
}
async function attemptHistory(directory){
  let names=[];try{names=(await fs.readdir(path.join(directory,'attempts'))).filter(n=>/^\d{4}$/.test(n)).sort();}catch(e){if(e.code!=='ENOENT')throw e;}
  if(names.some((n,i)=>Number(n)!==i+1))fail('PROGRESSIVE_ATTEMPT_HISTORY_GAP');
  return Promise.all(names.map(async id=>{
    const plan=await readSnapshot(path.join(directory,'attempts',id,'plan.json')),outcome=await optional(path.join(directory,'attempts',id,'outcome.json'));
    if(plan.progressive.attemptId!==id||plan.progressive.revision!==Number(id)||outcome&&outcome.planSha256!==digest(plan))fail('PROGRESSIVE_ATTEMPT_HISTORY_INVALID');
    return {id,plan,outcome};
  }));
}
const reviewHash=inputs=>digest(Object.fromEntries(Object.entries(inputs).filter(([k])=>k!=='studyFile').map(([k,v])=>[k,digest(v.value)])));
async function preparePlan(root,schedule,inputs,maxLegs,revision,window,{reuse=null}={}){
  const identity=validateRoundIdentity(schedule),progressive={schema:'lamultipla-progressive-attempt-v1',protocolSha256:digest(PROGRESSIVE_POLICY),
    protocolDocumentSha256:sha256((await fs.readFile(path.join(root,PROGRESSIVE_POLICY.protocolPath),'utf8')).replace(/\r\n/g,'\n')),
    revision,attemptId:String(revision).padStart(4,'0'),roundIdentitySha256:digest(identity),scheduleSha256:digest(schedule),
    plannedAtUtc:window.plannedAtUtc,eligibleFixtureIds:window.eligibleFixtureIds,inputSha256:digest(Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,digest(v.value)])))};
  const times=schedule.events.map(e=>Date.parse(e.kickoffUtc)),round={season:schedule.season,matchday:schedule.matchday,
    fromUtc:new Date(Math.min(...times)).toISOString(),toUtc:new Date(Math.max(...times)+1).toISOString(),fixtureIds:schedule.events.map(e=>e.fixtureId),
    screeningFixtureIds:progressive.eligibleFixtureIds,progressiveProtocol:PROGRESSIVE_POLICY.version};
  const plan={schema:'lamultipla-progressive-analysis-plan-v1',schedule,round,progressive,maxLegs,
    window:{opensAtUtc:window.opensAtUtc,closesAtUtc:window.closesAtUtc},inputs:{},inputHashes:{},reuse};
  const directory=attemptDirectory(root,plan);
  for(const [key,input] of Object.entries(inputs)){
    const file=path.join(directory,'inputs',key+'.json');
    plan.inputs[key]={file,value:input.value};plan.inputHashes[key]=digest(input.value);
  }
  await writeExclusive(path.join(directory,'plan.json'),plan);await materializeInputs(root,plan);return plan;
}
async function materializeInputs(root,plan){
  const directory=attemptDirectory(root,plan);
  for(const [key,input] of Object.entries(plan.inputs)){
    if(input.file!==path.join(directory,'inputs',key+'.json')||digest(input.value)!==plan.inputHashes[key])fail('PROGRESSIVE_PINNED_INPUT_INVALID');
    try{if(digest(await loadJson(input.file))!==plan.inputHashes[key])fail('PROGRESSIVE_INPUT_CHANGED');continue;}catch(e){if(e.code!=='ENOENT')throw e;}
    const text=JSON.stringify(input.value,null,2)+'\n';
    if(/"(?:api_key|apiKey|password|authorization)"\s*:/i.test(text))fail('PROGRESSIVE_PRIVATE_INPUT_REJECTED');
    await fs.mkdir(path.dirname(input.file),{recursive:true});
    const temporary=input.file+'.'+randomUUID()+'.tmp';let handle;
    try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(text);await handle.sync();await handle.close();handle=null;await fs.link(temporary,input.file);}
    finally{if(handle)await handle.close();await fs.rm(temporary,{force:true});}
  }
}
export async function roundManagerTick({root,filename,clock=()=>new Date(),loadConfig=loadManagerConfig,
  collect=collectPrivateCalendar,makeAdapters=progressiveAdapters,runAnalysis=analysisTick,afterOutcome=async()=>{}}){
  const managerDirectory=path.join(root,'.local/orchestrator/progressive');
  return privateLock(managerDirectory,async()=>{
    const now=new Date(clock()),at=now.getTime();if(!Number.isFinite(at))fail('PROGRESSIVE_CLOCK_INVALID');
    let manager=await optionalJson(path.join(managerDirectory,'state.private.json'))??{schema:'lamultipla-round-manager-state-v1',lastObservedAtUtc:null,nextCalendarAtUtc:null,calendarFile:null};
    if(manager.schema!=='lamultipla-round-manager-state-v1'||manager.lastObservedAtUtc&&at<Date.parse(manager.lastObservedAtUtc))fail('PROGRESSIVE_MANAGER_STATE_INVALID');
    const {config,inputs,schedules}=await loadConfig(root,filename),responses=[];
    const protocolDocumentSha256=sha256((await fs.readFile(path.join(root,PROGRESSIVE_POLICY.protocolPath),'utf8')).replace(/\r\n/g,'\n'));
    if(manager.protocolDocumentSha256&&manager.protocolDocumentSha256!==protocolDocumentSha256)fail('PROGRESSIVE_PROTOCOL_CHANGED');
    manager={...manager,protocolDocumentSha256};
    const finals=await Promise.all(schedules.map(s=>optional(decisionPath(path.join(root,'.local/shadow'),s.season,s.matchday))));
    const allFinal=finals.every(Boolean);
    let needCalendar=!allFinal&&(!manager.calendarFile||!manager.nextCalendarAtUtc||at>=Date.parse(manager.nextCalendarAtUtc));
    for(const schedule of schedules){
      const time=timing(schedule,now),directory=roundDirectory(root,schedule),history=await attemptHistory(directory);
      const index=schedules.indexOf(schedule);
      const lastPaid=history.filter(h=>!h.plan.reuse&&h.outcome?.quoteStageStarted).at(-1);
      if(!finals[index]&&time.active&&(!history.length||history.at(-1).outcome&&(!lastPaid||at-Date.parse(lastPaid.outcome.completedAtUtc)>=PROGRESSIVE_POLICY.minAcquisitionIntervalMinutes*60000)))needCalendar=true;
      if(!finals[index]&&time.exhausted&&(!manager.calendarObservedAtUtc||at-Date.parse(manager.calendarObservedAtUtc)>=PROGRESSIVE_POLICY.calendarMaxAgeMinutes*60000))needCalendar=true;
    }
    if(needCalendar){
      const calendar=await collect({root,clock,maxAgeMs:PROGRESSIVE_POLICY.calendarMaxAgeMinutes*60000});
      manager={...manager,calendarFile:calendar.file,calendarObservedAtUtc:(await readSnapshot(calendar.file)).observedAtUtc,
        nextCalendarAtUtc:new Date(at+PROGRESSIVE_POLICY.calendarBackgroundIntervalMinutes*60000).toISOString()};
      await saveJson(path.join(managerDirectory,'state.private.json'),{...manager,lastObservedAtUtc:now.toISOString()});
    }
    const snapshot=allFinal?null:await readSnapshot(await privateInput(root,manager.calendarFile));
    for(const supplied of schedules){
      const directory=roundDirectory(root,supplied),history=await attemptHistory(directory);
      const finalFile=decisionPath(path.join(root,'.local/shadow'),supplied.season,supplied.matchday),final=await optional(finalFile);
      const producer=makeAdapters(root,{clock});
      if(final){
        if(final.schema==='lamultipla-app-round-state-v1'){
          try{await producer.deliverState(final,{round:final.round});responses.push({round:final.round,state:'NO_BET_FINAL',delivery:'queued'});}
          catch{responses.push({round:final.round,state:'NO_BET_FINAL',delivery:'RECEIVER_UPGRADE_OR_QUEUE_REQUIRED'});}
        }else{
          const last=history.at(-1);if(!last||last.plan.progressive.attemptId!==final.progressive?.attemptId)fail('PROGRESSIVE_FINAL_HISTORY_CONFLICT');
          const result=await runAnalysis({root,plan:last.plan,adapters:producer.adapters,clock});
          responses.push({round:final.round,state:'SHADOW_PROPOSAL_FROZEN',delivery:result.state});
        }continue;
      }
      const lastOutcome=history.at(-1)?.outcome;
      if(lastOutcome){
        const update=await optional(path.join(attemptDirectory(root,history.at(-1).plan),'state-package.json'));
        if(update)try{await producer.deliverState(update,history.at(-1).plan);}catch{ /* Finalization and scientific history do not depend on optional updates. */ }
      }
      let reconciled;
      try{reconciled=reconcileCalendar(supplied,snapshot,now);}catch{
        responses.push({round:{season:supplied.season,matchday:supplied.matchday},state:'EVIDENCE_INSUFFICIENT',reason:'CALENDAR_RECONFIRM_REQUIRED'});continue;
      }
      const {schedule,identity,discovered}=reconciled,time=timing(schedule,now),round={season:schedule.season,matchday:schedule.matchday};
      const identityFile=path.join(directory,'identity.json'),oldIdentity=await optional(identityFile);
      if(oldIdentity&&digest(oldIdentity.identity)!==digest(identity))fail('PROGRESSIVE_FULL_ROUND_IDENTITY_CHANGED');
      if(!oldIdentity)await writeSame(identityFile,{identity,firstSchedule:schedule,protocolSha256:digest(PROGRESSIVE_POLICY)});
      if(!time.exhausted&&history.some(h=>h.outcome?.paidAttemptAmbiguous)){
        responses.push({round,state:'TECHNICALLY_INCOMPLETE',reason:'AMBIGUOUS_PROVIDER_ATTEMPT_REVIEW_REQUIRED'});continue;
      }
      let latest=history.at(-1),plan=latest&&!latest.outcome?latest.plan:null;
      if(plan&&(digest(plan.schedule)!==digest(schedule)||reviewHash(plan.inputs)!==reviewHash(inputs))){
        const intent=await optional(path.join(attemptDirectory(root,plan),'intents/quotes.json'));
        if(!intent){
          const outcome={schema:'lamultipla-progressive-attempt-outcome-v1',attemptId:plan.progressive.attemptId,planSha256:digest(plan),
            decisionSha256:null,state:'TECHNICALLY_INCOMPLETE',reason:'INPUTS_REVISED_BEFORE_ACQUISITION',workflowState:'superseded_before_quotes',
            completedAtUtc:clock().toISOString(),reviewSha256:reviewHash(plan.inputs),paidAttemptAmbiguous:false,quoteStageStarted:false,
            publicMissingAvailableResults:discovered.publicMissingAvailableResults};
          await writeSame(path.join(attemptDirectory(root,plan),'outcome.json'),outcome);
          latest={...latest,outcome};history[history.length-1]=latest;plan=null;
        }
      }
      if(!plan&&time.exhausted){
        const closure={round,schedule};await producer.close(closure,history.map(h=>({sha256:digest(h.outcome),state:h.outcome.state,reason:h.outcome.reason})));
        const closed=await readSnapshot(finalFile);
        try{await producer.deliverState(closed,closure);responses.push({round,state:'NO_BET_FINAL',delivery:'queued'});}
        catch{responses.push({round,state:'NO_BET_FINAL',delivery:'RECEIVER_UPGRADE_OR_QUEUE_REQUIRED'});}continue;
      }
      if(!plan){
        if(latest&&!latest.outcome.quoteStageStarted&&digest(latest.plan.schedule)===digest(schedule)
          &&latest.outcome.reviewSha256===reviewHash(inputs)&&at<Date.parse(latest.plan.window.closesAtUtc)){
          responses.push({round,state:'EVIDENCE_INSUFFICIENT',reason:latest.outcome.reason,nextWindowAtUtc:time.nextWindowAtUtc});continue;
        }
        let reuse=null;
        if(latest&&reviewHash(inputs)!==latest.outcome.reviewSha256){
          const quote=await optional(path.join(attemptDirectory(root,latest.plan),'receipts/quotes.json')),
            forecast=await optional(path.join(attemptDirectory(root,latest.plan),'receipts/forecast.json'));
          if(quote&&forecast&&at-Date.parse(quote.result.report.fetchedAtUtc)<PROGRESSIVE_POLICY.maxQuoteAgeMinutes*60000
            &&at-Date.parse(forecast.result.journal.generatedAtUtc)<24*3600000){
            reuse={reportFile:quote.result.filename,forecastFile:forecast.result.filename,
              datasetFile:path.join(root,'.local/shadow/datasets',forecast.result.journal.provenance.datasetSha256+'.json')};
          }
        }
        const lastPaid=history.filter(h=>!h.plan.reuse&&h.outcome?.quoteStageStarted).at(-1);
        const paidBackoff=lastPaid&&at-Date.parse(lastPaid.outcome.completedAtUtc)<PROGRESSIVE_POLICY.minAcquisitionIntervalMinutes*60000;
        if(!time.active&&!reuse||paidBackoff&&!reuse||time.eligibleFixtureIds.length<2){
          responses.push({round,state:time.unresolved?'EVIDENCE_INSUFFICIENT':'WAITING_WINDOW',
            nextWindowAtUtc:time.nextWindowAtUtc,reason:time.unresolved?'CALENDAR_UNRESOLVED':paidBackoff?'ACQUISITION_SPACING':'NO_CURRENT_WINDOW'});continue;
        }
        const active=time.active??{opensAtUtc:now.toISOString(),closesAtUtc:new Date(Math.min(...schedule.events.filter(e=>time.eligibleFixtureIds.includes(e.fixtureId)).map(e=>Date.parse(e.kickoffUtc)))-PROGRESSIVE_POLICY.analysisLeadMinutes*60000).toISOString()};
        plan=await preparePlan(root,schedule,inputs,config.maxLegs??4,history.length+1,{...active,plannedAtUtc:now.toISOString(),eligibleFixtureIds:time.eligibleFixtureIds},{reuse});
      }
      await materializeInputs(root,plan);
      if(plan.progressive.protocolDocumentSha256!==protocolDocumentSha256)fail('PROGRESSIVE_PROTOCOL_CHANGED');
      const result=await runAnalysis({root,plan,adapters:producer.adapters,clock});
      const decision=await optional(path.join(attemptDirectory(root,plan),'decision.json'));
      const pending=['retry_required','backoff','waiting_window'].includes(result.state);
      const state=pending?'ANALYSIS_IN_PROGRESS':classify(decision,result);
      if(!pending){
        const outcome={schema:'lamultipla-progressive-attempt-outcome-v1',attemptId:plan.progressive.attemptId,planSha256:digest(plan),
          decisionSha256:decision?digest(decision):null,state,reason:decision?.noBetCause??result.reason??null,workflowState:result.state,
          completedAtUtc:clock().toISOString(),reviewSha256:reviewHash(inputs),
          paidAttemptAmbiguous:result.state==='review_required'&&result.stage==='quotes',
          quoteStageStarted:Boolean(await optional(path.join(attemptDirectory(root,plan),'intents/quotes.json'))),
          publicMissingAvailableResults:discovered.publicMissingAvailableResults};
        await writeSame(path.join(attemptDirectory(root,plan),'outcome.json'),outcome);
        if(!decision?.final){
          const statePackage={schema:'lamultipla-app-round-state-v1',id:round.season.replace('/','-')+'-round-'+round.matchday+'-update-'+plan.progressive.attemptId,
            round,generatedAtUtc:outcome.completedAtUtc,status:'no_bet',phase:state,mode:'experimental',delivery:'private_local',
            sourceData:decision?.provenance.sourceData??(plan.inputs.studyFile.value.synthetic?'synthetic_test':'local_original_artifacts'),
            final:false,actualStakeEUR:0,nominalStakeEUR:0,
            operational:{decision:'NO_BET',cause:'MODEL_NOT_AUTHORIZED',authorized:false,publicationAllowed:false},
            protocolVersion:PROGRESSIVE_POLICY.version,calendarSha256:digest(plan.schedule),
            attemptHashes:[...history.filter(h=>h.outcome).map(h=>digest(h.outcome)),digest(outcome)],
            reasonCodes:[outcome.reason??state],nextWindowAtUtc:time.nextWindowAtUtc};
          await writeSame(path.join(attemptDirectory(root,plan),'state-package.json'),statePackage);
          await afterOutcome();
          try{await producer.deliverState(statePackage,plan);}catch{ /* Capability/transport can wait; the immutable outcome is preserved. */ }
        }else await afterOutcome();
      }
      responses.push({round,state,reason:decision?.noBetCause??result.reason??null,attemptId:plan.progressive.attemptId,
        nextWindowAtUtc:time.nextWindowAtUtc,publicMissingAvailableResults:discovered.publicMissingAvailableResults,actualStakeEUR:0});
    }
    await saveJson(path.join(managerDirectory,'state.private.json'),{...manager,lastObservedAtUtc:clock().toISOString()});
    return {mode:'PROGRESSIVE_ROUND_MANAGER',rounds:responses,actualStakeEUR:0,tasksRegistered:false};
  });
}
