import path from 'node:path';
import {exactFields,hashValue,timestamp} from './contracts.mjs';
import {validateReaderScope,RECOGNIZED_COHORTS,readerSafety} from './prospective-archive.mjs';
import {createReadSession} from './read-session.mjs';
import {loadProspectiveDiagnostic,verifyProspectiveDiagnostic} from './prospective-reader.mjs';

// A reference checklist, NOT a consent, admission policy, decision or receipt.
export const INTEGRATION_CONTRACT_SCHEMA='lamultipla-mm-future-integration-descriptor-v1';
export const INTEGRATION_ROLES=Object.freeze(['cohort','cohortApproval','roundApproval','manifest','dataset','studyV1','studyV2',
 'journalV1','journalV2','freezeIntent','freezeReceipt','providerConsent','providerReceipt','raw','catalog','providerReport',
 'readerInput','readerReport','boards','diagnostic','prospectivePolicy','prospectivePolicyApproval','contextReview','selectionReviews','ticketReview','decision','decisionReceipt']);
export const INTEGRATION_TIMES=Object.freeze(['scientificCutoffUtc','forecastGeneratedAtUtc','freezeCompletedAtUtc',
 'quoteObservedAtUtc','providerCreatedAtUtc','reviewedAtUtc','decisionWrittenAtUtc']);
