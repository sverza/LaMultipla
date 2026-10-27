import {hashValue,timestamp,exactFields} from './contracts.mjs';
import {validateJournal} from '../engine/forecast.mjs';
import {EXPERIMENT} from '../engine/study.mjs';
import {validateCurrentDataset} from '../shadow/registry.mjs';
import {journalIssues} from '../shadow/opportunities.mjs';
import {canonicalTeam,trainingBefore} from '../goals/data.mjs';
import {reconcileCalendar} from '../orchestration/round-manager.mjs';
import {validateReferenceProposal} from '../reference-readiness.mjs';
import {validateSeriesApproval,referenceWindow} from '../reference-series.mjs';
import {projectFrozenFamily} from './probabilities.mjs';

export const READER_INPUT_SCHEMA='lamultipla-mm-prospective-reader-input-v1';
export const ROUND_INDEX_SCHEMA='lamultipla-mm-frozen-round-index-v1';
export const ROUND_APPROVAL_SCHEMA='lamultipla-reference-round-freeze-approval-v1';
export const ROUND_INTENT_SCHEMA='lamultipla-reference-round-freeze-intent-v1';
export const ROUND_RECEIPT_SCHEMA='lamultipla-reference-round-freeze-receipt-v1';
export const RECOGNIZED_COHORTS=Object.freeze({
 'reference-g8-20261023-v1':Object.freeze({proposalSha256:'3d477e4f8c9b9ab5393514af3f8f711443787a3fe4396cc84695dbdb8b696d77',recognitionVersion:1})
});
export const ARCHIVE_KEYS=Object.freeze(['proposal','cohortApproval','roundApproval','manifest','calendar','dataset','studyV1','registryDataset','studyV2','journalV1','journalV2','intent','receipt']);
const fail=c=>{throw Error(c);},same=(a,b)=>hashValue(a)===hashValue(b);
export const readerSafety=()=>({readOnly:true,providerRequests:0,forecastExecuted:false,refitExecuted:false,decisionExecuted:false,
 policyActivated:false,operationallyApproved:false,scientificallyValidated:false,appDeliveryAllowed:false,actualStakeEUR:0});
