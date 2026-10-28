// TEST-ONLY integration. No authentic CLI imports this module. No caller flag
// enables authentic execution; the official reader remains strictly read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashValue,hashBytes,exactFields,timestamp} from './contracts.mjs';
import {createReadSession} from './read-session.mjs';
import {loadSyntheticReaderDiagnostic} from './prospective-reader.mjs';
import {adaptOddsPapi} from './oddspapi.mjs';
import {diagnoseProbabilityBoards} from './probabilities.mjs';
import {PROTOTYPE_INPUT_SCHEMA,discoverPrototype,prototypeSafety} from './prototype-analysis.mjs';
import {PROTOTYPE_POLICY_SHA256} from './prototype-policy.mjs';
import {runSyntheticPrototype,verifySyntheticPrototype,prototypeAuthorityPath} from './prototype-store.mjs';
import {temporalPreflight} from './temporal-preflight.mjs';
import {writeExclusive} from '../prospective/store.mjs';
import {privateLock} from '../private/process-lock.mjs';

export const SYNTHETIC_INTEGRATION_SCHEMA='lamultipla-mm-test-only-integration-input-v1';
export const SYNTHETIC_EVIDENCE_SCHEMA='lamultipla-mm-test-only-integration-evidence-v1';
const folder='mm-integration-test-only-v1',fail=c=>{throw Error(c);},same=(a,b)=>hashValue(a)===hashValue(b);
const safety=()=>({...prototypeSafety(),sourceKind:'SYNTHETIC_TEST_ONLY',policyActivated:false,providerRequests:0});

export async function loadSyntheticIntegration(root,filename){
 const session=createReadSession(root),config=await session.json(filename),c=config.value;
 if(!exactFields(c,['schema','synthetic','sourceKind','scope','readerInput','evidence','simulationAtUtc','policySha256'])
  ||c.schema!==SYNTHETIC_INTEGRATION_SCHEMA||c.synthetic!==true||c.sourceKind!=='SYNTHETIC_TEST_ONLY'
  ||c.scope?.cohortId!=='SYNTHETIC-READER-COHORT'||!timestamp(c.simulationAtUtc)||c.policySha256!==PROTOTYPE_POLICY_SHA256)fail('MM4B_TEST_ONLY_INPUT_REQUIRED');
 const readerInput=await session.reference(c.readerInput,path.dirname(config.file));
 const report=await loadSyntheticReaderDiagnostic(root,readerInput.file,c.simulationAtUtc),r=report.content;
 if(report.inspection.synthetic!==true||r.sourceKind!=='SYNTHETIC_TEST_ONLY'||!same(r.scope,c.scope))fail('MM4B_SOURCE_KIND_OR_SCOPE_MISMATCH');
 // Pin every original source again across the adapter; no trust in a copied
 // "verified" boolean and no reading through an unverified M1 CLI path.
 for(const ref of report.sources){const rel=path.relative(path.join(path.resolve(root),'.local'),ref.ref);
  await session.bytes(ref.ref,{reference:ref,code:rel.startsWith('..')||path.isAbsolute(rel)});}
 const journal=await session.reference(r.frozen.journal,root,{sealed:true}),study=await session.reference(r.frozen.study,root,{sealed:true});
 const manifest=await session.reference(r.frozen.manifest,root,{sealed:true}),m1=await session.reference(r.boardsInput,root),raws={};
 for(const k of ['raw','catalog','report'])raws[k]=await session.reference(m1.value.source[k],path.dirname(m1.file));
 const boards=adaptOddsPapi({rawBytes:raws.raw.bytes,catalogBytes:raws.catalog.bytes,reportBytes:raws.report.bytes,source:m1.value.source,bindings:m1.value.bindings});
 if(boards.source.observationKind!=='SYNTHETIC'||journal.payload.sourceData!=='synthetic_test'||study.payload.synthetic!==true
  ||journal.payload.manifest.events.some(e=>![e.home,e.away].every(n=>typeof n==='string'&&n.startsWith('SYNTHETIC ')))
  ||boards.boards.some(b=>!b.event.id.startsWith('synthetic-')||![b.event.home.name,b.event.away.name].every(n=>n.startsWith('SYNTHETIC '))))fail('MM4B_EXPLICIT_SYNTHETIC_FIXTURES_REQUIRED');
 const diagnostic=diagnoseProbabilityBoards({boards,journal:journal.payload,study:study.payload,freezeCompletedAtUtc:r.diagnostic.provenance.freezeCompletedAtUtc});
 if(boards.canonicalSha256!==r.boardSnapshotSha256||diagnostic.canonicalSha256!==r.diagnosticSha256||!same(diagnostic,r.diagnostic)
  ||!same(manifest.payload.events,journal.payload.manifest.events))fail('MM4B_LINKAGE_REPLAY_MISMATCH');
 const evidence=await session.reference(c.evidence,path.dirname(config.file)),e=evidence.value;
 if(!exactFields(e,['schema','synthetic','sourceKind','scope','readerContentSha256','policySha256','policyRegisteredInSimulationAtUtc','context','calendar','selectionReviews','ticketReviews'])
  ||e.schema!==SYNTHETIC_EVIDENCE_SCHEMA||e.synthetic!==true||e.sourceKind!=='SYNTHETIC_TEST_ONLY'||!same(e.scope,c.scope)
  ||e.readerContentSha256!==report.contentSha256||e.policySha256!==PROTOTYPE_POLICY_SHA256)fail('MM4B_EVIDENCE_BINDING_INVALID');
 const input={schema:PROTOTYPE_INPUT_SCHEMA,synthetic:true,policyRegisteredInSimulationAtUtc:e.policyRegisteredInSimulationAtUtc,
  data:{boards,diagnostic,journal:journal.payload,study:study.payload,atUtc:c.simulationAtUtc,
   context:e.context,calendar:e.calendar,selectionReviews:e.selectionReviews,ticketReviews:e.ticketReviews}};
 discoverPrototype(input,c.simulationAtUtc);await session.finish();
 const linkage={schema:'lamultipla-mm-test-only-integration-linkage-v1',scope:c.scope,sourceKind:r.sourceKind,
  readerContentSha256:report.contentSha256,config:config.reference,evidence:evidence.reference,readerInput:readerInput.reference,
  frozen:r.frozen,providerSource:r.providerSource,scientificCoverage:r.scientificCoverage,priceUniverseCoverage:r.priceUniverseCoverage,
  quoteForecastLinks:r.quoteForecastLinks,boardSnapshotSha256:boards.canonicalSha256,diagnosticSha256:diagnostic.canonicalSha256,
  prototypeInputSha256:hashValue(input),policySha256:PROTOTYPE_POLICY_SHA256,sources:session.references()};
 return {input,linkage,report};
}

