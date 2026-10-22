// External adapter: never fits, acquires prices, schedules work or sends a package.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadReferencePlan} from './reference-readiness.mjs';
import {referenceSeriesPreflight,verifyReferenceReceipt} from './reference-series.mjs';
import {privateInput} from './orchestration/analysis-plan.mjs';
import {PROGRESSIVE_POLICY,timing,validateRoundIdentity} from './orchestration/progressive-policy.mjs';
import {digest,readSnapshot} from './prospective/store.mjs';
import {manifestFromReport} from './prospective/freeze.mjs';
import {validateJournal} from './engine/forecast.mjs';
import {journalIssues} from './shadow/opportunities.mjs';
import {decisionPath} from './shadow/pipeline.mjs';
import {commitFinal,writeSame} from './shadow/progressive.mjs';
import {governance} from './decision/governance.mjs';
import {verifyDecisionBundle} from './decision/delivery.mjs';
import {appPackage} from './decision/app-package.mjs';
import {validateRoundState} from '../../shared/round-state.mjs';
import {privateLock} from './private/process-lock.mjs';
import {loadJson} from './private-store.mjs';
import {sha256} from './goals/data.mjs';
const execute=promisify(execFile);
export const APPROVED_REFERENCE_SHA='3d477e4f8c9b9ab5393514af3f8f711443787a3fe4396cc84695dbdb8b696d77';
const fail=message=>{throw Error(message);};
const optional=async file=>{try{return await readSnapshot(file);}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
export const screeningDirectory=root=>path.join(root,'.local/research-review/cohorts/reference-g8-20261023-v1/screening');

// All checks use the historic freeze clock. This verifies an existing grant;
// it cannot renew it or create a new forecast after its expiry.
export async function loadFrozenReference(root,filename){
 const verified=await verifyReferenceReceipt(root);
 if(verified.status!=='FROZEN_VERIFIED')fail('REFERENCE_SCREEN_REQUIRES_FROZEN_VERIFIED');
 const {plan,input}=await loadReferencePlan(root,filename);
 if(digest(input.proposal)!==APPROVED_REFERENCE_SHA)fail('REFERENCE_SCREEN_UNAPPROVED_PROPOSAL');
 const base=path.dirname(screeningDirectory(root)),intent=await readSnapshot(path.join(base,'freeze-intent.json')),
  receipt=await readSnapshot(path.join(base,'freeze-receipt.json'));
 const check=await referenceSeriesPreflight({...input,now:new Date(intent.startedAtUtc)});
 if(digest({check,calendar:input.calendar,study:input.study})!==intent.inputSha256||receipt.proposalSha256!==APPROVED_REFERENCE_SHA)
  fail('REFERENCE_SCREEN_FREEZE_INPUT_CHANGED');
 const journals={};
 for(const kind of ['v1','v2']){
  const file=await privateInput(root,verified.journals[kind].file),realBase=await fs.realpath(base),rel=path.relative(realBase,file);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))fail('REFERENCE_SCREEN_JOURNAL_NAMESPACE');
  journals[kind]=await readSnapshot(file);
  if(digest(journals[kind].manifest.events)!==digest(kind==='v1'?manifestFromSchedule(input.schedule):input.schedule.events)
   ||journals[kind].sourceData==='synthetic_test'||journals[kind].synthetic||journals[kind].provenance?.synthetic)
   fail('REFERENCE_SCREEN_JOURNAL_IDENTITY');
 }
 if(input.dataset.synthetic||input.study.synthetic||input.registry.study.synthetic||journals.v1.provenance.datasetSha256!==digest(input.dataset)
  ||journalIssues(journals.v1,input.registry.study,Date.parse(journals.v1.generatedAtUtc)).length)fail('REFERENCE_SCREEN_ORIGINAL_REQUIRED');
 validateJournal(journals.v2,input.study);
 if(journals.v2.datasetSha256!==digest(input.dataset)||journals.v2.datasetAcquiredAtUtc!==input.dataset.acquiredAtUtc
  ||journals.v2.sourceCommit!==input.dataset.commit||digest(journals.v2.sourceFiles)!==digest(input.dataset.files))fail('REFERENCE_SCREEN_DATASET_LINK');
 return {plan,input,verified,frozenAtUtc:receipt.generatedAtUtc,journal:journals.v1,extensionJournal:journals.v2};
}
const manifestFromSchedule=s=>s.events.map(e=>({fixtureId:e.fixtureId,home:e.home,away:e.away,kickoffUtc:e.kickoffUtc,season:s.season,matchday:s.matchday}));

