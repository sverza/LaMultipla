import {digest} from '../prospective/store.mjs';
const instant=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const goals=v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=30);
export function validateManifest(manifest){
 if(!/^\d{4}\/\d{2}$/.test(manifest?.season)||Number(manifest.season.slice(5))!==(Number(manifest.season.slice(0,4))+1)%100||!Number.isInteger(manifest.matchday)||manifest.matchday<1||manifest.matchday>38
  ||!Array.isArray(manifest.events)||manifest.events.length!==10||new Set(manifest.events.map(e=>e.fixtureId)).size!==10
  ||new Set(manifest.events.flatMap(e=>[e.home,e.away])).size!==20
  ||manifest.events.some(e=>typeof e.fixtureId!=='string'||!e.fixtureId||typeof e.home!=='string'||!e.home.trim()||typeof e.away!=='string'||!e.away.trim()||!instant(e.kickoffUtc)))throw Error('RESULT_LAB_MANIFEST_INVALID');
 return manifest;
}
function validateObservation(o,clock){
 if(o?.schema!=='lamultipla-result-observations-v1'||o.source!=='openfootball/football.json'||o.license!=='CC0-1.0'
  ||!/^[a-f0-9]{40}$/.test(o.sourceCommit)||!instant(o.acquiredAtUtc)||Date.parse(o.acquiredAtUtc)>clock||!Array.isArray(o.rows)
  ||o.rows.some(r=>!/^\d{4}-\d{2}$/.test(r.season)||!/^\d{4}-\d\d-\d\d$/.test(r.date)
   ||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date
   ||typeof r.home!=='string'||!r.home||typeof r.away!=='string'||!r.away||r.home===r.away||!goals(r.goals)
   ||!instant(r.availableAtUtc)||Date.parse(r.availableAtUtc)!==Date.parse(r.date)+48*3600000))throw Error('RESULT_LAB_ORIGINAL_OBSERVATION_INVALID');
}
// Local QA only: never invokes registered evaluators, source capture, training or a writer.
export function auditOriginalAvailability(manifest,observation,{previous=[],now=new Date()}={}){
 validateManifest(manifest);const clock=new Date(now).getTime();if(!Number.isFinite(clock)||!Array.isArray(previous))throw Error('RESULT_LAB_CLOCK_OR_HISTORY_INVALID');
 for(const o of [observation,...previous])validateObservation(o,clock);
 if(previous.some(o=>Date.parse(o.acquiredAtUtc)>Date.parse(observation.acquiredAtUtc)))throw Error('RESULT_LAB_HISTORY_ORDER_INVALID');
 const season=manifest.season.replace('/','-'),pair=e=>r=>r.season===season&&r.home===e.home&&r.away===e.away;
 const rows=manifest.events.map(e=>{
  const current=observation.rows.filter(pair(e)),past=previous.flatMap(o=>o.rows.filter(pair(e))),reasons=[];
  if(current.length>1)reasons.push('DUPLICATE_OR_CONFLICTING_RESULT');
  if(!current.length)reasons.push(past.length?'PREVIOUS_RESULT_REMOVED':'RESULT_MISSING');
  const all=[...current,...past];if(new Set(all.map(r=>digest([r.date,r.goals]))).size>1)reasons.push('SOURCE_REVISION_REQUIRES_REVIEW');
  const r=current[0];
  if(r){if(r.date!==e.kickoffUtc.slice(0,10))reasons.push('DATE_MISMATCH_RESCHEDULE_EVIDENCE_REQUIRED');
   if(Date.parse(observation.acquiredAtUtc)<=Date.parse(e.kickoffUtc)||Date.parse(r.availableAtUtc)>Date.parse(observation.acquiredAtUtc))reasons.push('RESULT_NOT_YET_OBSERVED_UNDER_ORIGINAL_POLICY');}
  return {fixtureId:e.fixtureId,state:reasons.length?'PENDING_OR_WITHHELD':'AVAILABLE_IN_ORIGINAL_SOURCE',reasons};
 });
 return {schema:'lamultipla-original-result-availability-audit-v1',checkedAtUtc:new Date(clock).toISOString(),manifestSha256:digest(manifest),
  observationSha256:digest(observation),previousSha256:previous.map(digest),rows,counts:{planned:rows.length,available:rows.filter(r=>!r.reasons.length).length,pendingOrWithheld:rows.filter(r=>r.reasons.length).length},
  evaluationExecuted:false,originalsModified:false,trainingEligible:false,pointInTimeClaim:'Observed at acquisition; date+48h is a frozen policy assumption, not evidence of historical publication',providerRequests:0};
}

// Requires an explicit planned frame; never infers a new start from the first surviving journal.
export function auditRoundContinuity(planned,journals,{now=new Date()}={}){
 const clock=new Date(now).getTime();if(!Number.isFinite(clock)||!Array.isArray(planned)||!planned.length||!Array.isArray(journals))throw Error('RESULT_LAB_FRAME_REQUIRED');
 const valid=r=>/^\d{4}\/\d{2}$/.test(r?.season)&&Number(r.season.slice(5))===(Number(r.season.slice(0,4))+1)%100&&Number.isInteger(r.matchday)&&r.matchday>=1&&r.matchday<=38;
 const key=r=>r.season+':'+r.matchday;
 if(planned.some(r=>!valid(r)||!instant(r.freezeDeadlineUtc))||new Set(planned.map(key)).size!==planned.length
  ||planned.some((r,i)=>i&&(Date.parse(r.freezeDeadlineUtc)<=Date.parse(planned[i-1].freezeDeadlineUtc)
   ||(planned[i-1].matchday<38?r.season!==planned[i-1].season||r.matchday!==planned[i-1].matchday+1:Number(r.season.slice(0,4))!==Number(planned[i-1].season.slice(0,4))+1||r.matchday!==1))))throw Error('RESULT_LAB_NONCONSECUTIVE_PLAN');
 if(journals.some(j=>!valid(j)||!instant(j.generatedAtUtc)||Date.parse(j.generatedAtUtc)>clock||!/^[a-f0-9]{64}$/.test(j.journalSha256)))throw Error('RESULT_LAB_JOURNAL_METADATA_INVALID');
 const rounds=planned.map(r=>{const found=journals.filter(j=>key(j)===key(r)),authentic=found.filter(j=>j.prospectiveOriginal===true&&Date.parse(j.generatedAtUtc)<Date.parse(r.freezeDeadlineUtc));
  return {...r,state:found.length>1?'AMBIGUOUS_JOURNALS':authentic.length===1?'ORIGINAL_METADATA_PRESENT':found.length?'LATE_OR_NONORIGINAL_JOURNAL':Date.parse(r.freezeDeadlineUtc)<=clock?'MISSED_ORIGINAL_WINDOW':'AWAITING_FUTURE_WINDOW'};});
 return {schema:'lamultipla-round-continuity-audit-v1',checkedAtUtc:new Date(clock).toISOString(),plannedSha256:digest(planned),rounds,
  missed:rounds.filter(r=>r.state==='MISSED_ORIGINAL_WINDOW').length,complete:rounds.every(r=>r.state==='ORIGINAL_METADATA_PRESENT'),
  confirmationBlocked:rounds.some(r=>!['ORIGINAL_METADATA_PRESENT','AWAITING_FUTURE_WINDOW'].includes(r.state)),
  metadataOnly:true,originalProtocolGateExecuted:false,frameReanchored:false,cohortChanged:false};
}