export function validateReaderScope(scope){
 if(!exactFields(scope,['cohortId','season','round'])||!/^[-a-zA-Z0-9_]{1,90}$/.test(scope.cohortId)||!/^\d{4}\/\d{2}$/.test(scope.season)
  ||Number(scope.season.slice(5))!==(Number(scope.season.slice(0,4))+1)%100||!Number.isInteger(scope.round)||scope.round<1||scope.round>38)fail('MM4_SCOPE_INVALID');
 return scope;
}
export function recognizeCohort(proposal,scope,{synthetic=false}={}){
 validateReaderScope(scope);
 if(synthetic){if(!proposal.synthetic||proposal.id!=='SYNTHETIC-READER-COHORT'||scope.cohortId!==proposal.id||proposal.plannedEvents!==600
   ||proposal.plannedRounds?.length!==60)fail('MM4_SYNTHETIC_COHORT_REQUIRED');}
 else{
  const known=RECOGNIZED_COHORTS[scope.cohortId];
  if(!known||known.proposalSha256!==hashValue(proposal))fail('MM4_COHORT_NOT_RECOGNIZED');
  validateReferenceProposal(proposal);
 }
 if(proposal.id!==scope.cohortId||proposal.sourceRole!=='A'||proposal.source!=='openfootball/football.json'
  ||!proposal.plannedRounds.some(r=>r.season===scope.season&&r.matchday===scope.round&&r.expectedEvents===10))fail('MM4_ROUND_OUTSIDE_RECOGNIZED_COHORT');
 return {id:proposal.id,proposalSha256:hashValue(proposal),recognition:synthetic?'SYNTHETIC_ONLY':'PINNED_LOCAL_APPROVED_PROPOSAL',externalCertification:false};
}
export function hasSyntheticMarker(v){
 if(!v||typeof v!=='object')return false;
 return v.synthetic===true||v.sourceData==='synthetic_test'||v.mode==='synthetic_test'||v.observationKind==='SYNTHETIC'
  ||Object.values(v).some(x=>typeof x==='object'&&hasSyntheticMarker(x));
}
const identity=e=>[String(e.fixtureId),canonicalTeam(e.home),canonicalTeam(e.away),e.kickoffUtc];
export function verifyScientificDistributions(journal,study){
 validateJournal(journal,study);
 if(!['synthetic_test','observed_original_results'].includes(journal.sourceData))fail('MM4_SCIENTIFIC_SOURCE_UNKNOWN');
 if(!same(Object.keys(journal.models??{}).sort(),['bivariate','dc']))fail('MM4_MODEL_OR_PARAMETERS_INVALID');
 if(![journal.generatedAtUtc,journal.trainingCutoffUtc,journal.datasetAcquiredAtUtc,study.generatedAtUtc].every(timestamp))fail('MM4_SCIENTIFIC_TIMESTAMP_INVALID');
 const entries=new Map(journal.entries.map(e=>[e.fixtureId,e]));
 if(new Set(journal.manifest.events.map(e=>e.fixtureId)).size!==10||journal.manifest.events.some(e=>!same(identity(e),identity(entries.get(e.fixtureId)??{}))))fail('MM4_SCIENTIFIC_UNIVERSE_MISMATCH');
 if(!same(journal.counts,{planned:10,forecasted:journal.entries.filter(e=>e.status==='prospective').length,excluded:journal.entries.filter(e=>e.status!=='prospective').length}))fail('MM4_SCIENTIFIC_COUNTS_INVALID');
 const rows=[];
 for(const e of journal.entries){
  if(!['prospective','excluded'].includes(e.status)||e.status==='excluded'&&!e.exclusions?.length)fail('MM4_FROZEN_STATUS_INVALID');
  if(!same(Object.keys(e.forecasts??{}).sort(),['bivariate','dc']))fail('MM4_MODEL_OR_PARAMETERS_INVALID');
  for(const kind of ['dc','bivariate']){
   const f=e.forecasts?.[kind],parameters=journal.models?.[kind];
   if(!f||!parameters||parameters.converged!==true||!same(parameters.config,study.selected[kind].config)||f.temperature!==study.selected[kind].temperature)fail('MM4_MODEL_OR_PARAMETERS_INVALID');
   for(const family of ['BTTS','TOTAL_GOALS']){
    const p=projectFrozenFamily(f,family);
    if(e.status==='prospective'&&(p.reasons.length||f.uncertainty.seed!==EXPERIMENT.seed))fail('MM4_FORECAST_DISTRIBUTION_INVALID');
    rows.push({fixtureId:e.fixtureId,entrySha256:e.entrySha256,model:kind,family,state:p.state,uncertainty:p.uncertainty.state,reasons:p.reasons,
     gridSha256:p.gridSha256,bootstrapGridsSha256:p.bootstrapGridsSha256});
   }
  }
 }
 return {expectedFixtures:10,presentFixtures:entries.size,complete:true,prospectiveFixtures:journal.entries.filter(e=>e.status==='prospective').length,
  frozenExcludedFixtureIds:journal.entries.filter(e=>e.status==='excluded').map(e=>e.fixtureId).sort(),rows};
}
export function roundBindings(scope,b){return {scope,...Object.fromEntries(ARCHIVE_KEYS.filter(k=>!['intent','receipt','journalV1','journalV2'].includes(k)).map(k=>[k+'Sha256',hashValue(b[k])]))};}

