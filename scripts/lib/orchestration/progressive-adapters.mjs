import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {analysisAdapters,shadowArguments} from './analysis-adapters.mjs';
import {readSnapshot,digest} from '../prospective/store.mjs';
import {loadJson} from '../private-store.mjs';
import {readRegistry,validateCurrentDataset} from '../shadow/registry.mjs';
import {freezeForwardForecast} from '../shadow/pipeline.mjs';
import {journalId,batchForecast,sealJournal} from '../prospective/freeze.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {verifyDecisionBundle} from '../decision/delivery.mjs';
import {attemptDirectory,roundDirectory,writeSame,commitFinal} from '../shadow/progressive.mjs';
import {PROGRESSIVE_POLICY,fail,validateRoundIdentity,scheduleFromJournalManifest} from './progressive-policy.mjs';
const execute=promisify(execFile);
const optional=async file=>{try{return await readSnapshot(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const manifest=plan=>({schema:'lamultipla-round-manifest-v1',season:plan.round.season,matchday:plan.round.matchday,
  scheduleSource:plan.schedule.source,identityBasis:'confirmed_schedule_pending_quote_report_check',
  events:plan.schedule.events.map(e=>({fixtureId:e.fixtureId,home:canonicalTeam(e.home),away:canonicalTeam(e.away),kickoffUtc:e.kickoffUtc,season:plan.round.season,matchday:plan.round.matchday}))});
const bundle=(plan,results,decision)=>({decision,journal:results.forecast.journal,report:results.quotes.report,study:plan.inputs.studyFile.value,assessment:plan.inputs.assessmentFile?.value??{}});
export function progressiveAdapters(root,options={}){
  const clock=options.clock??(()=>new Date()),adapters=analysisAdapters(root,{...options,clock});
  const originalForecast=plan=>path.join(root,'.local/model/prospective/journals',journalId(plan.schedule)+'.json');
  const forecastFile=plan=>path.join(attemptDirectory(root,plan),'forecast.json');
  const datasetRun=adapters.dataset.run;
  adapters.dataset.run=ctx=>ctx.plan.reuse?readSnapshot(ctx.plan.reuse.datasetFile):datasetRun(ctx);
  const missingFile=plan=>path.join(roundDirectory(root,plan.round),'scientific-missing.json');
  const referenceFor=async plan=>await optional(originalForecast(plan))??await readSnapshot(missingFile(plan));
  const resultFor=async(plan,file)=>({journal:await readSnapshot(file),filename:file,
    scientificJournalSha256:digest(await referenceFor(plan))});
  adapters.forecast.recover=async({plan})=>await optional(forecastFile(plan))?resultFor(plan,forecastFile(plan)):null;
  adapters.forecast.run=async({plan,results})=>{
    if(plan.reuse){const result=await resultFor(plan,plan.reuse.forecastFile);await writeSame(forecastFile(plan),result.journal);return {...result,filename:forecastFile(plan)};}
    let original=await optional(originalForecast(plan));
    let missing=await optional(missingFile(plan));
    if(!original&&!missing){
      if(clock().getTime()>=Math.min(...plan.schedule.events.map(e=>Date.parse(e.kickoffUtc)))-PROGRESSIVE_POLICY.analysisLeadMinutes*60000){
        missing={schema:'lamultipla-scientific-forecast-missing-v1',roundIdentitySha256:digest(validateRoundIdentity(plan.schedule)),
          recordedAtUtc:clock().toISOString(),reason:'FIRST_SCIENTIFIC_WINDOW_MISSED',cohortEligible:false};
        await writeSame(missingFile(plan),missing);
      }else{
        if(plan.schedule.events.some(e=>(e.status??'scheduled')!=='scheduled'))fail('PROGRESSIVE_SCIENTIFIC_CALENDAR_INCOMPLETE');
        const registry=await readRegistry(root,plan.inputs.studyFile.file,loadJson);
        original=(await freezeForwardForecast({schedule:{...plan.schedule,scheduleSource:plan.schedule.source},registry,dataset:results.dataset,root,clock})).journal;
      }
    }
    if(original&&(original.generatedAtUtc<PROGRESSIVE_POLICY.registeredAtUtc
      ||digest(validateRoundIdentity(scheduleFromJournalManifest(original.manifest)))!==digest(validateRoundIdentity(plan.schedule))))
      fail('PROGRESSIVE_SCIENTIFIC_IDENTITY_CONFLICT');
    if(missing&&missing.roundIdentitySha256!==digest(validateRoundIdentity(plan.schedule)))fail('PROGRESSIVE_SCIENTIFIC_IDENTITY_CONFLICT');
    let journal=original;
    if(!original||plan.progressive.revision>1||digest(original.manifest.events)!==digest(manifest(plan).events)){
      const validated=validateCurrentDataset(results.dataset,clock()),full=manifest(plan);
      const cutoff=original?.trainingCutoffUtc??plan.schedule.events.map(e=>e.kickoffUtc.slice(0,7)).sort()[0]+'-01T00:00:00.000Z';
      const batch=batchForecast(validated.dataset.rows,cutoff,full);
      journal=sealJournal(batch,full,{...original?.provenance,studySha256:plan.inputHashes.studyFile,datasetSha256:validated.sha256,datasetAcquiredAtUtc:validated.dataset.acquiredAtUtc,
        sourceCommit:validated.dataset.commit,sourceFiles:validated.dataset.files,cohortEligible:false,
        scientificJournalSha256:digest(original??missing),scientificJournalMissing:!original,forecastPurpose:'residual_shadow_revision_not_scientific',attemptId:plan.progressive.attemptId},clock().toISOString());
      journal.id+='-shadow-'+plan.progressive.attemptId;
      journal.entries=journal.entries.map(entry=>{
        if((plan.schedule.events.find(e=>e.fixtureId===entry.fixtureId).status??'scheduled')==='scheduled')return entry;
        const content={...entry,status:'excluded',reason:'unverified_current_calendar',probabilities:null};delete content.entrySha256;
        return {...content,entrySha256:digest(content)};
      });
      journal.counts={planned:journal.entries.length,prospective:journal.entries.filter(e=>e.status==='prospective').length,excluded:journal.entries.filter(e=>e.status==='excluded').length};
    }
    await writeSame(forecastFile(plan),journal);return resultFor(plan,forecastFile(plan));
  };
  adapters.forecast.validate=async(result,{plan,now})=>{
    if(digest(await readSnapshot(result.filename))!==digest(result.journal)||result.filename!==forecastFile(plan)
      ||result.scientificJournalSha256!==digest(await referenceFor(plan))
      ||Date.parse(result.journal.generatedAtUtc)>new Date(now).getTime())fail('PROGRESSIVE_FORECAST_INVALID');
    if(plan.progressive.revision>1&&!plan.reuse&&result.journal.provenance.cohortEligible!==false)fail('PROGRESSIVE_REVISION_COHORT_INVALID');
  };
  const quotesRecover=adapters.quotes.recover,quotesRun=adapters.quotes.run,quotesBefore=adapters.quotes.before;
  adapters.quotes.recover=ctx=>ctx.plan.reuse?loadJson(ctx.plan.reuse.reportFile).then(report=>({report,filename:ctx.plan.reuse.reportFile})):quotesRecover(ctx);
  adapters.quotes.before=ctx=>ctx.plan.reuse?undefined:quotesBefore(ctx);
  adapters.quotes.run=ctx=>ctx.plan.reuse?adapters.quotes.recover(ctx):quotesRun(ctx);
  adapters.quotes.validate=async(result,{plan,results,now})=>{
    const report=result.report,expected=plan.round.screeningFixtureIds;
    if(digest(await loadJson(result.filename))!==digest(report)||report.source.mode!=='api'||report.round.verified!==true
      ||report.round.season!==plan.round.season||report.round.matchday!==plan.round.matchday
      ||digest([...report.round.fixtureIds].sort())!==digest([...plan.round.fixtureIds].sort())
      ||Date.parse(report.fetchedAtUtc)<Date.parse(results.forecast.journal.generatedAtUtc)||Date.parse(report.fetchedAtUtc)>new Date(now).getTime()
      ||!plan.reuse&&digest(report.coverage.map(e=>e.fixtureId).sort())!==digest([...expected].sort()))fail('PROGRESSIVE_REPORT_INVALID');
    for(const row of report.coverage){const e=plan.schedule.events.find(e=>e.fixtureId===row.fixtureId);
      if(!e||canonicalTeam(row.fixture[0])!==canonicalTeam(e.home)||canonicalTeam(row.fixture[1])!==canonicalTeam(e.away)||row.kickoffUtc!==e.kickoffUtc)fail('PROGRESSIVE_REPORT_SCHEDULE_CHANGED');}
  };
  adapters.decision.recover=async({plan})=>{
    const saved=await optional(path.join(attemptDirectory(root,plan),'decision.json'));
    if(saved?.final)await commitFinal(root,saved);return saved;
  };
  adapters.decision.run=async({plan,results})=>{
    const decisionMetadata={...plan.progressive,scientificJournalSha256:results.forecast.scientificJournalSha256};
    const file=path.join(attemptDirectory(root,plan),'decision-plan.json');await writeSame(file,{...plan,decisionMetadata});
    try{await execute(process.execPath,[...shadowArguments(root,plan,results),'--progressive-plan',file],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:256*1024});}
    catch{fail('PROGRESSIVE_SHADOW_CLI_FAILED');}
    return readSnapshot(path.join(attemptDirectory(root,plan),'decision.json'));
  };
  adapters.decision.validate=async(decision,{plan,results})=>{
    if(decision.progressive?.attemptId!==plan.progressive.attemptId||decision.final!==Boolean(decision.selector.selected))fail('PROGRESSIVE_DECISION_INVALID');
    verifyDecisionBundle(bundle(plan,results,decision));
  };
  const queueBefore=adapters.queue.before;
  adapters.queue.before=ctx=>{
    queueBefore(ctx);
    if(ctx.results.decision.selector.selected.selections.some(s=>Date.parse(ctx.results.decision.opportunities.candidates.find(c=>c.quoteId===s.quoteId).kickoffUtc)
      <=new Date(ctx.now).getTime()+PROGRESSIVE_POLICY.queueLeadMinutes*60000))fail('PRIVATE_QUEUE_PACKAGE_EXPIRED');
  };
  const terminal=async(plan,history)=>{
    const dir=roundDirectory(root,plan.round),file=path.join(dir,'closure-plan.json'),historyFile=path.join(dir,'closure-history.json');
    await writeSame(file,plan);await writeSame(historyFile,history);
    try{await execute(process.execPath,[path.join(root,'scripts/shadow.mjs'),'--progressive-plan',file,'--close-progressive','--progressive-history',historyFile],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});}
    catch{fail('PROGRESSIVE_CLOSE_FAILED');}
  };
  const deliverState=async(snapshot,plan)=>{
    const file=path.join(roundDirectory(root,plan.round),'state-packages',digest(snapshot)+'.json');await writeSame(file,snapshot);
    try{await execute(process.execPath,[path.join(root,'scripts/private-delivery.mjs'),'--queue',file,'--channel','shadow'],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:65536});}
    catch{fail('PRIVATE_ROUND_STATE_RECEIVER_OR_QUEUE_REQUIRED');}
    return {queued:true};
  };
  return {adapters,close:terminal,deliverState};
}
