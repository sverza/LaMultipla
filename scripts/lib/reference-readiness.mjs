import fs from 'node:fs/promises';
import path from 'node:path';
import {readSnapshot,verifyEnvelope,digest} from './prospective/store.mjs';
import {readRegistry} from './shadow/registry.mjs';
import {loadJson} from './private-store.mjs';
import {requireRegisteredCode} from './engine/registry.mjs';
import {privateInput} from './orchestration/analysis-plan.mjs';
import {discoverCalendar} from './orchestration/calendar-discovery.mjs';
import {reconcileCalendar} from './orchestration/round-manager.mjs';
import {assessReferenceData} from './g8-preparation.mjs';
import {canonicalTeam,sha256,trainingBefore} from './goals/data.mjs';
import {PROGRESSIVE_POLICY} from './orchestration/progressive-policy.mjs';
import {validateSeriesApproval,referenceWindowBounds,verifyReferenceReceipt} from './reference-series.mjs';
import {writeSame} from './shadow/progressive.mjs';
const iso=v=>Number.isFinite(Date.parse(v));
const eventsKey=events=>digest(events.map(e=>[canonicalTeam(e.home),canonicalTeam(e.away),new Date(e.kickoffUtc).toISOString()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));

export function validateReferenceProposal(p){
 const rounds=[];let year=2026,round=8;for(let n=0;n<60;n++){rounds.push({season:`${year}/${String(year+1).slice(-2)}`,matchday:round,expectedEvents:10});if(++round===39){year++;round=1;}}
 const evaluation={primary:['btts','over2.5'],minPaired:500,minForecastCoverage:.9,minResultsCoverage:.95,bonferroniConfidence:.9875,baselineConfidence:.95,closeAfterLastKickoffHours:48,interims:'DESCRIPTIVE_ONLY',activationRequiresSeparateApproval:true};
 if(p?.schema!=='lamultipla-reference-cohort-proposal-v1'||p.id!=='reference-g8-20261023-v1'||p.active!==false||p.state!=='DRAFT_REQUIRES_USER_APPROVAL'
  ||p.firstSeason!=='2026/27'||p.firstMatchday!==8||!iso(p.createdAtUtc)||p.sourceRole!=='A'||p.source!=='openfootball/football.json'
  ||p.initialCutoffUtc!=='2026-10-01T00:00:00.000Z'||p.plannedEvents!==600||digest(p.plannedRounds)!==digest(rounds)
  ||digest(p.evaluation)!==digest(evaluation)||digest(p.deadlinePolicy)!==digest(PROGRESSIVE_POLICY)
  ||p.supplementalResultsAllowed!==false||p.challengerAllowed!==false||p.originalCohortChanged!==false
  ||p.firstRoundEvents?.length!==10||new Set(p.firstRoundEvents.flatMap(e=>[canonicalTeam(e.home),canonicalTeam(e.away)])).size!==20
  ||p.firstRoundEvents.some(e=>!iso(e.kickoffUtc))||p.models?.length!==3
  ||digest(p.models.map(m=>m.id).sort())!==digest(['bivariate-v2','dc-v2','goals-v1']))throw Error('REFERENCE_PROPOSAL_FRAME_OR_PROTOCOL_INVALID');
 return p;
}

export async function loadReferencePlan(root,filename,{allowDraft=false}={}){
 const plan=await readSnapshot(await privateInput(root,filename));
 if(plan.schema!=='lamultipla-reference-series-plan-v1'&&!(allowDraft&&plan.schema==='lamultipla-reference-series-plan-TEMPLATE-NOT-EXECUTABLE-v1'))throw Error('REFERENCE_SERIES_PLAN_INVALID');
 const sealed=async key=>plan[key]?readSnapshot(await privateInput(root,plan[key])):null;
 const proposal=await sealed('proposalFile');
 validateReferenceProposal(proposal);
 if(plan.proposalSha256&&plan.proposalSha256!==digest(proposal))throw Error('REFERENCE_PROPOSAL_LINK_CHANGED');
 const registry=await readRegistry(root,await privateInput(root,plan.studyV1File),loadJson);
 let schedule=null;if(plan.scheduleFile){const v=await loadJson(await privateInput(root,plan.scheduleFile));schedule=v?.schema==='lamultipla-prospective-envelope-v1'?verifyEnvelope(v):v;}
 const input={root,proposal,approval:await sealed('approvalFile'),calendar:await sealed('calendarFile'),dataset:await sealed('datasetFile'),study:await sealed('studyV2File'),registry,schedule};
 if(plan.inputHashes)for(const [key,hash] of Object.entries(plan.inputHashes))if(digest(input[key])!==hash)throw Error('REFERENCE_PLAN_INPUT_CHANGED');
 return {plan,input};
}

export async function inspectReferenceReadiness(input,{now=new Date(),verifyCode=requireRegisteredCode,verifyReceipt=verifyReferenceReceipt}={}){
 const checks=[],at=new Date(now).getTime();if(!Number.isFinite(at))throw Error('REFERENCE_CLOCK_INVALID');
 const run=async(name,fn)=>{try{const evidence=await fn();checks.push({name,category:'A',status:'READY',evidence});return evidence;}
  catch(e){checks.push({name,category:'C',status:'BLOCKED',reason:/^[A-Z_]+$/.test(e.message)?e.message:'INTEGRITY_OR_SCHEMA_CHECK_FAILED'});return null;}};
 const p=await run('proposal',()=>{validateReferenceProposal(input.proposal);return {id:input.proposal.id,sha256:digest(input.proposal),active:false,rounds:60,events:600};});
 const window=p?referenceWindowBounds({events:input.proposal.firstRoundEvents}):null;
 await run('registeredModels',async()=>{
  await verifyCode(input.root,input.study);
  for(const [id,study] of [['goals-v1',input.registry.study],['dc-v2',input.study],['bivariate-v2',input.study]])if(input.proposal.models.find(m=>m.id===id)?.studySha256!==digest(study))throw Error('REGISTERED_STUDY_CHANGED');
  return {v1StudySha256:digest(input.registry.study),v2StudySha256:digest(input.study),codeVerified:true};
 });
 const data=await run('referenceData',()=>{
  const d=assessReferenceData(input.dataset,{events:input.proposal.firstRoundEvents,firstKickoffUtc:input.proposal.firstRoundEvents.map(e=>e.kickoffUtc).sort()[0],season:input.proposal.firstSeason},{now});
  if(!d.historySufficient||d.targetLeakageDetected)throw Error('REFERENCE_DATA_HISTORY_OR_LEAKAGE');
  if(digest(trainingBefore(input.dataset.rows,d.cutoffUtc))!==digest(trainingBefore(input.registry.dataset.rows,d.cutoffUtc)))throw Error('REFERENCE_ORIGINAL_TRAINING_CHANGED');
  return {...d,originalTrainingUnchanged:true,validUntilUtc:new Date(Date.parse(input.dataset.acquiredAtUtc)+72*3600000).toISOString(),freshThroughWindowClose:window?Date.parse(input.dataset.acquiredAtUtc)+72*3600000>=Date.parse(window.closesAtUtc):false};
 });
 if(data&&!data.datasetObservationFresh)checks.push({name:'datasetFreshness',category:'B',status:'RECONFIRM_REQUIRED',reason:'DATASET_STALE_NEW_OBSERVATION_REQUIRED'});
 if(!input.approval)checks.push({name:'approval',category:'B',status:'PENDING_USER',reason:'COHORT_AND_FREEZE_APPROVAL_REQUIRED'});
 else await run('approval',()=>{validateSeriesApproval(input.proposal,input.approval,now);return {sha256:digest(input.approval),expiresAtUtc:input.approval.expiresAtUtc};});
 if(!input.schedule||!input.calendar)checks.push({name:'calendar',category:'B',status:'FRESH_INPUT_REQUIRED',reason:'TEN_ODDSPAPI_IDS_AND_OFFICIAL_RECONFIRMATION_REQUIRED'});
 else await run('calendar',()=>{
  if(eventsKey(input.schedule.events)!==eventsKey(input.proposal.firstRoundEvents))throw Error('PROPOSED_EVENTS_CHANGED');
  const r=reconcileCalendar(input.schedule,input.calendar,now);if(r.schedule.events.some(e=>e.status!=='scheduled'||r.discovered.providerFixtures.find(f=>f.fixtureId===e.fixtureId)?.statusId!==0))throw Error('CALENDAR_DISCREPANCY');
  return {events:10,providerObservedAtUtc:input.calendar.observedAtUtc,officialConfirmedAtUtc:input.schedule.source.confirmedAtUtc};
 });
 const receipt=await run('receipt',()=>verifyReceipt(input.root));
 if(receipt?.status==='PARTIAL_REQUIRES_REVIEW')checks.push({name:'partialFreeze',category:'C',status:'BLOCKED',reason:'PRESERVE_PARTIAL_ARTIFACTS_REVIEW_BEFORE_RESUME'});
 if(window&&at<Date.parse(window.opensAtUtc))checks.push({name:'window',category:'B',status:'WAIT_FOR_WINDOW',reason:'NOT_YET_OPEN'});
 if(window&&at>=Date.parse(window.closesAtUtc))checks.push({name:'window',category:'C',status:'BLOCKED',reason:'WINDOW_CLOSED_NO_RETROACTIVE_FREEZE'});
 const state=checks.some(c=>c.category==='C')?'BLOCKED':checks.some(c=>c.category==='B')?'READY_CON_PREREQUISITI_TEMPORALI':'READY';
 return {schema:'lamultipla-reference-readiness-v1',observedAtUtc:new Date(now).toISOString(),state,checks,window,
  windowState:!window?'UNKNOWN':at<Date.parse(window.opensAtUtc)?'NOT_YET_OPEN':at>=Date.parse(window.closesAtUtc)?'CLOSED':'OPEN',
  readOnly:true,cohortActivated:false,forecastExecuted:false,providerRequests:0,pitchRequests:0,deliveryExecuted:false,refitExecuted:false};
}

// Build a future executable manifest only from already acquired, fresh evidence.
// No network/key access and no approval creation; callers supply the real grant.
export async function assembleReferenceSchedule({proposal,calendar,official,documentBytes,now=new Date()}){
 validateReferenceProposal(proposal);const at=new Date(now).getTime();
 if(official?.schema!=='lamultipla-reference-official-reconfirmation-v1'||official.season!==proposal.firstSeason||official.matchday!==8
  ||!official.reviewer?.trim()||!iso(official.observedAtUtc)||!iso(official.reviewedAtUtc)
  ||Date.parse(official.observedAtUtc)>Date.parse(official.reviewedAtUtc)||Date.parse(official.reviewedAtUtc)>at
  ||at-Date.parse(official.observedAtUtc)>86400000||!Buffer.isBuffer(documentBytes)||sha256(documentBytes)!==official.documentSha256
  ||!Array.isArray(official.events)||eventsKey(official.events)!==eventsKey(proposal.firstRoundEvents))throw Error('REFERENCE_OFFICIAL_EVIDENCE_REQUIRED');
 const discovery=discoverCalendar(calendar.source,calendar.fixtures,{now});
 const round=discovery.rounds.find(r=>r.season===proposal.firstSeason&&r.matchday===8);
 if(!round||eventsKey(round.events)!==eventsKey(proposal.firstRoundEvents))throw Error('REFERENCE_PROVIDER_IDENTITY_REQUIRED');
 const schedule={schema:'lamultipla-prospective-schedule-v1',season:proposal.firstSeason,matchday:8,
  scheduleSource:'OFFICIAL_LEGA_CC0_ODDSPAPI_EXACT_RECONCILIATION',events:round.events,
  source:{officialUrl:official.officialUrl,officialPdfUrl:official.officialPdfUrl,confirmedAtUtc:official.observedAtUtc,
   officialEvidenceSha256:digest(official),officialDocumentSha256:official.documentSha256,
   providerObservedAtUtc:calendar.observedAtUtc,providerFixturesSha256:digest(calendar.fixtures)}};
 const reconciled=reconcileCalendar(schedule,calendar,now);if(reconciled.schedule.events.some(e=>e.status!=='scheduled'))throw Error('REFERENCE_CALENDAR_DISCREPANCY');
 return schedule;
}

export async function privateOutputDirectory(root,out){
 const base=await fs.realpath(path.join(root,'.local')),target=path.resolve(root,out);
 const inside=p=>{const rel=path.relative(base,p);return Boolean(rel)&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
 if(!inside(target))throw Error('REFERENCE_PRIVATE_OUTPUT_REQUIRED');
 let ancestor=target;while(true){try{if(!inside(await fs.realpath(ancestor))&&await fs.realpath(ancestor)!==base)throw Error('REFERENCE_PRIVATE_OUTPUT_REQUIRED');break;}
  catch(e){if(e.code!=='ENOENT')throw e;ancestor=path.dirname(ancestor);}}
 await fs.mkdir(target,{recursive:true});if(!inside(await fs.realpath(target)))throw Error('REFERENCE_PRIVATE_OUTPUT_REQUIRED');return target;
}
export async function writeReferencePlan({root,out,input,schedule,paths,now=new Date(),verifyCode=requireRegisteredCode}){
 validateSeriesApproval(input.proposal,input.approval,now);
 const readiness=await inspectReferenceReadiness({...input,schedule},{now,verifyCode});
 if(readiness.checks.some(c=>c.category==='C'||c.category==='B'&&c.name!=='window'))throw Error('REFERENCE_ASSEMBLY_PREFLIGHT_BLOCKED');
 const directory=await privateOutputDirectory(root,out),scheduleFile=path.join(directory,'schedule.private.json');
 await writeSame(scheduleFile,schedule);
 const plan={schema:'lamultipla-reference-series-plan-v1',proposalSha256:digest(input.proposal),...paths,scheduleFile,
  inputHashes:Object.fromEntries(['proposal','approval','calendar','dataset','study','schedule'].map(k=>[k,digest(k==='schedule'?schedule:input[k])]))};
 const filename=path.join(directory,'reference-plan.private.json');await writeSame(filename,plan);return {file:filename,sha256:digest(plan),readiness,forecastProduced:false,cohortActivated:false};
}