export function bindReferenceReport(reference,report,{synthetic=false}={}){
 const {journal,input}=reference;
 if(reference.frozenAtUtc&&(!Number.isFinite(Date.parse(report.fetchedAtUtc))||Date.parse(report.fetchedAtUtc)<Date.parse(reference.frozenAtUtc)))fail('REFERENCE_SCREEN_QUOTES_PRECEDE_COMPLETED_FREEZE');
 if(report.source?.mode!==(synthetic?'synthetic_test':'api')||report.source.provider!=='OddsPapi'||report.source.bookmaker!=='bet365.it'
  ||report.source.tournamentId!==23||digest(manifestFromReport(report,input.schedule).events)!==digest(journal.manifest.events)
  ||digest([...report.round.fixtureIds].sort())!==digest(journal.manifest.events.map(e=>e.fixtureId).sort())
  ||report.selections.some(q=>!journal.entries.some(e=>e.fixtureId===q.fixtureId)))fail('REFERENCE_SCREEN_REPORT_IDENTITY');
}

// Presentation gate only: no EV thresholds or selection choices are computed here.
// A partial census cannot establish absence of value across a whole round.
export function experimentOutcome(bundle,{now=bundle.decision.generatedAtUtc}={}){
 verifyDecisionBundle(bundle);
 const d=bundle.decision,at=new Date(now).getTime(),selected=d.selector.selected;
 if(!Number.isFinite(at)||at<Date.parse(d.generatedAtUtc))fail('REFERENCE_SCREEN_CLOCK');
 if(selected){
  if(selected.selections.some(s=>Date.parse(bundle.journal.entries.find(e=>e.fixtureId===s.fixtureId).kickoffUtc)<=at+150*60000))
   return {state:'ANALYSIS_INCOMPLETE',phase:'TECHNICALLY_INCOMPLETE',reasons:['USEFUL_DELIVERY_WINDOW_MISSED']};
  return {state:'MULTIPLA_SIMULATA',phase:'SHADOW_PROPOSAL',reasons:[]};
 }
 const reasons=new Set(),rows=d.opportunities.screening;
 if(d.opportunities.globalIssues.length||d.opportunities.counts.insufficient)reasons.add('UNUSABLE_OR_INCOMPLETE_PRICES_OR_FORECAST');
 const eligible=d.progressive?.eligibleFixtureIds??bundle.journal.entries.map(e=>e.fixtureId);
 for(const id of eligible)for(const outcome of ['1','X','2'])if(rows.filter(r=>r.fixtureId===id&&r.outcome===outcome).length!==1)reasons.add('INCOMPLETE_1X2_COVERAGE');
 if(!rows.length||eligible.length<2)reasons.add('INSUFFICIENT_ELIGIBLE_FIXTURES');
 if(eligible.some(id=>!d.contextGate.eligibleFixtureIds.includes(id)))reasons.add('CONTEXT_REVIEW_REQUIRED');
 for(const e of d.selectionGate.entries)if(e.reasons.some(r=>r!=='human_exclusion'))reasons.add('SELECTION_REVIEW_REQUIRED');
 if(rows.some(c=>eligible.includes(c.fixtureId)&&!c.availability.verified))reasons.add('BET365_PRICE_NOT_MANUALLY_VERIFIED');
 if(d.selector.truncated)reasons.add('SEARCH_BUDGET_EXCEEDED');
 if(d.selector.combinations.some(c=>c.actualPrice===null))reasons.add('COMBINATION_EVIDENCE_INSUFFICIENT');
 if(!['NO_VALUE','UNCERTAIN_VALUE','NOT_ENOUGH_DISTINCT_OPPORTUNITIES','JOINT_VALUE_NOT_DEMONSTRATED','DEPENDENT_OR_REPEATED_EVENTS'].includes(d.noBetCause))
  reasons.add(d.noBetCause??'UNCLASSIFIED_INCOMPLETE_ANALYSIS');
 return reasons.size?{state:'ANALYSIS_INCOMPLETE',phase:'EVIDENCE_INSUFFICIENT',reasons:[...reasons].sort()}:
  {state:'NO_BET',phase:'NO_BET_PROVISIONAL',reasons:[d.noBetCause]};
}
export function experimentPayload({bundle,reference,intent,now=intent.startedAtUtc}){
 const outcome=bundle?experimentOutcome(bundle):{state:'ANALYSIS_INCOMPLETE',phase:'EVIDENCE_INSUFFICIENT',reasons:['QUOTES_NOT_ACQUIRED']};
 if(outcome.state==='MULTIPLA_SIMULATA'){
  const decision={...bundle.decision,final:true};decision.governance=governance(decision);
  return {outcome,payload:appPackage({...bundle,decision}),decision};
 }
 const payload={schema:'lamultipla-app-round-state-v1',id:'reference-g8-screen-'+intent.attemptId,
  round:{season:reference.journal.manifest.season,matchday:reference.journal.manifest.matchday},generatedAtUtc:bundle?.decision.generatedAtUtc??now,
  status:'no_bet',phase:outcome.phase,mode:'experimental',delivery:'private_local',sourceData:bundle?.decision.provenance.sourceData??(reference.journal.provenance?.synthetic?'synthetic_test':'local_original_artifacts'),
  final:false,actualStakeEUR:0,nominalStakeEUR:0,operational:{decision:'NO_BET',cause:'MODEL_NOT_AUTHORIZED',authorized:false,publicationAllowed:false},
  protocolVersion:PROGRESSIVE_POLICY.version,calendarSha256:digest(reference.input.schedule),attemptHashes:[digest(intent),...(bundle?[digest(bundle.decision)]:[])],
  reasonCodes:outcome.reasons,nextWindowAtUtc:timing(reference.input.schedule,new Date(payloadClock(bundle,now))).nextWindowAtUtc};
 return {outcome,payload:validateRoundState(payload),decision:bundle?.decision??null};
}
const payloadClock=(bundle,now)=>bundle?.decision.generatedAtUtc??now;

