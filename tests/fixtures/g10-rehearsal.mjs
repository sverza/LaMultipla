// Test-only: real registered algorithms, invented clubs/results/quotes, artificial UTC.
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {ROOT} from '../../scripts/lib/private-store.mjs';
import {EXPERIMENT} from '../../scripts/lib/engine/study.mjs';
import {engineCodeIdentity,requireRegisteredCode} from '../../scripts/lib/engine/registry.mjs';
import {validateSchedule,freezeEngine} from '../../scripts/lib/engine/forecast.mjs';
import {validateCurrentDataset} from '../../scripts/lib/shadow/registry.mjs';
import {freezeForwardForecast} from '../../scripts/lib/shadow/pipeline.mjs';
import {referenceWindow} from '../../scripts/lib/reference-series.mjs';
import {privateLock} from '../../scripts/lib/private/process-lock.mjs';
import {readSnapshot,writeExclusive,digest} from '../../scripts/lib/prospective/store.mjs';
import {adaptMoviOddsReference} from '../../scripts/lib/reference-odds/moviodds-offline.mjs';
import {exploreInternational} from '../../scripts/lib/reference-odds/exploratory.mjs';
import {hashBytes} from '../../scripts/lib/mm-simulator-v1/contracts.mjs';
const optional=async file=>{try{return await readSnapshot(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export async function makeG10Rehearsal(root){
 const kickoff=['2026-10-31T14:00:00Z','2026-10-31T17:00:00Z','2026-10-31T19:45:00Z','2026-11-01T11:30:00Z','2026-11-01T14:00:00Z','2026-11-01T14:00:00Z',
  '2026-11-01T17:00:00Z','2026-11-01T19:45:00Z','2026-11-02T17:30:00Z','2026-11-02T19:45:00Z'];
 const manifest={schema:'lamultipla-prospective-schedule-v1',season:'2026/27',matchday:10,scheduleSource:'SYNTHETIC_ONLY_NOT_OFFICIAL',events:kickoff.map((kickoffUtc,i)=>({
  fixtureId:'SYNTHETIC-G10-'+i,home:'SYNTHETIC Home '+i,away:'SYNTHETIC Away '+i,kickoffUtc,status:'scheduled'}))};
 const rows=[];for(let y=2022;y<=2025;y++)for(let d=1;d<=8;d++)for(let i=0;i<10;i++){
  const season=`${y}-${String(y+1).slice(-2)}`,date=`${y}-09-${String(d).padStart(2,'0')}`,home=`SYNTHETIC Home ${i}`,away=`SYNTHETIC Away ${(i+d)%10}`;
  rows.push({key:`${season}:${home}:${away}`,season,date,home,away,goals:[(i+d)%3,(2*i+d)%3],availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()});}
 const dataset={schema:'lamultipla-results-dataset-v1',synthetic:true,source:'openfootball/football.json',commit:'a'.repeat(40),license:'CC0-1.0',
  licenseSha256:'36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673',files:[{path:'2025-26/it.1.json',sha256:'a'.repeat(64)}],
  acquiredAtUtc:'2026-10-31T07:00:00.000Z',cutoffUtc:'2026-10-31T07:00:00.000Z',rows};
 const code=await engineCodeIdentity(ROOT),study={schema:'lamultipla-engine-development-v2',synthetic:true,experiment:EXPERIMENT,
  selected:Object.fromEntries(['dc','bivariate'].map(kind=>[kind,{config:{kind,halfLife:365,ridge:20},temperature:1}])),generatedAtUtc:'2026-10-14T00:00:00.000Z',
  validFor:'DEVELOPMENT_AND_CALIBRATION_ONLY',validatedMarkets:[],operationallyApproved:false,modelCodeSha256:code.sha256,protocolSha256:code.protocolSha256};
 return {sourceKind:'SYNTHETIC_TEST_ONLY',root,manifest,dataset,study,
  registry:{study:{schema:'lamultipla-goals-study-v1',synthetic:true,validationCompletedAtUtc:'2026-10-09T23:00:00.000Z'},identity:{synthetic:true},dataset}};
}
export async function runG10Rehearsal(input,{simulatedNow='2026-10-31T08:05:00.000Z',stopAfterV1=false}={}){
 if(input.sourceKind!=='SYNTHETIC_TEST_ONLY'||!path.basename(input.root).startsWith('SYNTHETIC-G10-')||!input.dataset.synthetic||!input.study.synthetic
  ||input.manifest.events.some(e=>!e.fixtureId.startsWith('SYNTHETIC-G10-')||!e.home.startsWith('SYNTHETIC ')))throw Error('SYNTHETIC_SANDBOX_ONLY');
 const actualStartedAtUtc=new Date().toISOString(),wall=performance.now(),timings={},at=Date.parse(simulatedNow),clock=()=>new Date(simulatedNow);
 referenceWindow(input.manifest,simulatedNow);validateSchedule(input.manifest,simulatedNow);validateCurrentDataset(input.dataset,simulatedNow);await requireRegisteredCode(ROOT,input.study);
 const binding=digest({manifest:input.manifest,dataset:input.dataset,study:input.study}),old=await optional(path.join(input.root,'synthetic-intent.json'));
 if(old&&(old.inputSha256!==binding||Date.parse(old.simulatedStartedAtUtc)>at))throw Error('SYNTHETIC_CHANGED_INPUT_OR_BACKWARDS_CLOCK');
 return privateLock(input.root,async()=>{
  if(!old)await writeExclusive(path.join(input.root,'synthetic-intent.json'),{schema:'lamultipla-synthetic-g10-rehearsal-intent-v1',synthetic:true,inputSha256:binding,simulatedStartedAtUtc:simulatedNow});
  let start=performance.now();const v1=await freezeForwardForecast({...input,root:input.root,schedule:input.manifest,clock});timings.v1ms=performance.now()-start;
  if(stopAfterV1)throw Error('SYNTHETIC_SAFE_STOP_AFTER_V1');
  start=performance.now();const v2=await freezeEngine({root:input.root,study:input.study,dataset:input.dataset,schedule:input.manifest,clock});timings.v2ms=performance.now()-start;
  const read1=await readSnapshot(v1.filename),read2=await readSnapshot(v2.filename);
  if(digest(read1)!==digest(v1.journal)||digest(read2)!==digest(v2.journal)||read2.sourceData!=='synthetic_test')throw Error('SYNTHETIC_FREEZE_HASH_INVALID');
  const observedAtUtc=new Date(at+2000).toISOString(),evaluation=new Date(at+3000).toISOString(),
   data={server_time:new Date(at+1000).toISOString(),matches:input.manifest.events.map(e=>({id:e.fixtureId,home:e.home,away:e.away,league:'Italy Serie A',sport:'soccer',in_play:false,kickoff_utc:e.kickoffUtc,
    group_status:{'10150':{polled_at:new Date(at+1000).toISOString()},'981':{polled_at:new Date(at+1000).toISOString()}},quotes:[['10150','Both Teams To Score','Yes'],['10150','Both Teams To Score','No'],['981','Goals Over/Under','Over'],['981','Goals Over/Under','Under']].map(([g,n,o])=>({fixture_id:e.fixtureId,group_id:g,group_name:n,sel_id:e.fixtureId+'-'+o,market_id:g,odds_dec:2,ts:new Date(at+1000).toISOString(),...(g==='10150'?{label:o}:{side:o,line:'2.5'})}))}))},
   wireBytes=Buffer.from(JSON.stringify(data)),sha256=hashBytes(wireBytes),receipt={schema:'lamultipla-public-feed-diagnostic-receipt-v1',synthetic:true,url:'https://moviodds.com/odds?sport=soccer',
    status:200,complete:true,error:null,headers:{'content-type':'application/json'},requestAtUtc:simulatedNow,receivedAtUtc:observedAtUtc,completedAtUtc:observedAtUtc,sha256,bytes:wireBytes.length},
   boards=adaptMoviOddsReference({wireBytes,receipt,rawReference:{ref:'SYNTHETIC_ONLY_NOT_A_REQUEST.json',sha256},evaluatedAtUtc:evaluation}),
   bindings={schema:'lamultipla-movi-round-bindings-v1',provider:'MoviOdds',scope:{cohortId:'SYNTHETIC-G10-NOT-AN-APPROVED-COHORT',season:'2026/27',round:10},manifestSha256:digest(input.manifest),events:input.manifest.events.map(e=>({...e,sourceFixtureId:e.fixtureId,sourceHome:e.home,sourceAway:e.away}))};
  const report=exploreInternational({manifest:input.manifest,bindings,journal:v2.journal,study:input.study,freezeCompletedAtUtc:simulatedNow,boards,
   slot:{id:'SYNTHETIC-SATURDAY-ONLY',fixtureIds:input.manifest.events.slice(0,3).map(e=>e.fixtureId)},evaluatedAtUtc:evaluation,sourceKind:'SYNTHETIC_TEST_ONLY',
   calendar:{officialObservedAtUtc:simulatedNow,cc0ObservedAtUtc:simulatedNow,providerIdentitiesObservedAtUtc:observedAtUtc}});
  const result={schema:'lamultipla-synthetic-g10-rehearsal-receipt-v1',synthetic:true,inputSha256:binding,simulatedClockUtc:simulatedNow,
   actualStartedAtUtc,actualCompletedAtUtc:new Date().toISOString(),timings:{...timings,totalMs:performance.now()-wall},
   v1:{file:v1.filename,sha256:digest(v1.journal)},v2:{file:v2.filename,sha256:digest(v2.journal)},reportSha256:report.canonicalSha256,
   expectedRegisteredFitComputations:124,providerRequests:0,authenticFreeze:false,actualStakeEUR:0};
  const prior=await optional(path.join(input.root,'synthetic-receipt.json'));
  if(prior){if(prior.inputSha256!==binding||prior.reportSha256!==report.canonicalSha256)throw Error('SYNTHETIC_REPLAY_CONFLICT');return {receipt:prior,report,reused:true};}
  await writeExclusive(path.join(input.root,'synthetic-receipt.json'),result);return {receipt:result,report,reused:false};
 });
}
