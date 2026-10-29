import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256,normalizeSeason} from '../goals/data.mjs';
import {GENERAL_POLICY} from '../decision/policy.mjs';
import {CALENDAR_LICENSE_SHA256} from '../orchestration/calendar-discovery.mjs';
import {readSnapshot,writeExclusive,digest} from './store.mjs';
import {evaluateJournal} from './evaluate.mjs';

export const G6_PATHS=Object.freeze({journal:'.local/model/prospective/journals/2026-27-round-06-goals-v1-b630b78.json',
  baseline:'.local/model/prospective/markets/2026-27-round-06-goals-v1-b630b78/id1000002371945294.json'});
export function requireG6Due(now){
  const at=new Date(now).getTime();
  if(!Number.isFinite(at)||at<Date.parse(GENERAL_POLICY.protectedPilot.evaluationFromUtc))throw new Error('G6_NOT_DUE');
}
export async function inspectOriginalG6(root,{now=new Date()}={}){
  const journal=await readSnapshot(path.join(root,G6_PATHS.journal)),baseline=await readSnapshot(path.join(root,G6_PATHS.baseline));
  // Integrity only, at the actual clock. Do not invoke scoring for inspection.
  const pilot=GENERAL_POLICY.protectedPilot;
  if(!Number.isFinite(new Date(now).getTime())||journal.id!==pilot.id||digest(journal)!==pilot.journalSha256
    ||journal.provenance?.cohortEligible===false||baseline.journalId!==journal.id||baseline.compatible!==true
    ||digest(baseline)!=='199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990'
    ||journal.entries.some(({entrySha256,...entry})=>entrySha256!==digest(entry))
    ||!journal.entries.some(e=>e.fixtureId===baseline.fixtureId&&e.entrySha256===baseline.entrySha256))throw new Error('G6_ENTRY_INTEGRITY');
  const fileHashes=Object.fromEntries(await Promise.all(Object.entries(G6_PATHS).map(async([k,p])=>[k,sha256(await fs.readFile(path.join(root,p)))])));
  return {journal,baseline,fileHashes,summary:{status:new Date(now)>=new Date(GENERAL_POLICY.protectedPilot.evaluationFromUtc)?'DUE_REQUIRES_RECORD':'WAITING_UNTIL_15_OCTOBER',
    journalId:journal.id,journalSha256:digest(journal),baselineSha256:digest(baseline),entryHashesVerified:true,
    counts:journal.counts,readOnly:true,evaluationExecuted:false}};
}
export async function captureOriginalResults({season,fetchImpl=fetch,clock=()=>new Date()}={}){
  const requests=[],rawFiles=[];
  const get=async(url,max,name)=>{
    const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'LaMultipla-original-results-check'}});
    requests.push({url,status:response.status});if(!response.ok)throw new Error('G6_SOURCE_UNAVAILABLE');
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>max)throw new Error('G6_SOURCE_INVALID');
    rawFiles.push({name,bytes});return bytes;
  };
  if(!/^\d{4}\/\d{2}$/.test(season))throw new Error('G6_SOURCE_INVALID');
  try{
    const metadataBytes=await get('https://api.github.com/repos/openfootball/football.json/commits/master',262144,'commit.json'),metadata=JSON.parse(metadataBytes.toString('utf8'));
    if(!/^[a-f0-9]{40}$/.test(metadata.sha))throw new Error('G6_SOURCE_INVALID');
    const base=`https://raw.githubusercontent.com/openfootball/football.json/${metadata.sha}/`;
    const license=await get(base+'LICENSE.md',32768,'LICENSE.md');if(sha256(license)!==CALENDAR_LICENSE_SHA256)throw new Error('G6_LICENSE_REVIEW_REQUIRED');
    const relative=season.replace('/','-')+'/it.1.json',body=await get(base+relative,1024*1024,'it.1.json'),acquiredAtUtc=new Date(clock()).toISOString();
    const normalized=normalizeSeason(JSON.parse(body.toString('utf8')),season.replace('/','-'),acquiredAtUtc);
    return {observation:{schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:metadata.sha,
      sourceCommitAtUtc:metadata.commit?.committer?.date??null,url:base+relative,rawSha256:sha256(body),licenseSha256:sha256(license),acquiredAtUtc,
      rows:normalized.rows,audit:normalized.audit,pointInTimeClaim:'Observed now; no historical publication claim'},rawFiles,requests};
  }catch(error){throw Object.assign(new Error(['G6_LICENSE_REVIEW_REQUIRED','G6_SOURCE_UNAVAILABLE'].includes(error.message)?error.message:'G6_SOURCE_INVALID'),{requests,rawFiles});}
}
// Dependency injection is for synthetic tests; the CLI has no fake clock/source option.
export async function recordOriginalG6(root,{clock=()=>new Date(),capture=captureOriginalResults,inspect=inspectOriginalG6}={}){
  const startedAtUtc=new Date(clock()).toISOString();requireG6Due(startedAtUtc);
  const original=await inspect(root,{now:startedAtUtc}),id=randomUUID(),base=path.join(root,'.local/model/prospective'),directory=path.join(base,'checks',original.journal.id,id);
  // Durable intent records a crash/interruption; never resume as if acquisition succeeded.
  await writeExclusive(path.join(directory,'intent.json'),{schema:'lamultipla-original-check-intent-v1',startedAtUtc,journalSha256:digest(original.journal),baselineSha256:digest(original.baseline)});
  let captured=null,sourceFailure=null,partial=null;
  try{captured=await capture({season:original.journal.manifest.season,clock});}
  catch(error){sourceFailure=['G6_LICENSE_REVIEW_REQUIRED','G6_SOURCE_UNAVAILABLE','G6_SOURCE_INVALID'].includes(error.message)?error.message:'SOURCE_ACQUISITION_FAILED_OR_INVALID';
    partial={rawFiles:error.rawFiles??[],requests:error.requests??[]};}
  const checkedAtUtc=new Date(clock()).toISOString();requireG6Due(checkedAtUtc);
  if(Date.parse(checkedAtUtc)<Date.parse(startedAtUtc))throw new Error('G6_CLOCK_MOVED_BACKWARDS');
  const again=await inspect(root,{now:checkedAtUtc});if(digest(again.fileHashes)!==digest(original.fileHashes))throw new Error('G6_ORIGINAL_CHANGED_DURING_CHECK');
  let evaluation=null,resultsFile=null,evaluationFile=null;
  for(const file of captured?.rawFiles??partial?.rawFiles??[]){if(!['commit.json','LICENSE.md','it.1.json'].includes(file.name))throw new Error('G6_RAW_FILE_INVALID');
    await fs.mkdir(path.join(directory,'raw'),{recursive:true});await fs.writeFile(path.join(directory,'raw',file.name),file.bytes,{flag:'wx',mode:0o600});}
  if(captured){
    const observation=captured.observation;
    if(Date.parse(observation.acquiredAtUtc)<Date.parse(startedAtUtc))throw new Error('G6_STALE_CAPTURE');
    evaluation=evaluateJournal(original.journal,observation,{evaluatedAtUtc:checkedAtUtc,markets:[original.baseline]});
    resultsFile=path.join(directory,'results.json');await writeExclusive(resultsFile,observation);
    evaluationFile=path.join(base,'evaluations',original.journal.id,digest(observation)+'.json');await writeExclusive(evaluationFile,evaluation);
  }
  const record={schema:'lamultipla-original-g6-check-v1',startedAtUtc,checkedAtUtc,journalSha256:digest(original.journal),baselineSha256:digest(original.baseline),
    originalFileHashes:original.fileHashes,status:sourceFailure?'CHECK_RECORDED_SOURCE_UNAVAILABLE':evaluation.counts.pending?'EVALUATED_WITH_PENDING':'EVALUATED_AVAILABLE_RESULTS',
    sourceFailure,resultsSha256:captured?digest(captured.observation):null,evaluationSha256:evaluation?digest(evaluation):null,
    counts:evaluation?.counts??{planned:original.journal.entries.length,settled:0,pending:original.journal.counts.prospective,marketPaired:0},
    pending:evaluation?.pending??original.journal.entries.filter(e=>e.status==='prospective').map(e=>({fixtureId:e.fixtureId,reason:'source_unavailable_not_scored'})),
    requests:captured?.requests??partial?.requests??[],originalForecastUnchanged:true,supplementalSourceUsed:false,actualStakeEUR:0};
  const recordFile=path.join(directory,'check.json');await writeExclusive(recordFile,record);
  return {record,recordFile,resultsFile,evaluationFile};
}