const fail=c=>{throw Error(c);};
const reference=r=>exactFields(r,['ref','sha256'])&&typeof r.ref==='string'&&r.ref.length>0
 &&!/[?#\r\n]/.test(r.ref)&&!r.ref.includes('://')&&/^[a-f0-9]{64}$/.test(r.sha256??'');
export function validateFutureIntegrationContract(v){
 if(!exactFields(v,['schema','scope','sourceKind','readerContentSha256','primaryModel','comparatorModel','references','times','activation'])
  ||v.schema!==INTEGRATION_CONTRACT_SCHEMA||v.sourceKind!=='LOCAL_ARCHIVE_REFERENCE_DESCRIPTOR'
  ||!/^[a-f0-9]{64}$/.test(v.readerContentSha256??'')||v.primaryModel!=='dc-v2'||v.comparatorModel!=='bivariate-v2'
  ||!exactFields(v.references,INTEGRATION_ROLES)||!exactFields(v.times,INTEGRATION_TIMES)
  ||!exactFields(v.activation,['state','operationallyApproved','scientificallyValidated','actualStakeEUR'])
  ||v.activation.state!=='NOT_AUTHORIZED'||v.activation.operationallyApproved!==false||v.activation.scientificallyValidated!==false||v.activation.actualStakeEUR!==0)fail('MM4B_DESCRIPTOR_INVALID');
 validateReaderScope(v.scope);if(!Object.hasOwn(RECOGNIZED_COHORTS,v.scope.cohortId))fail('MM4B_DESCRIPTOR_COHORT_UNKNOWN');
 for(const r of Object.values(v.references))if(r!==null&&!reference(r))fail('MM4B_DESCRIPTOR_REFERENCE_INVALID');
 // A synthetic policy is never an acceptable prospective policy, even here.
 if(v.references.prospectivePolicy&&/mm-m3b-synthetic-v1|mm-simulator-synthetic-v1/i.test(v.references.prospectivePolicy.ref))fail('MM4B_SYNTHETIC_POLICY_NOT_PROSPECTIVE');
 for(const [k,t]of Object.entries(v.times))if(t!==null&&!timestamp(t))fail('MM4B_DESCRIPTOR_TIME_INVALID:'+k);
 const ordered=['scientificCutoffUtc','forecastGeneratedAtUtc','freezeCompletedAtUtc','quoteObservedAtUtc','reviewedAtUtc','decisionWrittenAtUtc'];
 let previous=-Infinity;for(const k of ordered)if(v.times[k]!==null){const now=Date.parse(v.times[k]);if(now<previous)fail('MM4B_DESCRIPTOR_TIME_ORDER');previous=now;}
 if(v.times.providerCreatedAtUtc!==null&&v.times.quoteObservedAtUtc!==null&&Date.parse(v.times.providerCreatedAtUtc)>Date.parse(v.times.quoteObservedAtUtc))fail('MM4B_DESCRIPTOR_PROVIDER_TIME');
 return {schema:'lamultipla-mm-future-integration-checklist-v1',scope:structuredClone(v.scope),descriptorSha256:hashValue(v),
  missingReferences:INTEGRATION_ROLES.filter(k=>v.references[k]===null),missingTimes:INTEGRATION_TIMES.filter(k=>v.times[k]===null),
  status:'DESCRIPTOR_ONLY_NOT_AUTHORIZED',authorizationVerified:false,semanticLinkageVerified:false,
  localHashesAreExternalCertification:false,policyActivated:false,...readerSafety()};
}
// Only local byte integrity is inspected. Semantic/consent verification remains
// the responsibility of the official reader and a separately authorized pilot.
export async function inspectFutureIntegrationContract(root,filename){
 const session=createReadSession(root),read=await session.json(filename),v=read.value,result=validateFutureIntegrationContract(v),reads={};
 for(const [role,r]of Object.entries(v.references))if(r!==null){
  const artifact=await session.reference(r,path.dirname(read.file));reads[role]=artifact;
  if(role==='prospectivePolicy'&&(artifact.payload?.synthetic===true||artifact.payload?.id==='mm-m3b-synthetic-v1'
   ||artifact.payload?.authenticExecutionAllowed===false))fail('MM4B_SYNTHETIC_POLICY_NOT_PROSPECTIVE');
 }
 let archiveLinkageVerified=false;
 if(reads.readerInput&&reads.readerReport){
  // Even a fully populated descriptor cannot bypass the authentic reader. This
  // is verification only; no policy, decision, review or receipt is generated.
  await verifyProspectiveDiagnostic(root,reads.readerInput.file,reads.readerReport.payload);
  const actual=await loadProspectiveDiagnostic(root,reads.readerInput.file),c=actual.content;
  if(actual.contentSha256!==v.readerContentSha256||hashValue(c.scope)!==hashValue(v.scope))fail('MM4B_DESCRIPTOR_READER_MISMATCH');
  const roles={manifest:'manifest',dataset:'dataset',studyV2:'study',journalV2:'journal',freezeIntent:'intent',freezeReceipt:'receipt'};
  for(const [role,key]of Object.entries(roles))if(reads[role]&&hashValue(reads[role].reference)!==hashValue(c.frozen[key]))fail('MM4B_DESCRIPTOR_LINK_MISMATCH:'+role);
  for(const role of ['raw','catalog','providerReport']){
   const key=role==='providerReport'?'report':role;if(!reads[role])continue;
   const source=c.providerSource[key],expected=path.resolve(path.dirname(c.boardsInput.ref),source.ref);
   if(reads[role].file!==expected||reads[role].reference.sha256!==source.sha256)fail('MM4B_DESCRIPTOR_PROVIDER_MISMATCH:'+role);
  }
  if(reads.boards&&reads.boards.payload.canonicalSha256!==c.boardSnapshotSha256)fail('MM4B_DESCRIPTOR_BOARDS_MISMATCH');
  if(reads.diagnostic&&hashValue(reads.diagnostic.payload)!==hashValue(c.diagnostic))fail('MM4B_DESCRIPTOR_DIAGNOSTIC_MISMATCH');
  const times={scientificCutoffUtc:c.diagnostic.provenance.trainingCutoffUtc,forecastGeneratedAtUtc:actual.inspection.forecastGeneratedAtUtc,
   freezeCompletedAtUtc:actual.inspection.freezeCompletedAtUtc,quoteObservedAtUtc:actual.inspection.quoteObservedAtUtc};
  for(const [k,t]of Object.entries(times))if(v.times[k]!==null&&v.times[k]!==t)fail('MM4B_DESCRIPTOR_TIME_MISMATCH:'+k);
  archiveLinkageVerified=true;
 }
 await session.finish();return {...result,referenceIntegrityVerified:true,archiveLinkageVerified,
  // Human reviews, provider consent/ledger and prospective policy admission do
  // not have an executable validator in this milestone. Never infer approval.
  unresolvedVerifications:['PROVIDER_AUTHORIZATION_AND_REMOTE_RECEIPT','PROSPECTIVE_POLICY_AND_APPROVAL','HUMAN_REVIEWS_AND_SETTLEMENT','AUTHENTIC_DECISION_PERSISTENCE'],
  sources:session.references()};
}
