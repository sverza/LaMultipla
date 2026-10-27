import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadSession} from './read-session.mjs';
import {hashValue,hashBytes,exactFields,timestamp} from './contracts.mjs';
import {adaptOddsPapi} from './oddspapi.mjs';
import {diagnoseProbabilityBoards} from './probabilities.mjs';
import {reconcileUniverse} from './universe.mjs';
import {loadFrozenReference} from '../reference-screen.mjs';
import {validateReproduction,journalId} from '../prospective/freeze.mjs';
import {READER_INPUT_SCHEMA,ROUND_INDEX_SCHEMA,ARCHIVE_KEYS,RECOGNIZED_COHORTS,readerSafety,recognizeCohort,validateReaderScope,
 hasSyntheticMarker,verifyScientificDistributions,verifyRoundArchive} from './prospective-archive.mjs';

const fail=c=>{throw Error(c);},same=(a,b)=>hashValue(a)===hashValue(b);
export function roundArchiveDirectory(root,scope,{synthetic=false}={}){
 validateReaderScope(scope);return path.resolve(root,synthetic?'.local/mm-reader-synthetic-v1':'.local/research-review/cohorts',scope.cohortId,
  'rounds',scope.season.replace('/','-'),'round-'+String(scope.round).padStart(2,'0'));
}
async function codeAndRegistry(root,session,study,registryStudy,registryDataset,{synthetic=false}={}){
 // Read the exact registered identity set through the safe session; no git,
 // trainer or dynamic code/module path supplied by an input is invoked.
 await session.bytes('scripts/lib/engine/registry.mjs',{code:true});
 const names=(await fs.readdir(path.join(root,'scripts/lib/engine'))).filter(n=>n.endsWith('.mjs')).sort().map(n=>'scripts/lib/engine/'+n);
 names.push(...['data','model','metrics'].map(n=>'scripts/lib/goals/'+n+'.mjs'));
 const contents=[];for(const n of names)contents.push((await session.bytes(n,{code:true})).bytes.toString('utf8'));
 const normalize=s=>s.replace(/\r\n/g,'\n'),protocol=(await session.bytes('docs/protocollo-motore-gol-v2.md',{code:true})).bytes.toString('utf8');
 if(study.modelCodeSha256!==hashBytes(names.map((n,i)=>n+'\n'+normalize(contents[i])).join('\n'))||study.protocolSha256!==hashBytes(normalize(protocol)))fail('MM4_REGISTERED_ENGINE_CODE_CHANGED');
 const v1=[];for(const n of ['data','model','metrics','study','bridge'])v1.push((await session.bytes('scripts/lib/goals/'+n+'.mjs',{code:true})).bytes.toString('utf8'));
 const p1=(await session.bytes('docs/protocollo-modello-gol-v1.md',{code:true})).bytes.toString('utf8');
 if(!synthetic)validateReproduction(registryStudy,registryDataset,{codeRawSha256:hashBytes(v1.join('\n')),codeCanonicalSha256:hashBytes(v1.map(normalize).join('\n')),
  protocolRawSha256:hashBytes(p1),protocolCanonicalSha256:hashBytes(normalize(p1))});
 else if(!registryStudy.synthetic||!registryDataset.synthetic)fail('MM4_SYNTHETIC_REGISTRY_REQUIRED');
}
async function boardsFromInput(session,ref,directory){
 const input=await session.reference(ref,directory),c=input.value;
 if(!exactFields(c,['schema','source','bindings'])||c.schema!=='lamultipla-offline-boards-input-v1')fail('MM4_M1_INPUT_INVALID');
 const sources={};for(const k of ['raw','catalog','report'])sources[k]=await session.reference(c.source[k],path.dirname(input.file));
 const boards=adaptOddsPapi({rawBytes:sources.raw.bytes,catalogBytes:sources.catalog.bytes,reportBytes:sources.report.bytes,source:c.source,bindings:c.bindings});
 return {boards,input,sources};
}
async function legacyArchive(root,session,config,directory){
 if(config.scope.cohortId!=='reference-g8-20261023-v1'||config.scope.season!=='2026/27'||config.scope.round!==8)fail('MM4_LEGACY_SCOPE_MISMATCH');
 const plan=await session.reference(config.archive.reference,directory,{sealed:true}),p=plan.payload;
 const read={};for(const key of ['proposalFile','approvalFile','calendarFile','datasetFile','studyV2File','scheduleFile'])read[key]=await session.sealed(path.resolve(root,p[key]));
 read.studyV1File=await session.json(path.resolve(root,p.studyV1File));
 read.registryDataset=await session.json(path.join(root,'.local/model/datasets',read.studyV1File.payload.datasetSha256+'.json'));
 await codeAndRegistry(root,session,read.studyV2File.payload,read.studyV1File.payload,read.registryDataset.payload);
 const base=path.join(root,'.local/research-review/cohorts/reference-g8-20261023-v1');
 const intent=await session.sealed(path.join(base,'freeze-intent.json')),receipt=await session.sealed(path.join(base,'freeze-receipt.json'));
 const journals={};for(const kind of ['v1','v2'])journals[kind]=await session.sealed(receipt.payload[kind]?.file);
 // Preserve every original official G8 check, including v1, historical grant,
 // dataset, calendar, code/protocol, namespace and frozen input hash.
 const reference=await loadFrozenReference(root,plan.file);
 if(!same(reference.extensionJournal,journals.v2.payload)||!same(reference.journal,journals.v1.payload))fail('MM4_OFFICIAL_READER_LINK_CHANGED');
 const recognition=recognizeCohort(reference.input.proposal,config.scope);
 const scientificCoverage=verifyScientificDistributions(reference.extensionJournal,reference.input.study);
 if(hasSyntheticMarker({journal:reference.extensionJournal,study:reference.input.study,dataset:reference.input.dataset}))fail('MM4_SYNTHETIC_AUTHENTIC_MISMATCH');
 return {journal:reference.extensionJournal,study:reference.input.study,manifest:reference.input.schedule,
  frozenAtUtc:reference.frozenAtUtc,scientificCoverage,recognition,method:'loadFrozenReference',status:reference.verified.status,
  refs:{manifest:read.scheduleFile.reference,journal:journals.v2.reference,receipt:receipt.reference,intent:intent.reference,study:read.studyV2File.reference,dataset:read.datasetFile.reference},
  receiptSha256:reference.verified.receiptSha256,plan:plan.reference};
}
async function indexedArchive(root,session,config,directory,{synthetic=false}={}){
 const index=await session.reference(config.archive.reference,directory),v=index.payload,base=roundArchiveDirectory(root,config.scope,{synthetic});
 if(index.file!==path.join(base,'archive-index.json')||!exactFields(v,['schema','scope','artifacts'])||v.schema!==ROUND_INDEX_SCHEMA||!same(v.scope,config.scope)||!exactFields(v.artifacts,ARCHIVE_KEYS))fail('MM4_ARCHIVE_INDEX_INVALID');
 const b={},reads={};for(const k of ARCHIVE_KEYS){reads[k]=await session.reference(v.artifacts[k],base,{sealed:true});b[k]=reads[k].payload;}
 if(reads.intent.file!==path.join(base,'freeze-intent.json')||reads.receipt.file!==path.join(base,'freeze-receipt.json'))fail('MM4_FREEZE_PATH_INVALID');
 for(const [kind,key]of [['v1','journalV1'],['v2','journalV2']]){
  const j=b[key],expected=path.join(base,kind==='v1'?'.local/model/prospective/journals':'.local/model-v2/journals',
   (kind==='v1'?journalId(j.manifest):`${config.scope.season.replace('/','-')}-round-${config.scope.round}-${hashValue(b.studyV2).slice(0,16)}`)+'.json');
  if(reads[key].file!==expected||path.resolve(base,b.receipt.journals?.[kind]?.file??'')!==expected)fail('MM4_JOURNAL_PATH_INVALID');
 }
 await codeAndRegistry(root,session,b.studyV2,b.studyV1,b.registryDataset,{synthetic});
 const check=verifyRoundArchive(config.scope,b,{synthetic});
 return {...check,journal:b.journalV2,study:b.studyV2,manifest:b.manifest,method:'REFERENCE_ROUND_ARCHIVE_V1',receiptSha256:hashValue(b.receipt),
  refs:{manifest:reads.manifest.reference,journal:reads.journalV2.reference,receipt:reads.receipt.reference,intent:reads.intent.reference,study:reads.studyV2.reference,dataset:reads.dataset.reference},index:index.reference};
}
function describeTime(reference,boards,readAtUtc){
 if(!timestamp(readAtUtc))fail('MM4_READER_CLOCK_INVALID');
 const at=Date.parse(readAtUtc),observed=Date.parse(boards.source.observedAtUtc),generated=Date.parse(reference.journal.generatedAtUtc),completed=Date.parse(reference.frozenAtUtc);
 if([generated,completed,observed].some(t=>!Number.isFinite(t)||t>at))fail('MM4_EVIDENCE_NOT_YET_OBSERVED');
 const forecastAgeHours=(at-generated)/3600000,quoteObservationAgeMinutes=(at-observed)/60000;
 return {referenceAgeEvaluatedAtUtc:readAtUtc,forecastGeneratedAtUtc:reference.journal.generatedAtUtc,freezeCompletedAtUtc:reference.frozenAtUtc,
  scientificCutoffUtc:reference.journal.trainingCutoffUtc,quoteObservedAtUtc:boards.source.observedAtUtc,forecastAgeHours,quoteObservationAgeMinutes,
  lastPriceChangeMeaning:'LAST_CHANGE_NOT_OBSERVATION_OR_AVAILABILITY',
  referenceAgeState:forecastAgeHours>24||quoteObservationAgeMinutes>30?'EXPIRED_FOR_OPERATIONAL_USE':'WITHIN_REFERENCE_AGES_NOT_AUTHORIZED',
  currentPrice:null,newProspectiveDecisionAuthorized:false,policyActivated:false};
}
async function read(root,filename,{synthetic=false,simulationReadAtUtc=null}={}){
 root=path.resolve(root);const session=createReadSession(root),input=await session.json(filename),c=input.value;
 if(!exactFields(c,['schema','scope','archive','boardsInput'])||c.schema!==READER_INPUT_SCHEMA||!exactFields(c.archive,['kind','reference'])
  ||!['G8_REFERENCE_PLAN','ROUND_ARCHIVE_V1'].includes(c.archive.kind))fail('MM4_READER_INPUT_INVALID');
 validateReaderScope(c.scope);
 if(synthetic&&(c.scope.cohortId!=='SYNTHETIC-READER-COHORT'||c.archive.kind!=='ROUND_ARCHIVE_V1'))fail('MM4_SYNTHETIC_SCOPE_REQUIRED');
 if(!synthetic&&!Object.hasOwn(RECOGNIZED_COHORTS,c.scope.cohortId))fail('MM4_COHORT_NOT_RECOGNIZED');
 if(!synthetic&&c.scope.cohortId==='reference-g8-20261023-v1'&&c.scope.season==='2026/27'&&c.scope.round===8&&c.archive.kind!=='G8_REFERENCE_PLAN')fail('MM4_G8_OFFICIAL_READER_REQUIRED');
 const reference=c.archive.kind==='G8_REFERENCE_PLAN'?await legacyArchive(root,session,c,path.dirname(input.file)):
  await indexedArchive(root,session,c,path.dirname(input.file),{synthetic});
 const loaded=await boardsFromInput(session,c.boardsInput,path.dirname(input.file)),boards=loaded.boards;
 if(synthetic?boards.source.observationKind!=='SYNTHETIC':boards.source.observationKind==='SYNTHETIC')fail('MM4_QUOTE_SOURCE_MODE_MISMATCH');
 if(boards.scope.season!==c.scope.season||boards.scope.round!==c.scope.round)fail('MM4_QUOTE_SCOPE_MISMATCH');
 const diagnostic=diagnoseProbabilityBoards({boards,journal:reference.journal,study:reference.study,freezeCompletedAtUtc:reference.frozenAtUtc}),universe=reconcileUniverse(boards,reference.journal.manifest);
 const scientificEntries=reference.journal.entries.map(e=>({fixtureId:e.fixtureId,home:e.home,away:e.away,kickoffUtc:e.kickoffUtc,entrySha256:e.entrySha256,status:e.status}));
 const content={schema:'lamultipla-mm-authentic-linkage-v1',scope:structuredClone(c.scope),sourceKind:synthetic?'SYNTHETIC_TEST_ONLY':'LOCAL_AUTHENTIC_ARCHIVE',
  verification:{method:reference.method,status:reference.status,recognition:reference.recognition,localIntegrityVerified:true,
   externallyCertified:false,providerAvailabilityCertified:false,providerEvidenceVerification:'LOCAL_BYTES_AND_NORMALIZER_REPLAY_ONLY',receiptSha256:reference.receiptSha256},
  frozen:reference.refs,scientificEntries,scientificCoverage:reference.scientificCoverage,priceUniverseCoverage:universe,
  prices:{expectedBoards:universe.expectedBoards,presentBoards:boards.boards.length,completeBoards:boards.boards.filter(b=>b.completeness.state==='COMPLETE').length,
   availableBoards:boards.boards.filter(b=>b.availability.state==='OPEN').length,
   mathematicallyProjectableBoards:diagnostic.boardStates.filter(b=>Object.values(b.models).every(m=>m.projection?.state==='PROBABILITY_CALCULABLE'&&!m.reasons.length)).length,
   diagnosticReadyBoards:diagnostic.boardStates.filter(b=>b.diagnosticInputReadyM1&&b.forecastLinkState==='EXACT_MATCH'&&b.frozenEntryStatus==='prospective'
    &&Object.values(b.models).every(m=>m.projection?.uncertainty.state==='MARGINAL_BOOTSTRAP_DESCRIPTIVE'&&!m.reasons.length)).length},
  boardsInput:loaded.input.reference,providerSource:structuredClone(boards.source),boardSnapshotSha256:boards.canonicalSha256,
  quoteForecastLinks:diagnostic.records.map(r=>({fixtureId:String(r.event.sourceEventId),boardId:r.boardId,quoteId:r.quoteId,entrySha256:r.entrySha256,
   family:r.family,period:r.period,line:r.line,outcome:r.outcome,observedAtUtc:r.observedAtUtc,lastChangedAtUtc:r.lastChangedAtUtc,
   models:Object.fromEntries(Object.entries(r.models).map(([k,v])=>[k,{model:v.model,gridSha256:v.gridSha256,bootstrapGridsSha256:v.bootstrapGridsSha256,reasons:v.reasons}])),
   quoteProvenance:r.quoteProvenance,boardProvenance:r.boardProvenance,exclusions:r.exclusions})),
  diagnostic,diagnosticSha256:diagnostic.canonicalSha256,excludedFromDecision:true,futureAdmission:'NOT_AUTHORIZED',...readerSafety()};
 const contentSha256=hashValue(content),readerExecutedAtUtc=new Date().toISOString(),time=describeTime(reference,boards,synthetic?simulationReadAtUtc:readerExecutedAtUtc);
 await session.finish();
 const report={schema:'lamultipla-mm-prospective-reader-report-v1',content,contentSha256,
  inspection:{synthetic,readerExecutedAtUtc,simulatedReadAtUtc:synthetic?simulationReadAtUtc:null,...time},
  sources:session.references(),...readerSafety()};
 return {...report,reportSha256:hashValue(report)};
}
export const loadProspectiveDiagnostic=(root,filename)=>read(root,filename);
// No production caller or CLI can enable this path by toggling a data flag.
export const loadSyntheticReaderDiagnostic=(root,filename,simulationReadAtUtc)=>read(root,filename,{synthetic:true,simulationReadAtUtc});
export async function verifyProspectiveDiagnostic(root,filename,report){
 if(!exactFields(report,['schema','content','contentSha256','inspection','sources','reportSha256',...Object.keys(readerSafety())])
  ||Object.entries(readerSafety()).some(([k,v])=>report[k]!==v)
  ||report.schema!=='lamultipla-mm-prospective-reader-report-v1'||report.inspection?.synthetic!==false||report.contentSha256!==hashValue(report.content)
  ||report.reportSha256!==hashValue(Object.fromEntries(Object.entries(report).filter(([k])=>k!=='reportSha256')))
  ||!timestamp(report.inspection.readerExecutedAtUtc)||Date.parse(report.inspection.readerExecutedAtUtc)>Date.now()||report.inspection.simulatedReadAtUtc!==null)fail('MM4_REPORT_INVALID');
 const reread=await loadProspectiveDiagnostic(root,filename);
 if(reread.contentSha256!==report.contentSha256||!same(reread.sources,report.sources))fail('MM4_REPORT_REPLAY_MISMATCH');
 const d=reread.content.diagnostic,expectedTime=describeTime({journal:{generatedAtUtc:d.provenance.forecastGeneratedAtUtc,trainingCutoffUtc:d.provenance.trainingCutoffUtc},
  frozenAtUtc:d.provenance.freezeCompletedAtUtc},{source:{observedAtUtc:d.provenance.boardSource.observedAtUtc}},report.inspection.readerExecutedAtUtc);
 if(!same(report.inspection,{synthetic:false,readerExecutedAtUtc:report.inspection.readerExecutedAtUtc,simulatedReadAtUtc:null,...expectedTime}))fail('MM4_INSPECTION_TIME_MISMATCH');
 return {status:'READ_ONLY_LINKAGE_VERIFIED',contentSha256:reread.contentSha256,...readerSafety()};
}
