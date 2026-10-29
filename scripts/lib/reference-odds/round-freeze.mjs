// Provider-independent round extension; original G8 and registered model code
// are never edited. Only an explicit later approval can reach the freeze calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadSession} from '../mm-simulator-v1/read-session.mjs';
import {hashValue,hashBytes,timestamp,exactFields} from '../mm-simulator-v1/contracts.mjs';
import {recognizeCohort,hasSyntheticMarker,verifyScientificDistributions} from '../mm-simulator-v1/prospective-archive.mjs';
import {validateSeriesApproval,referenceWindow,referenceWindowBounds} from '../reference-series.mjs';
import {validateSchedule,freezeEngine} from '../engine/forecast.mjs';
import {requireRegisteredCode} from '../engine/registry.mjs';
import {modelIdentity,validateCurrentDataset} from '../shadow/registry.mjs';
import {validateReproduction} from '../prospective/freeze.mjs';
import {trainingBefore} from '../goals/data.mjs';
import {journalIssues} from '../shadow/opportunities.mjs';
import {freezeForwardForecast} from '../shadow/pipeline.mjs';
import {privateLock} from '../private/process-lock.mjs';
import {writeExclusive} from '../prospective/store.mjs';
import {extractMoviFixtureIdentities} from './moviodds-offline.mjs';
import {validateReferenceBindings,validateReferenceCalendar} from './exploratory.mjs';