// The sole decision producer remains scripts/shadow.mjs, in local preview mode.
export async function runShadowPreview({root,reference,files,metadataFile,decisionFile}){
 const args=[path.join(root,'scripts/shadow.mjs'),'--preview','--preview-out',decisionFile,'--attempt-metadata',metadataFile,
  '--study',reference.plan.studyV1File,'--journal',reference.verified.journals.v1.file,'--report',files.report.file,
  '--context-dataset',reference.plan.datasetFile];
 for(const [key,option] of [['assessment','--assessment'],['context','--context'],['contextEvidence','--context-evidence'],['combinedPrices','--combined-prices']])if(files[key])args.push(option,files[key].file);
 try{await execute(process.execPath,args,{cwd:root,windowsHide:true,timeout:180000,maxBuffer:512*1024});}
 catch(error){
  const file=path.join(path.dirname(decisionFile),'shadow-failure.json');
  if(!await optional(file))await writeSame(file,{schema:'lamultipla-reference-screen-shadow-failure-v1',observedAtUtc:new Date().toISOString(),
   reason:'SELECTOR_PROCESS_FAILED_OR_TIMED_OUT',exitCode:typeof error.code==='number'?error.code:null,killed:error.killed===true,
   decisionMayBeCommitted:Boolean(await optional(decisionFile)),providerRequests:0,automaticRetry:false});
  fail('REFERENCE_SCREEN_SHADOW_FAILED_REVIEW_PRIVATE_OUTPUT');
 }
 return readSnapshot(decisionFile);
}
export async function runReferenceScreen({root,reference,files={},attemptId,clock=()=>new Date(),runShadow=runShadowPreview,afterStage=async()=>{}}){
 if(!/^\d{4}$/.test(attemptId)||Number(attemptId)<1)fail('REFERENCE_SCREEN_ATTEMPT_REQUIRED');
 const directory=path.join(screeningDirectory(root),attemptId);
 return privateLock(screeningDirectory(root),async()=>{
  const inputSha256=digest({version:'reference-screen-v1',attemptId,receipt:reference.verified.receiptSha256,
   inputs:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,{file:v.file,sha256:digest(v.value)}]))});
  const old=await optional(path.join(directory,'intent.json'));
  if(old&&old.inputSha256!==inputSha256)fail('REFERENCE_SCREEN_ATTEMPT_INPUT_CHANGED');
  const final=await optional(decisionPath(path.join(root,'.local/shadow'),reference.journal.manifest.season,reference.journal.manifest.matchday));
  if(final&&final.provenance?.referenceScreenInputSha256!==inputSha256)fail('REFERENCE_SCREEN_FINAL_ALREADY_EXISTS');
  const intent=old??{schema:'lamultipla-reference-screen-intent-v1',attemptId,inputSha256,startedAtUtc:clock().toISOString(),receiptSha256:reference.verified.receiptSha256};
  if(Date.parse(intent.startedAtUtc)>clock().getTime())fail('REFERENCE_SCREEN_CLOCK');
  await writeSame(path.join(directory,'intent.json'),intent);await afterStage('intent');
  if(files.report)bindReferenceReport(reference,files.report.value,{synthetic:reference.journal.provenance?.synthetic===true});
  const time=timing(reference.input.schedule,new Date(intent.startedAtUtc));
  const metadata={schema:'lamultipla-progressive-attempt-v1',attemptId,revision:Number(attemptId),protocolSha256:digest(PROGRESSIVE_POLICY),
   roundIdentitySha256:digest(validateRoundIdentity(reference.input.schedule)),scheduleSha256:digest(reference.input.schedule),
   scientificJournalSha256:digest(reference.journal),inputSha256,protocolDocumentSha256:sha256((await fs.readFile(path.join(root,PROGRESSIVE_POLICY.protocolPath),'utf8')).replace(/\r\n/g,'\n')),
   plannedAtUtc:intent.startedAtUtc,eligibleFixtureIds:time.eligibleFixtureIds};
  const metadataFile=path.join(directory,'attempt.json'),decisionFile=path.join(directory,'decision.json');await writeSame(metadataFile,metadata);
  let bundle=null;
  if(files.report){
   let decision=await optional(decisionFile);
   if(!decision){decision=await runShadow({root,reference,files,metadataFile,decisionFile,metadata});await writeSame(decisionFile,decision);}
   if(digest(decision.progressive)!==digest(metadata)||decision.provenance.sourceData!==(reference.journal.provenance?.synthetic?'synthetic_test':'local_original_artifacts'))fail('REFERENCE_SCREEN_DECISION_LINK');
   bundle={decision,journal:reference.journal,report:files.report.value,study:reference.input.registry.study,assessment:files.assessment?.value??{}};
   verifyDecisionBundle(bundle);
   if(files.context&&digest(decision.context)!==digest(files.context.value)
    ||files.contextEvidence&&digest(decision.context.evidence)!==digest(files.contextEvidence.value)
    ||decision.selector.combinations.some(c=>c.actualPriceVerification&&!files.combinedPrices?.value.some(v=>digest(v)===digest(c.actualPriceVerification))))
    fail('REFERENCE_SCREEN_REVIEW_INPUT_CHANGED');
  }
  await afterStage('decision');
  const result=experimentPayload({bundle,reference,intent});
  if(result.decision&&result.outcome.state==='MULTIPLA_SIMULATA'){
   result.decision.provenance={...result.decision.provenance,referenceScreenInputSha256:inputSha256};
   // Provenance participates in replay; rebuild only governance, never selection.
   result.decision.governance=governance(result.decision);
   verifyDecisionBundle({...bundle,decision:result.decision});
   await commitFinal(root,result.decision);
   result.payload=appPackage({...bundle,decision:result.decision});
  }
  await afterStage('final');
  const packageFile=path.join(directory,'app-package.json');await writeSame(packageFile,result.payload);
  const receipt={schema:'lamultipla-reference-screen-receipt-v1',inputSha256,attemptId,referenceReceiptSha256:reference.verified.receiptSha256,
   ...result.outcome,decisionSha256:result.decision?digest(result.decision):null,packageFile,packageSha256:digest(result.payload),
   generatedAtUtc:result.payload.generatedAtUtc,providerRequests:0,deliveryExecuted:false,actualStakeEUR:0};
  await writeSame(path.join(directory,'receipt.json'),receipt);return receipt;
 });
}
export async function loadScreenFiles(root,options){
 if(options.latestReport){
  if(options.report)fail('REFERENCE_SCREEN_CHOOSE_ONE_REPORT');
  const latest=await loadJson(path.join(root,'.local/oddspapi/latest.json'));
  if(latest.schema!==1||typeof latest.reportPath!=='string')fail('REFERENCE_SCREEN_LATEST_REPORT_INVALID');
  options={...options,report:path.resolve(root,'.local/oddspapi',latest.reportPath)};
 }
 const files={};for(const key of ['report','assessment','context','contextEvidence','combinedPrices'])if(options[key]){
  const file=await privateInput(root,options[key]);files[key]={file,value:key==='context'?await readSnapshot(file):await loadJson(file)};
 }
 if(files.context&&files.contextEvidence)fail('REFERENCE_SCREEN_CHOOSE_ONE_CONTEXT');
 return files;
}