// Verification of a declared frozen archive only. No producer, approval writer or
// activation exists here. Synthetic mode is reachable solely via the separately
// labelled sandbox reader; its result can never claim an authentic freeze.
export function verifyRoundArchive(scope,b,{synthetic=false}={}){
 if(!exactFields(b,ARCHIVE_KEYS))fail('MM4_ARCHIVE_ARTIFACT_SET_INVALID');
 const recognition=recognizeCohort(b.proposal,scope,{synthetic}),a=b.roundApproval,m=b.manifest,j=b.journalV2,r=b.receipt,i=b.intent;
 if(!exactFields(a,['schema','synthetic','scope','proposalSha256','cohortApprovalSha256','manifestSha256','datasetSha256','studyV2Sha256',
  'freezeAuthorized','sourceRole','reviewer','provenance','approvedAtUtc','expiresAtUtc'])||a.synthetic!==synthetic
  ||!exactFields(i,['schema','scope','inputSha256','bindings','startedAtUtc'])
  ||!exactFields(r,['schema','synthetic','scope','inputSha256','intentSha256','manifestSha256','completedAtUtc','journals','providerRequests','quotesRead','actualStakeEUR'])
  ||r.synthetic!==synthetic||!exactFields(r.journals,['v1','v2'])||Object.values(r.journals).some(v=>!exactFields(v,['file','sha256'])))fail('MM4_FREEZE_CONTRACT_INVALID');
 if(synthetic){if(!b.dataset.synthetic||!b.registryDataset.synthetic||!b.studyV1.synthetic||!b.studyV2.synthetic||j.sourceData!=='synthetic_test'||b.journalV1.provenance?.synthetic!==true||a.synthetic!==true||r.synthetic!==true)fail('MM4_SYNTHETIC_SOURCE_REQUIRED');}
 else if(hasSyntheticMarker(b))fail('MM4_SYNTHETIC_AUTHENTIC_MISMATCH');
 if(m.schema!=='lamultipla-prospective-schedule-v1'||m.season!==scope.season||m.matchday!==scope.round)fail('MM4_MANIFEST_SCOPE_INVALID');
 if(!synthetic)validateSeriesApproval(b.proposal,b.cohortApproval,b.cohortApproval.approvedAtUtc);
 else if(!b.cohortApproval.synthetic||!b.cohortApproval.cohortApproved||b.cohortApproval.proposalSha256!==hashValue(b.proposal))fail('MM4_COHORT_APPROVAL_INVALID');
 if(a.schema!==ROUND_APPROVAL_SCHEMA||!same(a.scope,scope)||a.proposalSha256!==hashValue(b.proposal)||a.cohortApprovalSha256!==hashValue(b.cohortApproval)
  ||a.manifestSha256!==hashValue(m)||a.datasetSha256!==hashValue(b.dataset)||a.studyV2Sha256!==hashValue(b.studyV2)
  ||a.freezeAuthorized!==true||a.sourceRole!=='A'||!a.reviewer?.trim()||a.provenance!=='EXPLICIT_USER_APPROVAL_LOCAL_RECORD'
  ||!timestamp(a.approvedAtUtc)||!timestamp(a.expiresAtUtc))fail('MM4_ROUND_APPROVAL_REQUIRED');
 if(i.schema!==ROUND_INTENT_SCHEMA||r.schema!==ROUND_RECEIPT_SCHEMA||!same(i.scope,scope)||!same(r.scope,scope)
  ||!same(i.bindings,roundBindings(scope,b))||i.inputSha256!==hashValue(i.bindings)||r.inputSha256!==i.inputSha256||r.intentSha256!==hashValue(i)
  ||r.manifestSha256!==hashValue(m)||r.providerRequests!==0||r.quotesRead!==false||r.actualStakeEUR!==0
  ||!timestamp(i.startedAtUtc)||!timestamp(r.completedAtUtc)||Date.parse(r.completedAtUtc)<Date.parse(i.startedAtUtc)
  ||Date.parse(a.approvedAtUtc)>Date.parse(i.startedAtUtc)||Date.parse(a.approvedAtUtc)<Date.parse(b.cohortApproval.approvedAtUtc)
  ||Date.parse(r.completedAtUtc)>=Date.parse(a.expiresAtUtc))fail('MM4_FREEZE_CHAIN_INVALID');
 referenceWindow(m,i.startedAtUtc);referenceWindow(m,r.completedAtUtc);
 for(const now of [i.startedAtUtc,r.completedAtUtc]){
  validateCurrentDataset(b.dataset,now);if(Date.parse(now)-Date.parse(b.dataset.acquiredAtUtc)>72*3600000)fail('MM4_DATASET_STALE_AT_FREEZE');
  const calendar=reconcileCalendar(m,b.calendar,now);
  if(calendar.schedule.events.some(e=>e.status!=='scheduled'||calendar.discovered.providerFixtures.find(f=>f.fixtureId===e.fixtureId)?.statusId!==0))fail('MM4_CALENDAR_DISCREPANCY');
 }
 if(!same(trainingBefore(b.dataset.rows,b.proposal.initialCutoffUtc),trainingBefore(b.registryDataset.rows,b.proposal.initialCutoffUtc)))fail('MM4_ORIGINAL_TRAINING_CHANGED');
 if(b.proposal.models.find(x=>x.id==='goals-v1')?.studySha256!==hashValue(b.studyV1)
  ||['dc-v2','bivariate-v2'].some(id=>b.proposal.models.find(x=>x.id===id)?.studySha256!==hashValue(b.studyV2)))fail('MM4_REGISTERED_STUDY_CHANGED');
 const v1=b.journalV1,cutoff=m.events.map(e=>e.kickoffUtc.slice(0,7)).sort()[0]+'-01T00:00:00.000Z';
 if(journalIssues(v1,b.studyV1,Date.parse(v1.generatedAtUtc)).length||v1.entries.length!==10
  ||v1.manifest.season!==scope.season||v1.manifest.matchday!==scope.round||j.manifest.season!==scope.season||j.manifest.matchday!==scope.round
  ||!same(v1.manifest.events.map(identity),m.events.map(identity))||!same(v1.entries.map(identity),m.events.map(identity))||!same(j.manifest.events.map(identity),m.events.map(identity))
  ||v1.trainingCutoffUtc!==cutoff||j.trainingCutoffUtc!==cutoff||Date.parse(cutoff)>Date.parse(i.startedAtUtc)
  ||v1.provenance.datasetSha256!==hashValue(b.dataset)||v1.provenance.sourceCommit!==b.dataset.commit||!same(v1.provenance.sourceFiles,b.dataset.files)
  ||v1.provenance.datasetAcquiredAtUtc!==b.dataset.acquiredAtUtc||j.datasetSha256!==hashValue(b.dataset)
  ||j.datasetAcquiredAtUtc!==b.dataset.acquiredAtUtc||j.sourceCommit!==b.dataset.commit||!same(j.sourceFiles,b.dataset.files)
  ||!timestamp(j.startedAtUtc)||Date.parse(j.startedAtUtc)<Date.parse(i.startedAtUtc)||Date.parse(j.startedAtUtc)>Date.parse(j.generatedAtUtc))fail('MM4_JOURNAL_PROVENANCE_OR_IDENTITY_INVALID');
 if(trainingBefore(b.dataset.rows,cutoff).some(row=>m.events.some(e=>row.season.replace('-','/')===scope.season&&row.home===canonicalTeam(e.home)&&row.away===canonicalTeam(e.away))))fail('MM4_TARGET_LEAKAGE');
 for(const [kind,journal]of [['v1',v1],['v2',j]]){
  if(r.journals?.[kind]?.sha256!==hashValue(journal)||!timestamp(journal.generatedAtUtc)
   ||Date.parse(journal.generatedAtUtc)<Date.parse(i.startedAtUtc)||Date.parse(journal.generatedAtUtc)>Date.parse(r.completedAtUtc))fail('MM4_JOURNAL_RECEIPT_INVALID');
 }
 return {recognition,scientificCoverage:verifyScientificDistributions(j,b.studyV2),frozenAtUtc:r.completedAtUtc,
  status:synthetic?'SYNTHETIC_ARCHIVE_STRUCTURE_VERIFIED':'LOCALLY_VERIFIED_FROZEN_ARCHIVE',externalCertification:false};
}
