import path from 'node:path';
import {privateLock} from './private/process-lock.mjs';
import {writeExclusive,readSnapshot,digest} from './prospective/store.mjs';
import {reconcileCalendar} from './orchestration/round-manager.mjs';
import {validateCurrentDataset} from './shadow/registry.mjs';
import {requireRegisteredCode} from './engine/registry.mjs';
import {freezeForwardForecast} from './shadow/pipeline.mjs';
import {freezeEngine} from './engine/forecast.mjs';
import {trainingBefore} from './goals/data.mjs';
const optional=async p=>{try{return await readSnapshot(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export function validateSeriesApproval(proposal,approval,now){
 const at=new Date(now).getTime();if(proposal?.schema!=='lamultipla-reference-cohort-proposal-v1'||proposal.active!==false||proposal.state!=='DRAFT_REQUIRES_USER_APPROVAL'
  ||proposal.id!=='reference-g8-20261023-v1'||approval?.schema!=='lamultipla-reference-series-approval-v1'||approval.proposalSha256!==digest(proposal)
  ||approval.cohortApproved!==true||approval.freezeAuthorized!==true||approval.round!==8||approval.sourceRole!=='A'||!approval.reviewer?.trim()
  ||!Number.isFinite(Date.parse(approval.approvedAtUtc))||Date.parse(approval.approvedAtUtc)<Date.parse(proposal.createdAtUtc)||Date.parse(approval.approvedAtUtc)>at
  ||!Number.isFinite(Date.parse(approval.expiresAtUtc))||Date.parse(approval.expiresAtUtc)<=at)throw Error('REFERENCE_SERIES_EXPLICIT_APPROVAL_REQUIRED');
}
export function referenceWindow(schedule,now){
 const times=schedule.events?.map(e=>Date.parse(e.kickoffUtc))??[],at=new Date(now).getTime();
 if(times.length!==10||times.some(t=>!Number.isFinite(t)))throw Error('REFERENCE_SERIES_SCHEDULE_INVALID');
 const first=Math.min(...times),opens=first-360*60000,closes=first-150*60000;
 if(!Number.isFinite(at)||at<opens||at>=closes)throw Error('REFERENCE_SERIES_OUTSIDE_ORIGINAL_WINDOW');
 return {opensAtUtc:new Date(opens).toISOString(),closesAtUtc:new Date(closes).toISOString()};
}
export function referenceWindowBounds(schedule){
 const first=Math.min(...(schedule?.events??[]).map(e=>Date.parse(e.kickoffUtc)));
 if(schedule?.events?.length!==10||!Number.isFinite(first))throw Error('REFERENCE_SERIES_SCHEDULE_INVALID');
 return {opensAtUtc:new Date(first-360*60000).toISOString(),closesAtUtc:new Date(first-150*60000).toISOString(),closingExclusive:true,timeZone:'Europe/Rome'};
}
export async function referenceSeriesPreflight({root,proposal,approval,schedule,calendar,dataset,registry,study,now=new Date(),verifyCode=requireRegisteredCode}){
 validateSeriesApproval(proposal,approval,now);const window=referenceWindow(schedule,now);
 if(schedule.season!==proposal.firstSeason||schedule.matchday!==8||proposal.firstMatchday!==8)throw Error('REFERENCE_SERIES_ROUND_MISMATCH');
 const pair=e=>[e.home,e.away,e.kickoffUtc],sort=a=>a.sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
 if(digest(sort(schedule.events.map(pair)))!==digest(sort(proposal.firstRoundEvents.map(pair))))throw Error('REFERENCE_SERIES_PROPOSED_EVENTS_CHANGED');
 if(proposal.models.find(m=>m.id==='goals-v1')?.studySha256!==digest(registry.study)||proposal.models.find(m=>m.id==='dc-v2')?.studySha256!==digest(study)
  ||proposal.models.find(m=>m.id==='bivariate-v2')?.studySha256!==digest(study))throw Error('REFERENCE_SERIES_STUDY_MISMATCH');
 await verifyCode(root,study);validateCurrentDataset(dataset,now);
 if(digest(trainingBefore(dataset.rows,'2026-10-01T00:00:00.000Z'))!==digest(trainingBefore(registry.dataset.rows,'2026-10-01T00:00:00.000Z')))throw Error('REFERENCE_ORIGINAL_TRAINING_CHANGED');
 if(new Date(now).getTime()-Date.parse(dataset.acquiredAtUtc)>72*3600000)throw Error('REFERENCE_SERIES_DATASET_STALE');
 const reconciled=reconcileCalendar(schedule,calendar,now);
 if(reconciled.schedule.events.some(e=>e.status!=='scheduled'||reconciled.discovered.providerFixtures.find(f=>f.fixtureId===e.fixtureId)?.statusId!==0))throw Error('REFERENCE_SERIES_CALENDAR_DISCREPANCY');
 return {schema:'lamultipla-reference-series-preflight-v1',window,proposalSha256:digest(proposal),approvalSha256:digest(approval),scheduleSha256:digest(schedule),datasetSha256:digest(dataset),
  cutoffUtc:'2026-10-01T00:00:00.000Z',models:['goals-v1','dc-v2','bivariate-v2'],sourceRole:'A',providerRequests:0,quotesRead:false,deliveryAllowed:false};
}
// Uses original freeze functions unchanged, under a NEW isolated root. No selector, quote collector or delivery is invoked.
export async function freezeReferenceSeries(input,{clock=()=>new Date(),preflight=referenceSeriesPreflight,freezeV1=freezeForwardForecast,freezeV2=freezeEngine}={}){
 // Reject unauthorized/early invocations before even creating a cohort lock
 // directory. Recheck under the lock against the actual start time.
 const initialClock=clock();await preflight({...input,now:initialClock});
 const base=path.join(input.root,'.local/research-review/cohorts/reference-g8-20261023-v1');
 return privateLock(base,async()=>{
  const start=clock();if(start<initialClock)throw Error('REFERENCE_SERIES_CLOCK_BACKWARDS');
  const check=await preflight({...input,now:start}),pin=digest({check,calendar:input.calendar,study:input.study});
  const intentFile=path.join(base,'freeze-intent.json'),receiptFile=path.join(base,'freeze-receipt.json'),old=await optional(intentFile),receipt=await optional(receiptFile);
  if(old&&old.inputSha256!==pin)throw Error('REFERENCE_SERIES_CHANGED_INPUT_OR_APPROVAL');
  if(receipt){
   if(receipt.inputSha256!==pin)throw Error('REFERENCE_SERIES_RECEIPT_INPUT_CHANGED');
   for(const kind of ['v1','v2']){
    const file=receipt[kind]?.file;if(typeof file!=='string'||path.relative(base,file).startsWith('..')||path.isAbsolute(path.relative(base,file)))throw Error('REFERENCE_SERIES_RECEIPT_PATH_INVALID');
    const journal=await readSnapshot(file);if(digest(journal)!==receipt[kind].sha256)throw Error('REFERENCE_SERIES_FROZEN_JOURNAL_CHANGED');
   }
   return {...receipt,reused:true};
  }
  if(!old)await writeExclusive(intentFile,{schema:'lamultipla-reference-series-freeze-intent-v1',inputSha256:pin,startedAtUtc:start.toISOString(),check});
  let previousClock=start;
  const boundedClock=()=>{const now=clock();if(now<previousClock)throw Error('REFERENCE_SERIES_CLOCK_BACKWARDS');referenceWindow(input.schedule,now);previousClock=now;return now;};
  const v1=await freezeV1({root:base,registry:input.registry,dataset:input.dataset,schedule:input.schedule,clock:boundedClock});
  const v2=await freezeV2({root:base,study:input.study,dataset:input.dataset,schedule:input.schedule,clock:boundedClock});
  await preflight({...input,now:boundedClock()});
  const result={schema:'lamultipla-reference-series-freeze-receipt-v1',inputSha256:pin,cohortId:input.proposal.id,proposalSha256:digest(input.proposal),
   generatedAtUtc:boundedClock().toISOString(),v1:{file:v1.filename,sha256:digest(v1.journal)},v2:{file:v2.filename,sha256:digest(v2.journal)},
   oldCohortChanged:false,providerRequests:0,quotesRead:false,deliveryExecuted:false,actualStakeEUR:0};
  await writeExclusive(receiptFile,result);return result;
 });
}
// Historical receipt verification is read-only and works after the freeze
// window. It cannot complete an intent, fit a model or authorize another run.
export async function verifyReferenceReceipt(root){
 const base=path.join(root,'.local/research-review/cohorts/reference-g8-20261023-v1');
 const intent=await optional(path.join(base,'freeze-intent.json')),receipt=await optional(path.join(base,'freeze-receipt.json'));
 if(!receipt)return {status:intent?'PARTIAL_REQUIRES_REVIEW':'NOT_FROZEN',intentPresent:Boolean(intent),forecastExecuted:false,readOnly:true};
 if(!intent||receipt.inputSha256!==intent.inputSha256||receipt.cohortId!=='reference-g8-20261023-v1')throw Error('REFERENCE_SERIES_RECEIPT_INPUT_CHANGED');
 const journals={};
 for(const kind of ['v1','v2']){
  const file=receipt[kind]?.file,relative=typeof file==='string'?path.relative(base,file):'..';
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('REFERENCE_SERIES_RECEIPT_PATH_INVALID');
  const journal=await readSnapshot(file);if(digest(journal)!==receipt[kind].sha256)throw Error('REFERENCE_SERIES_FROZEN_JOURNAL_CHANGED');
  const at=Date.parse(journal.generatedAtUtc),window=intent.check.window;
  if(!Number.isFinite(at)||at<Date.parse(window.opensAtUtc)||at>=Date.parse(window.closesAtUtc)||journal.entries?.length!==10||journal.trainingCutoffUtc!=='2026-10-01T00:00:00.000Z')throw Error('REFERENCE_SERIES_JOURNAL_TIME_OR_SCOPE_INVALID');
  journals[kind]={file,sha256:receipt[kind].sha256,generatedAtUtc:journal.generatedAtUtc,counts:journal.counts};
 }
 return {status:'FROZEN_VERIFIED',cohortId:receipt.cohortId,receiptSha256:digest(receipt),journals,readOnly:true,forecastExecuted:false,providerRequests:0,deliveryExecuted:false};
}