export const ROUND_PACKAGE_SCHEMA='lamultipla-reference-round-package-v2';
export const ROUND_APPROVAL_SCHEMA='lamultipla-reference-round-explicit-approval-v2';
const KEYS=['proposal','cohortApproval','manifest','bindings','dataset','datasetObservation','studyV1','registryDataset','studyV2','officialInitial'];
const fail=c=>{throw Error(c);},same=(a,b)=>hashValue(a)===hashValue(b);
const identity=e=>[e.fixtureId,e.home,e.away,e.kickoffUtc];
const optional=async(session,file)=>{try{return await session.sealed(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const CODE=['scripts/lib/reference-odds/round-freeze.mjs','scripts/lib/reference-odds/exploratory.mjs',
 'scripts/lib/reference-odds/moviodds-offline.mjs','scripts/reference-round.mjs','scripts/reference-exploration.mjs',
 'scripts/lib/mm-simulator-v1/probabilities.mjs','scripts/lib/mm-simulator-v1/prospective-archive.mjs',
 'scripts/lib/mm-simulator-v1/read-session.mjs','scripts/lib/mm-simulator-v1/contracts.mjs',
 'scripts/lib/reference-series.mjs','scripts/lib/reference-readiness.mjs','scripts/lib/shadow/pipeline.mjs',
 'scripts/lib/shadow/registry.mjs','scripts/lib/shadow/opportunities.mjs','scripts/lib/private/process-lock.mjs',
 'scripts/lib/shadow/combinations.mjs','scripts/lib/orchestration/progressive-policy.mjs','docs/protocollo-analisi-progressive-v1.md',
 'scripts/lib/orchestration/calendar-discovery.mjs',
 'scripts/lib/prospective/freeze.mjs','scripts/lib/prospective/store.mjs','scripts/lib/engine/registry.mjs'];
export async function roundCodeIdentity(root){const session=createReadSession(root),files=[];
 for(const file of CODE){const r=await session.bytes(file,{code:true});files.push({file,sha256:r.reference.sha256});}
 await session.finish();return {files,sha256:hashValue(files)};
}
export function roundDirectory(root,scope){
 if(!/^[-A-Za-z0-9_]+$/.test(scope?.cohortId??'')||!/^\d{4}\/\d{2}$/.test(scope.season??'')||!Number.isInteger(scope.round)||scope.round<1||scope.round>38)fail('ROUND_SCOPE_INVALID');
 return path.join(root,'.local/research-review/cohorts',scope.cohortId,'rounds',`${scope.season.replace('/','-')}-round-${scope.round}-reference-v2`);
}
async function safeDirectory(root,dir){
 const base=path.resolve(root),relative=path.relative(path.join(base,'.local'),dir);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||await fs.realpath(base)!==base)fail('ROUND_UNSAFE_NAMESPACE');
 let cursor=base;for(const name of path.relative(base,dir).split(path.sep)){cursor=path.join(cursor,name);
  try{const s=await fs.lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory()||await fs.realpath(cursor)!==cursor)fail('ROUND_UNSAFE_NAMESPACE');}
  catch(e){if(e.code!=='ENOENT')throw e;}
 }
}
export async function assertRoundWriteNamespace(root,scope){
 const base=roundDirectory(root,scope);
 for(const dir of [base,path.join(base,'.local/model/prospective/journals'),path.join(base,'.local/model-v2/journals')])await safeDirectory(root,dir);
 return base;
}
export async function loadRoundPackage(root,filename){
 const session=createReadSession(root),planRead=await session.sealed(filename),p=planRead.payload,a={};
 if(p.schema!==ROUND_PACKAGE_SCHEMA||!timestamp(p.preparedAtUtc)||!exactFields(p.artifacts,KEYS)||p.providerIdentity!=='MOVIODDS_EXPLICIT_BINDINGS_NOT_ODDSPAPI'
  ||p.prospectivePolicyActivated!==false||p.actualStakeEUR!==0)fail('ROUND_PACKAGE_INVALID');
 for(const k of KEYS)a[k]=(await session.reference(p.artifacts[k],path.dirname(planRead.file),{sealed:false})).payload;
 recognizeCohort(a.proposal,p.scope);validateSeriesApproval(a.proposal,a.cohortApproval,a.cohortApproval.approvedAtUtc);
 if(hasSyntheticMarker(a)||p.scope.round===8)fail('ROUND_AUTHENTIC_SOURCE_OR_NAMESPACE_INVALID');
 if(a.manifest.season!==p.scope.season||a.manifest.matchday!==p.scope.round)fail('ROUND_MANIFEST_SCOPE_INVALID');
 validateSchedule(a.manifest,new Date(Math.min(...a.manifest.events.map(e=>Date.parse(e.kickoffUtc)))-86400000));
 if(a.manifest.events.some(e=>e.status!=='scheduled'))fail('ROUND_FIXTURE_STATUS_INVALID');
 validateReferenceBindings(a.manifest,a.bindings);
 const oi=a.officialInitial,or=(await session.reference(oi.receipt,path.dirname(planRead.file))).payload,
  ob=await session.bytes(oi.raw.ref,{reference:oi.raw});
 if(oi.schema!=='lamultipla-reference-official-initial-review-v1'||oi.manifestSha256!==hashValue(a.manifest)
  ||!same(oi.events,a.manifest.events)||oi.reviewRole!=='DELEGATED_TECHNICAL_REVIEW'||!oi.reviewer?.trim()
  ||!timestamp(oi.reviewedAtUtc)||!timestamp(oi.officialObservationAtUtc)||Date.parse(oi.reviewedAtUtc)<Date.parse(oi.officialObservationAtUtc)
  ||Date.parse(oi.reviewedAtUtc)>Date.parse(p.preparedAtUtc)||oi.officialObservationAtUtc!==or.observedAtUtc
  ||or.schema!=='lamultipla-public-source-observation-v1'||or.status!==200||or.error!==null||or.sha256!==ob.reference.sha256||or.bytes!==ob.bytes.length
  ||oi.sourceUrl!==or.url||or.url!=='https://images.legaseriea.it/image/private/fl_attachment/prd/emzdipx98pkg0lgeqgrt.pdf')fail('ROUND_INITIAL_OFFICIAL_LINK_INVALID');
 if(a.bindings.scope.cohortId!==p.scope.cohortId)fail('ROUND_COHORT_BINDING_INVALID');
 if(!same(referenceWindowBounds(a.manifest),p.window)||p.cutoffUtc!==a.manifest.events.map(e=>e.kickoffUtc.slice(0,7)).sort()[0]+'-01T00:00:00.000Z'
  ||p.cutoffUtc!==a.proposal.initialCutoffUtc)fail('ROUND_CUTOFF_OR_WINDOW_CHANGED');
 for(const [id,study]of [['goals-v1',a.studyV1],['dc-v2',a.studyV2],['bivariate-v2',a.studyV2]])
  if(a.proposal.models.find(m=>m.id===id)?.studySha256!==hashValue(study))fail('ROUND_REGISTERED_STUDY_CHANGED');
 const identityV1=await modelIdentity(root);validateReproduction(a.studyV1,a.registryDataset,identityV1);await requireRegisteredCode(root,a.studyV2);
 if(!same(trainingBefore(a.dataset.rows,p.cutoffUtc),trainingBefore(a.registryDataset.rows,p.cutoffUtc)))fail('ROUND_ORIGINAL_TRAINING_CHANGED');
 const o=a.datasetObservation;
 if(o.schema!=='lamultipla-cc0-reobservation-v1'||o.datasetSha256!==hashValue(a.dataset)||o.commit!==a.dataset.commit
  ||o.files?.length!==a.dataset.files.length||o.acquiredAtUtc!==a.dataset.acquiredAtUtc)fail('ROUND_DATASET_OBSERVATION_INVALID');
 for(const f of a.dataset.files){const proof=o.files.find(x=>x.path===f.path);if(!proof)fail('ROUND_DATASET_FILE_MISSING');
  const receipt=(await session.reference(proof.receipt,path.dirname(planRead.file))).payload;
  const raw=await session.bytes(proof.raw.ref,{reference:proof.raw});
  if(receipt.schema!=='lamultipla-public-source-observation-v1'||receipt.status!==200||receipt.error!==null||receipt.sha256!==f.sha256
   ||raw.reference.sha256!==f.sha256||receipt.bytes!==raw.bytes.length
   ||receipt.url!==`https://raw.githubusercontent.com/openfootball/football.json/${a.dataset.commit}/${f.path}`
   ||!timestamp(receipt.observedAtUtc)||Date.parse(receipt.observedAtUtc)>Date.parse(a.dataset.acquiredAtUtc))fail('ROUND_DATASET_SOURCE_UNVERIFIABLE');
  if(f.path===p.scope.season.replace('/','-')+'/it.1.json')validateReferenceCalendar(a.manifest,{schema:'lamultipla-calendar-public-source-v1',
   source:a.dataset.source,license:a.dataset.license,licenseSha256:a.dataset.licenseSha256,commit:a.dataset.commit,path:f.path,
   fetchedAtUtc:receipt.observedAtUtc,body:raw.bytes.toString('utf8'),bodySha256:raw.reference.sha256},receipt.observedAtUtc);
 }
 const code=await roundCodeIdentity(root);if(!same(code,p.code))fail('ROUND_PREPARED_CODE_CHANGED');
 await session.finish();return {root,plan:p,artifacts:a,planReference:planRead.reference,session,registry:{study:a.studyV1,dataset:a.registryDataset,identity:identityV1}};
}
export function validateRoundApproval(plan,approval,now){
 if(approval?.schema!==ROUND_APPROVAL_SCHEMA||approval.freezeAuthorized!==true||approval.registeredFreezeFitsAuthorized!==true
  ||!same(approval.scope,plan.scope)||approval.packageSha256!==hashValue(plan)||approval.sourceRole!=='A'
  ||approval.provenance!=='EXPLICIT_USER_APPROVAL_LOCAL_RECORD'||typeof approval.reviewer!=='string'||!approval.reviewer.trim()
  ||!timestamp(approval.approvedAtUtc)||!timestamp(approval.expiresAtUtc)||!timestamp(plan.preparedAtUtc)
  ||Date.parse(approval.approvedAtUtc)<Date.parse(plan.preparedAtUtc)||Date.parse(approval.approvedAtUtc)>Date.parse(now)
  ||Date.parse(approval.expiresAtUtc)<=Date.parse(now)||approval.expiresAtUtc!==plan.window.closesAtUtc)
  fail('ROUND_NEW_EXPLICIT_APPROVAL_REQUIRED');
}
export async function validateFreezeEvidenceSources(loaded,e,directory,now){
 const {session,plan,artifacts:a}=loaded;
 if(e.schema!=='lamultipla-reference-round-execution-evidence-v2'||e.packageSha256!==hashValue(plan)
  ||e.manifestSha256!==hashValue(a.manifest)||e.reviewRole!=='DELEGATED_TECHNICAL_REVIEW'
  ||typeof e.reviewer!=='string'||!e.reviewer.trim()||!timestamp(e.reviewedAtUtc)||Date.parse(e.reviewedAtUtc)>Date.parse(now))fail('ROUND_EXECUTION_EVIDENCE_INVALID');
 const official=(await session.reference(e.officialReceipt,directory)).payload,raw=await session.bytes(e.officialRaw.ref,{reference:e.officialRaw});
 if(official.schema!=='lamultipla-public-source-observation-v1'||official.status!==200||official.error!==null
  ||official.sha256!==raw.reference.sha256||official.bytes!==raw.bytes.length
  ||official.url!=='https://images.legaseriea.it/image/private/fl_attachment/prd/emzdipx98pkg0lgeqgrt.pdf'
  ||!timestamp(official.observedAtUtc)||Date.parse(official.observedAtUtc)>Date.parse(e.reviewedAtUtc)
  ||Date.parse(now)-Date.parse(official.observedAtUtc)>24*3600000||Date.parse(now)-Date.parse(e.reviewedAtUtc)>24*3600000
  ||!same(e.officialEvents,a.manifest.events))fail('ROUND_OFFICIAL_RECONFIRMATION_REQUIRED');
 const cr=(await session.reference(e.cc0Receipt,directory)).payload,cb=await session.bytes(e.cc0Raw.ref,{reference:e.cc0Raw}),
  cc0Path=plan.scope.season.replace('/','-')+'/it.1.json';
 if(cr.schema!=='lamultipla-public-source-observation-v1'||cr.status!==200||cr.error!==null||cr.sha256!==cb.reference.sha256
  ||cr.sha256!==a.dataset.files.find(f=>f.path===cc0Path)?.sha256
  ||cr.bytes!==cb.bytes.length||cr.url!==`https://raw.githubusercontent.com/openfootball/football.json/${a.dataset.commit}/${cc0Path}`
  ||!timestamp(cr.observedAtUtc)||Date.parse(cr.observedAtUtc)>Date.parse(e.reviewedAtUtc))fail('ROUND_CC0_CALENDAR_SOURCE_INVALID');
 validateReferenceCalendar(a.manifest,{schema:'lamultipla-calendar-public-source-v1',source:a.dataset.source,license:a.dataset.license,
  licenseSha256:a.dataset.licenseSha256,commit:a.dataset.commit,path:cc0Path,fetchedAtUtc:cr.observedAtUtc,
  body:cb.bytes.toString('utf8'),bodySha256:cb.reference.sha256},now);
 const mr=(await session.reference(e.moviReceipt,directory)).payload,mw=await session.bytes(e.moviRaw.ref,{reference:e.moviRaw});
 const identities=extractMoviFixtureIdentities({wireBytes:mw.bytes,receipt:mr,rawReference:mw.reference,evaluatedAtUtc:now});
 if(Date.parse(now)-Date.parse(mr.completedAtUtc)>60*60000)fail('ROUND_PROVIDER_IDENTITIES_STALE');
 for(const b of a.bindings.events){const f=identities.fixtures.find(x=>x.sourceFixtureId===b.sourceFixtureId);
  if(!f||f.inPlay!==false||!same([f.home,f.away,f.kickoffUtc],[b.sourceHome,b.sourceAway,b.kickoffUtc]))fail('ROUND_PROVIDER_FIXTURE_DISCORDANCE');
 }
 await session.finish();return {officialObservedAtUtc:official.observedAtUtc,cc0ObservedAtUtc:cr.observedAtUtc,providerIdentitiesObservedAtUtc:mr.completedAtUtc};
}
export async function loadFreezeEvidence(loaded,filename,now){
 const r=await loaded.session.json(filename),calendar=await validateFreezeEvidenceSources(loaded,r.payload,path.dirname(r.file),now);
 return {reference:r.reference,payload:r.payload,calendar};
}
export async function roundPreflight(root,planFile,{approvalFile,evidenceFile,now=new Date().toISOString()}={}){
 const loaded=await loadRoundPackage(root,planFile),{artifacts:a,plan:p,session}=loaded;
 if(!timestamp(now))fail('ROUND_CLOCK_INVALID');
 const approvalRead=approvalFile?await session.json(approvalFile):null;
 validateRoundApproval(p,approvalRead?.payload,now);referenceWindow(a.manifest,now);validateSchedule(a.manifest,now);
 validateCurrentDataset(a.dataset,now);if(Date.parse(now)-Date.parse(a.dataset.acquiredAtUtc)>72*3600000)fail('ROUND_DATASET_STALE');
 const evidence=await loadFreezeEvidence(loaded,evidenceFile,now);
 await session.finish();return {...loaded,approvalRead,evidence,checkedAtUtc:now};
}

export function verifyFrozenRoundJournals(loaded,journals,startedAtUtc,completedAtUtc){
 const {artifacts:a,plan:p}=loaded;
 if(!timestamp(startedAtUtc)||!timestamp(completedAtUtc)||Date.parse(completedAtUtc)<Date.parse(startedAtUtc))fail('ROUND_FREEZE_CLOCK_INVALID');
 referenceWindow(a.manifest,startedAtUtc);referenceWindow(a.manifest,completedAtUtc);
 for(const j of Object.values(journals)){
  if(!timestamp(j.generatedAtUtc)||Date.parse(j.generatedAtUtc)<Date.parse(startedAtUtc)||Date.parse(j.generatedAtUtc)>Date.parse(completedAtUtc)
   ||j.trainingCutoffUtc!==p.cutoffUtc||j.entries?.length!==10||j.manifest.season!==p.scope.season||j.manifest.matchday!==p.scope.round
   ||!same(j.manifest.events.map(identity),a.manifest.events.map(identity)))fail('ROUND_FROZEN_IDENTITY_OR_TIME_INVALID');
 }
 const v1=journals.v1,v2=journals.v2;
 if(journalIssues(v1,a.studyV1,Date.parse(v1.generatedAtUtc)).length||v1.provenance?.studySha256!==hashValue(a.studyV1)
  ||v1.provenance?.datasetSha256!==hashValue(a.dataset)||v2.datasetSha256!==hashValue(a.dataset)
  ||v1.provenance?.sourceCommit!==a.dataset.commit||v2.sourceCommit!==a.dataset.commit
  ||v2.sourceData!=='observed_original_results'||hasSyntheticMarker(journals))fail('ROUND_FROZEN_PROVENANCE_INVALID');
 verifyScientificDistributions(v2,a.studyV2);return true;
}
export async function verifyFrozenRound(root,planFile){
 const loaded=await loadRoundPackage(root,planFile),{plan:p,session}=loaded,base=roundDirectory(root,p.scope);
 await safeDirectory(root,base);
 const ir=await optional(session,path.join(base,'freeze-intent.json')),rr=await optional(session,path.join(base,'freeze-receipt.json'));
 if(!rr){await session.finish();return {status:ir?'PARTIAL_REQUIRES_REVIEW':'NOT_FROZEN',readOnly:true,forecastExecuted:false,providerRequests:0};}
 const i=ir?.payload,r=rr.payload;
 if(i?.schema!=='lamultipla-reference-round-intent-v2'||r.schema!=='lamultipla-reference-round-receipt-v2'
  ||i.packageSha256!==hashValue(p)||r.packageSha256!==hashValue(p)||!same(i.planReference,loaded.planReference)
  ||r.intentSha256!==hashValue(i)||r.inputSha256!==i.inputSha256||r.actualStakeEUR!==0||r.providerRequests!==0
  ||r.quotesRead!==false||r.quoteFieldsConsultedForFreeze!==false||r.calendarPayloadMayContainPrices!==true
  ||r.pricesUsedForForecast!==false||r.operationallyApproved!==false)fail('ROUND_FREEZE_RECEIPT_CHAIN_INVALID');
 if((await fs.stat(rr.file)).mtimeMs>=Date.parse(p.window.closesAtUtc))fail('ROUND_RECEIPT_PUBLISHED_AFTER_DEADLINE');
 const approval=(await session.reference(i.approvalReference,base)).payload;
 validateRoundApproval(p,approval,i.startedAtUtc);validateRoundApproval(p,approval,r.completedAtUtc);
 const evidence=await loadFreezeEvidence(loaded,i.evidenceReference.ref,i.startedAtUtc);
 if(!same(evidence.reference,i.evidenceReference)||i.inputSha256!==hashValue({packageSha256:hashValue(p),approvalReference:i.approvalReference,evidenceReference:i.evidenceReference}))fail('ROUND_FROZEN_INPUT_CHANGED');
 const finalEvidence=await loadFreezeEvidence(loaded,i.evidenceReference.ref,r.completedAtUtc);
 validateCurrentDataset(loaded.artifacts.dataset,r.completedAtUtc);
 if(Date.parse(r.completedAtUtc)-Date.parse(loaded.artifacts.dataset.acquiredAtUtc)>72*3600000)fail('ROUND_DATASET_STALE_AT_COMPLETION');
 const journals={};for(const k of ['v1','v2']){
  if(!r.journals?.[k]||!path.resolve(r.journals[k].ref).startsWith(base+path.sep))fail('ROUND_JOURNAL_NAMESPACE_INVALID');
  journals[k]=(await session.reference(r.journals[k],base,{sealed:true})).payload;
 }
 verifyFrozenRoundJournals(loaded,journals,i.startedAtUtc,r.completedAtUtc);await session.finish();
 return {status:'FROZEN_VERIFIED',sourceKind:'VERIFIED_LOCAL_FREEZE_ARCHIVE',readOnly:true,forecastExecuted:false,providerRequests:0,
  receiptReference:rr.reference,receiptSha256:hashValue(r),completedAtUtc:r.completedAtUtc,calendarAtFreeze:finalEvidence.calendar,journals,loaded};
}
export async function freezeRoundApproved(root,planFile,{approvalFile,evidenceFile}={}){
 // A completed archive is verified, never regenerated, even after its window.
 const previous=await verifyFrozenRound(root,planFile);if(previous.status==='FROZEN_VERIFIED')return {status:previous.status,reused:true,receiptSha256:previous.receiptSha256};
 const initial=await roundPreflight(root,planFile,{approvalFile,evidenceFile}),base=await assertRoundWriteNamespace(root,initial.plan.scope);
 return privateLock(base,async()=>{
  const loaded=await roundPreflight(root,planFile,{approvalFile,evidenceFile}),{plan:p,artifacts:a}=loaded;
  await assertRoundWriteNamespace(root,p.scope);
  if(Date.parse(loaded.checkedAtUtc)<Date.parse(initial.checkedAtUtc))fail('ROUND_CLOCK_BACKWARDS');
  const inputSha256=hashValue({packageSha256:hashValue(p),approvalReference:loaded.approvalRead.reference,evidenceReference:loaded.evidence.reference});
  const intentFile=path.join(base,'freeze-intent.json'),receiptFile=path.join(base,'freeze-receipt.json'),old=await optional(loaded.session,intentFile);
  if(old&&(old.payload.inputSha256!==inputSha256||Date.parse(old.payload.startedAtUtc)>Date.parse(loaded.checkedAtUtc)))fail('ROUND_CHANGED_INPUT_OR_BACKWARDS_RECOVERY');
  const intent=old?.payload??{schema:'lamultipla-reference-round-intent-v2',packageSha256:hashValue(p),planReference:loaded.planReference,
   approvalReference:loaded.approvalRead.reference,evidenceReference:loaded.evidence.reference,inputSha256,startedAtUtc:loaded.checkedAtUtc};
  if(!old)await writeExclusive(intentFile,intent);
  let previousClock=Date.parse(loaded.checkedAtUtc);
  const clock=()=>{const now=new Date();if(now.getTime()<previousClock)fail('ROUND_CLOCK_BACKWARDS');referenceWindow(a.manifest,now);previousClock=now.getTime();return now;};
  await assertRoundWriteNamespace(root,p.scope);
  const v1=await freezeForwardForecast({root:base,registry:loaded.registry,dataset:a.dataset,schedule:a.manifest,clock});
  if(journalIssues(v1.journal,a.studyV1,Date.parse(v1.journal.generatedAtUtc)).length
   ||v1.journal.provenance?.datasetSha256!==hashValue(a.dataset)
   ||!same(v1.journal.manifest.events.map(identity),a.manifest.events.map(identity)))fail('ROUND_V1_INVALID_STOP_BEFORE_V2');
  await assertRoundWriteNamespace(root,p.scope);
  const v2=await freezeEngine({root:base,study:a.studyV2,dataset:a.dataset,schedule:a.manifest,clock});
  await roundPreflight(root,planFile,{approvalFile,evidenceFile,now:clock().toISOString()});
  await loaded.session.finish();const journals={};
  for(const [k,v]of [['v1',v1],['v2',v2]])journals[k]={ref:v.filename,sha256:hashBytes(await fs.readFile(v.filename))};
  const completedAtUtc=clock().toISOString();
  verifyFrozenRoundJournals(loaded,{v1:v1.journal,v2:v2.journal},intent.startedAtUtc,completedAtUtc);
  const receipt={schema:'lamultipla-reference-round-receipt-v2',packageSha256:hashValue(p),intentSha256:hashValue(intent),inputSha256,
   completedAtUtc,journals,providerRequests:0,quotesRead:false,quoteFieldsConsultedForFreeze:false,
   calendarPayloadMayContainPrices:true,pricesUsedForForecast:false,operationallyApproved:false,actualStakeEUR:0};
  await writeExclusive(receiptFile,receipt);clock();
  return {status:'FREEZE_WRITTEN_REQUIRES_VERIFICATION',receiptSha256:hashValue(receipt),receiptFile};
 });
}
