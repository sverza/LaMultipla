import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fingerprint} from '../odds-report.mjs';
import {digest,writeExclusive,readSnapshot} from '../prospective/store.mjs';
import {manifestFromReport,journalId,batchForecast,sealJournal} from '../prospective/freeze.mjs';
import {screenOpportunities} from './opportunities.mjs';
import {selectCombination} from './combinations.mjs';
import {validateCurrentDataset} from './registry.mjs';
import {POLICY} from './policy.mjs';
import {canonicalTeam} from '../goals/data.mjs';

export function decisionPath(directory,season,matchday) {
  if(!/^\d{4}\/\d{2}$/.test(season)||!Number.isInteger(matchday)||matchday<1||matchday>38)throw new Error('Invalid decision round');
  return path.join(directory,'decisions',`${season.replace('/','-')}-round-${String(matchday).padStart(2,'0')}-${POLICY.version}.json`);
}
export async function assertNoDecision(filename) {
  try{await fs.stat(filename);throw new Error('Final decision already frozen: no new acquisition or replacement');}catch(e){if(e.code!=='ENOENT')throw e;}
}
export function validateCycleSchedule(round,schedule,now) {
  const clock=new Date(now).getTime(),events=schedule?.events;
  if(!Number.isFinite(clock)||schedule?.schema!=='lamultipla-prospective-schedule-v1'||schedule.season!==round.season||schedule.matchday!==round.matchday
    ||!Array.isArray(events)||events.length!==10||!Array.isArray(round.fixtureIds)||fingerprint([...round.fixtureIds].sort())!==fingerprint(events.map(e=>e.fixtureId).sort())
    ||new Set(events.map(e=>e.fixtureId)).size!==10||new Set(events.flatMap(e=>[canonicalTeam(e.home),canonicalTeam(e.away)])).size!==20
    ||events.some(e=>!/^[A-Za-z0-9_-]+$/.test(e.fixtureId)||typeof e.home!=='string'||!e.home.trim()||typeof e.away!=='string'||!e.away.trim()
      ||!Number.isFinite(Date.parse(e.kickoffUtc))||Date.parse(e.kickoffUtc)<Date.parse(round.fromUtc)||Date.parse(e.kickoffUtc)>=Date.parse(round.toUtc))
    ||events.every(e=>Date.parse(e.kickoffUtc)<=clock+POLICY.freezeBufferMinutes*60000))throw new Error('Schedule/round must identify ten distinct confirmed fixtures before acquisition');
}
export function createDecision({journal,report,study,assessment={},maxLegs=4,combinedPrices=[],now=new Date(),provenance={}}) {
  const opportunities=screenOpportunities({journal,report,study,assessment,now}),selector=selectCombination(opportunities,{maxLegs,combinedPrices,now});
  return {schema:'lamultipla-shadow-decision-v1',id:`${journal.manifest.season.replace('/','-')}-round-${journal.manifest.matchday}-${POLICY.version}`,
    generatedAtUtc:new Date(now).toISOString(),round:{season:journal.manifest.season,matchday:journal.manifest.matchday},
    policy:POLICY,policySha256:digest(POLICY),modelVersion:journal.modelVersion,journalId:journal.id,journalSha256:digest(journal),reportSha256:digest(report),
    studySha256:digest(study),assessmentSha256:digest(assessment),provenance,opportunities,selector,decision:selector.decision,
    noBetCause:selector.cause,experimental:true,operationallyApproved:false,actualStakeEUR:0,noPublication:true};
}
export async function freezeForwardForecast({report,schedule,registry,dataset=registry.dataset,root,clock=()=>new Date()}) {
  const manifest=report?manifestFromReport(report,schedule):{
    schema:'lamultipla-round-manifest-v1',season:schedule.season,matchday:schedule.matchday,scheduleSource:schedule.scheduleSource,
    identityBasis:'confirmed_schedule_pending_quote_report_check',events:schedule.events.map(e=>({fixtureId:e.fixtureId,home:canonicalTeam(e.home),away:canonicalTeam(e.away),kickoffUtc:e.kickoffUtc,season:schedule.season,matchday:schedule.matchday}))};
  if(!report)validateCycleSchedule({season:schedule.season,matchday:schedule.matchday,fixtureIds:manifest.events.map(e=>e.fixtureId),
    fromUtc:manifest.events.map(e=>e.kickoffUtc).sort()[0],toUtc:new Date(Math.max(...manifest.events.map(e=>Date.parse(e.kickoffUtc)))+1).toISOString()},schedule,clock());
  const filename=path.join(root,'.local/model/prospective/journals',journalId(manifest)+'.json');
  try {const journal=await readSnapshot(filename);
    if(digest(journal.manifest.events)!==digest(manifest.events))throw new Error('Existing frozen forecast/schedule conflict');
    return {journal,filename,reused:true};
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const startedAtUtc=new Date(clock()).toISOString(),validated=validateCurrentDataset(dataset,startedAtUtc);
  if(Date.parse(registry.study.validationCompletedAtUtc)>Date.parse(startedAtUtc))throw new Error('Study not observed yet');
  const trainingCutoffUtc=manifest.events.map(e=>e.kickoffUtc.slice(0,7)).sort()[0]+'-01T00:00:00.000Z';
  if(Date.parse(trainingCutoffUtc)>Date.parse(startedAtUtc))throw new Error('Training cutoff in future');
  const batch=batchForecast(validated.dataset.rows,trainingCutoffUtc,manifest),generatedAtUtc=new Date(clock()).toISOString();
  if(Date.parse(generatedAtUtc)<Date.parse(startedAtUtc))throw new Error('Forecast clock moved backwards');
  const journal=sealJournal(batch,manifest,{studySha256:fingerprint(registry.study),datasetSha256:validated.sha256,
    sourceCommit:validated.dataset.commit,sourceFiles:validated.dataset.files,datasetAcquiredAtUtc:validated.dataset.acquiredAtUtc,
    startedAtUtc,...registry.identity,forecastPurpose:'prospective_shadow_not_operational'},generatedAtUtc);
  await writeExclusive(filename,journal);return {journal,filename,reused:false};
}
export async function persistDecision(decision,directory,{preview=false}={}) {
  const filename=preview?path.join(directory,'previews',randomUUID()+'.json'):decisionPath(directory,decision.round.season,decision.round.matchday);
  const snapshot={...decision,final:!preview};const sha256=await writeExclusive(filename,snapshot);return {filename,sha256,decision:snapshot};
}