// A local authorization manifest, never a collector. Account balance remains
// unknown until a separately authorized free check is actually performed.
export async function referenceQuotePlan(root,reference,{now=new Date()}={}){
 const schedule=reference.input.schedule,at=new Date(now).getTime();let cache=null;
 try{cache=await loadJson(path.join(root,'.local/oddspapi/catalog-cache.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const age=cache?at-Date.parse(cache.fetchedAtUtc):Infinity;
 if(cache&&(cache.schema!==1||!Number.isFinite(age)||age<0||!cache.catalog))fail('REFERENCE_SCREEN_CATALOG_CACHE_INVALID');
 const cached=age<7*86400000;
 const times=schedule.events.map(e=>Date.parse(e.kickoffUtc));
 return {schema:'lamultipla-reference-quote-request-plan-v1',cohortId:'reference-g8-20261023-v1',referenceReceiptSha256:reference.verified.receiptSha256,
  observedAtUtc:new Date(now).toISOString(),executionAllowed:false,requiresSeparateUserConsent:true,
  round:{season:schedule.season,matchday:schedule.matchday,fixtureIds:schedule.events.map(e=>e.fixtureId),
   fromUtc:new Date(Math.min(...times)).toISOString(),toUtc:new Date(Math.max(...times)+1).toISOString()},
  endpointBase:'https://api.oddspapi.io/v4',
  requests:[{method:'GET',endpoint:'/account',maxRequests:1,maxCounted:0,condition:'ONLY_IF_CONFIRMED_UNMETERED'},
   {method:'GET',endpoint:'/markets',params:{language:'en'},maxRequests:cached?0:1,maxCounted:cached?0:1,condition:'ONLY_IF_CACHE_MISSING_OR_OLDER_THAN_7_DAYS'},
   {method:'GET',endpoint:'/odds-by-tournaments',params:{tournamentIds:23,bookmakers:'bet365.it',language:'en',verbosity:3},maxRequests:1,maxCounted:1}],
  maxAdditionalCountedRequests:cached?1:2,fixturesRequestIncluded:false,
  catalog:cache?{observedAtUtc:cache.fetchedAtUtc,sha256:digest(cache.catalog),reusableNow:cached}:null,
  reuseReportRequires:['EXACT_TEN_FIXTURE_IDENTITIES','API_BET365_IT','HASH_VERIFIED','AFTER_FROZEN_FORECAST','AGE_AT_MOST_30_MINUTES','NO_AMBIGUOUS_REQUEST'],
  currentRemoteBalance:null,retries:0,pagination:false,automatic:false,deliveryAllowed:false,actualStakeEUR:0};
}