// New namespace only; identical no-link/canonical-directory rules to M3-C.
// M3-B's private directory helper is deliberately not changed/exported: that
// would invalidate existing code-bound receipts. File reads reuse read-session.
async function directory(root,id,create=false){
 let cursor=path.resolve(root);if(await fs.realpath(cursor)!==cursor)fail('MM4B_UNSAFE_NAMESPACE');
 for(const part of ['.local',folder,id]){
  cursor=path.join(cursor,part);if(create)try{await fs.mkdir(cursor,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  let stat;try{stat=await fs.lstat(cursor);}catch(e){if(e.code==='ENOENT'&&!create)return null;throw e;}
  if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(cursor)!==cursor)fail('MM4B_UNSAFE_NAMESPACE');
 }
 return cursor;
}
export function syntheticIntegrationAuthority(root,scope){
 if(scope?.cohortId!=='SYNTHETIC-READER-COHORT'||!/^\d{4}\/\d{2}$/.test(scope.season??'')||!Number.isInteger(scope.round)||scope.round<1||scope.round>38)fail('MM4B_TEST_ONLY_SCOPE_REQUIRED');
 const id=hashValue({scope,policySha256:PROTOTYPE_POLICY_SHA256});return {id,directory:path.resolve(root,'.local',folder,id)};
}
async function codeIdentity(){
 const base=path.dirname(fileURLToPath(import.meta.url)),files=['synthetic-integration.mjs','integration-contract.mjs','prospective-reader.mjs','prospective-archive.mjs','read-session.mjs','oddspapi.mjs'];
 return hashValue(await Promise.all(files.map(async file=>({file,sha256:hashBytes(await fs.readFile(path.join(base,file)))}))));
}
async function readOptional(root,dir,name){
 try{return await createReadSession(root).sealed(path.join(dir,name));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function persistedBound(root,where,input){
 let bound=Date.parse(input.data.atUtc);
 // Pin the path even when a requested file is absent: a junction parent must
 // fail before the integration creates its own lock or intent.
 const intent=await readOptional(root,where.directory,'intent.json');if(!intent)return bound;
 for(const name of await fs.readdir(where.directory))if(/^(intent|preview|prepared|decision|commit-proof|review-\d+-claim)\.json$/.test(name)){
  const r=await readOptional(root,where.directory,name);
  for(const k of ['simulationStartedAtUtc','atSimulationUtc','completedAtSimulationUtc'])if(r?.payload[k]!==undefined){
   if(!timestamp(r.payload[k]))fail('MM4B_PERSISTED_TIME_INVALID');bound=Math.max(bound,Date.parse(r.payload[k]));
  }
 }
 return bound;
}
async function layout(dir){
 for(const n of await fs.readdir(dir))if(!['locks','integration-intent.json','integration-receipt.json'].includes(n)
  &&!/^integration-(intent|receipt)\.json\.[a-f0-9-]{36}\.tmp$/.test(n))fail('MM4B_UNEXPECTED_ARTIFACT');
}
function expectedIntent(loaded,codeSha256){return {schema:'lamultipla-mm-test-only-integration-intent-v1',linkage:loaded.linkage,
 linkageSha256:hashValue(loaded.linkage),codeSha256,...safety()};}
async function prototypeReferences(root,loaded,result){
 const session=createReadSession(root),p=prototypeAuthorityPath(root,loaded.input);
 const receipt=await session.sealed(path.join(p.directory,'receipt.json')),decision=await session.sealed(path.join(p.directory,'decision.json'));
 if(!same(decision.payload,result.decision)||receipt.payload.inputSha256!==hashValue(loaded.input))fail('MM4B_PROTOTYPE_RESULT_MISMATCH');
 await session.finish();return {receipt:receipt.reference,decision:decision.reference,decisionSha256:hashValue(decision.payload)};
}
async function verifyLoaded(root,loaded,where,codeSha256){
 if(!await directory(root,where.id))fail('MM4B_INTEGRATION_MISSING');await layout(where.directory);
 const intent=await readOptional(root,where.directory,'integration-intent.json'),receipt=await readOptional(root,where.directory,'integration-receipt.json');
 if(!intent||!same(intent.payload,expectedIntent(loaded,codeSha256)))fail('MM4B_INPUT_OR_CODE_CONFLICT');
 if(!receipt)fail('MM4B_INTEGRATION_RECEIPT_MISSING');
 const prototype=await verifySyntheticPrototype({root,input:loaded.input}),refs=await prototypeReferences(root,loaded,prototype),p=receipt.payload;
 if(!exactFields(p,['schema','intent','linkageSha256','prototype','completedAtSimulationUtc','recordedAtRealUtc',...Object.keys(safety())])
  ||p.schema!=='lamultipla-mm-test-only-integration-receipt-v1'||!same(p.intent,intent.reference)||p.linkageSha256!==hashValue(loaded.linkage)
  ||!same(p.prototype,refs)||!timestamp(p.completedAtSimulationUtc)||!timestamp(p.recordedAtRealUtc)
  ||Object.entries(safety()).some(([k,v])=>p[k]!==v))fail('MM4B_INTEGRATION_RECEIPT_ALTERED');
 const prototypeProof=await createReadSession(root).sealed(path.join(prototype.directory,'commit-proof.json'));
 if(p.completedAtSimulationUtc!==prototypeProof.payload.completedAtSimulationUtc)fail('MM4B_COMPLETION_TIME_MISMATCH');
 return {status:'SYNTHETIC_INTEGRATION_VERIFIED',scope:loaded.linkage.scope,directory:where.directory,linkageSha256:hashValue(loaded.linkage),
  receipt:receipt.reference,decisionSha256:refs.decisionSha256,prototype,clock:{simulatedDecisionAtUtc:p.completedAtSimulationUtc,
   actualReceiptWrittenAtUtc:p.recordedAtRealUtc,actualReaderExecutedAtUtc:loaded.report.inspection.readerExecutedAtUtc},...safety()};
}
export async function verifySyntheticIntegration({root,filename}){
 const loaded=await loadSyntheticIntegration(root,filename),where=syntheticIntegrationAuthority(root,loaded.linkage.scope);
 return verifyLoaded(root,loaded,where,await codeIdentity());
}
export async function runSyntheticIntegration({root,filename,simulationClock,onCheckpoint=async()=>{}}){
 if(typeof simulationClock!=='function'||typeof onCheckpoint!=='function')fail('MM4B_EXPLICIT_TEST_CLOCK_REQUIRED');
 const loaded=await loadSyntheticIntegration(root,filename),where=syntheticIntegrationAuthority(root,loaded.linkage.scope),codeSha256=await codeIdentity();
 let priorIntent=null;const exists=await directory(root,where.id);if(exists){
  await layout(exists);const intent=await readOptional(root,exists,'integration-intent.json');
  priorIntent=intent;
  if(intent&&!same(intent.payload,expectedIntent(loaded,codeSha256)))fail('MM4B_INPUT_OR_CODE_CONFLICT');
  if(await readOptional(root,exists,'integration-receipt.json')){
   if((await fs.readdir(path.join(exists,'locks'))).length===0)return {...await verifyLoaded(root,loaded,where,codeSha256),replayed:true};
  }
 }
 // All temporal checks before ANY new directory, lock, intent or M3 artifact.
 // A completed M3 receipt permits only attaching its already verified result.
 let completed=null;const proto=prototypeAuthorityPath(root,loaded.input);
 const protoReceipt=await readOptional(root,proto.directory,'receipt.json');
 if(protoReceipt)completed=await verifySyntheticPrototype({root,input:loaded.input});
 const protoProof=await readOptional(root,proto.directory,'commit-proof.json');
 if(!completed&&protoProof){
  if(!priorIntent)fail('MM4B_ORPHAN_PROTOTYPE_AUTHORITY');
  // Delegate completion-only recovery to the existing M3 verifier/runner. It
  // verifies every prepared/result/decision hash BEFORE its own lock/effects;
  // an expired clock permits only its missing receipt, never a new decision.
  completed=await runSyntheticPrototype({root,input:loaded.input,simulationClock,onCheckpoint});
 }
 if(completed&&!priorIntent)fail('MM4B_ORPHAN_PROTOTYPE_AUTHORITY');
 let last=await persistedBound(root,proto,loaded.input);
 const clock=()=>{const t=simulationClock();temporalPreflight(loaded.input,t,last);last=Date.parse(t);return t;};
 if(!completed)clock();await directory(root,where.id,true);
 return privateLock(where.directory,async()=>{
  await layout(where.directory);const reread=await loadSyntheticIntegration(root,filename);
  if(!same(reread.linkage,loaded.linkage))fail('MM4B_INPUT_CHANGED_BEFORE_EFFECTS');
  let intent=await readOptional(root,where.directory,'integration-intent.json');
  if(intent&&!same(intent.payload,expectedIntent(loaded,codeSha256)))fail('MM4B_INPUT_OR_CODE_CONFLICT');
  if(await readOptional(root,where.directory,'integration-receipt.json'))return {...await verifyLoaded(root,loaded,where,codeSha256),replayed:true};
  if(!intent){
   if(completed)fail('MM4B_ORPHAN_PROTOTYPE_AUTHORITY');
   clock();await onCheckpoint('before:integration-intent.json');clock();
   await writeExclusive(path.join(where.directory,'integration-intent.json'),expectedIntent(loaded,codeSha256));await onCheckpoint('after:integration-intent.json');
   intent=await readOptional(root,where.directory,'integration-intent.json');
  }
  const result=completed??await runSyntheticPrototype({root,input:loaded.input,simulationClock:clock,onCheckpoint});
  const after=await loadSyntheticIntegration(root,filename);
  if(!same(after.linkage,loaded.linkage))fail('MM4B_SOURCE_CHANGED_DURING_COMPOSITION');
  const refs=await prototypeReferences(root,loaded,result),proof=await createReadSession(root).sealed(path.join(proto.directory,'commit-proof.json'));
  await onCheckpoint('before:integration-receipt.json');
  // This receipt links an existing synthetic decision; never writes/replaces it.
  await writeExclusive(path.join(where.directory,'integration-receipt.json'),{schema:'lamultipla-mm-test-only-integration-receipt-v1',intent:intent.reference,
   linkageSha256:hashValue(loaded.linkage),prototype:refs,completedAtSimulationUtc:proof.payload.completedAtSimulationUtc,
   recordedAtRealUtc:new Date().toISOString(),...safety()});
  await onCheckpoint('after:integration-receipt.json');return {...await verifyLoaded(root,loaded,where,codeSha256),replayed:false};
 });
}
