// Entirely invented archive, explicitly SYNTHETIC, including approvals/receipts.
// It exercises the reader contracts; it never claims a real future freeze.
import fs from 'node:fs/promises';
import path from 'node:path';
import {syntheticCompositionFixture} from './mm-composition.mjs';
import {buildReport} from '../../scripts/lib/odds-report.mjs';
import {hashBytes,hashValue,INPUT_SCHEMA} from '../../scripts/lib/mm-simulator-v1/contracts.mjs';
import {envelope} from '../../scripts/lib/prospective/store.mjs';
import {MODEL_VERSION,MODEL_COMMIT,MODEL_CODE_SHA,PROTOCOL_SHA,CONFIG,journalId} from '../../scripts/lib/prospective/freeze.mjs';
import {READER_INPUT_SCHEMA,ROUND_INDEX_SCHEMA,ROUND_APPROVAL_SCHEMA,ROUND_INTENT_SCHEMA,ROUND_RECEIPT_SCHEMA,roundBindings} from '../../scripts/lib/mm-simulator-v1/prospective-archive.mjs';
import {roundArchiveDirectory} from '../../scripts/lib/mm-simulator-v1/prospective-reader.mjs';
import {ROOT} from '../../scripts/lib/private-store.mjs';
import {syntheticMultimarket} from './multimarket.mjs';

export async function syntheticReaderArchive(root,{round=9}={}){
 const f=await syntheticCompositionFixture({events:10}),observed='2026-10-30T12:50:00.000Z',generated='2026-10-30T12:46:00.000Z';
 const scope={cohortId:'SYNTHETIC-READER-COHORT',season:'2026/27',round},base=roundArchiveDirectory(root,scope,{synthetic:true});
 const manifest=structuredClone(f.source?.schedule??f.journal.manifest);manifest.schema='lamultipla-prospective-schedule-v1';manifest.matchday=round;
 manifest.events=manifest.events.map((e,i)=>({...e,kickoffUtc:i===0?'2026-10-30T18:45:00.000Z':i<5?'2026-10-31T13:00:00.000Z':'2026-11-01T13:00:00.000Z'}));
 const dataset={schema:'lamultipla-results-dataset-v1',synthetic:true,source:'openfootball/football.json',commit:'a'.repeat(40),license:'CC0-1.0',
  licenseSha256:'36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673',acquiredAtUtc:'2026-10-30T12:00:00.000Z',
  cutoffUtc:'2026-10-30T12:00:00.000Z',files:[{path:'2025-26/it.1.json',sha256:'a'.repeat(64)}],rows:[]};
 const calendar=structuredClone((await syntheticMultimarket()).calendar);
 calendar.observedAtUtc='2026-10-30T12:20:00.000Z';calendar.source.fetchedAtUtc=calendar.observedAtUtc;
 calendar.fixtures=calendar.fixtures.map((e,i)=>({...e,startTime:manifest.events[i].kickoffUtc,updatedAt:calendar.observedAtUtc}));
 const wall=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 calendar.source.body=JSON.stringify({name:'Italian Serie A 2026/27',matches:manifest.events.map(e=>{
  const p=Object.fromEntries(wall.formatToParts(new Date(e.kickoffUtc)).map(p=>[p.type,p.value]));
  return {round:'Matchday '+round,date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute,team1:e.home,team2:e.away};})});
 calendar.source.bodySha256=hashBytes(calendar.source.body);
 manifest.source={officialUrl:'https://www.legaseriea.it/synthetic',officialPdfUrl:'https://www.legaseriea.it/synthetic.pdf',
  confirmedAtUtc:calendar.observedAtUtc,providerObservedAtUtc:calendar.observedAtUtc,providerFixturesSha256:hashValue(calendar.fixtures)};
 const studyV2=f.study,journalV2=f.journal;
 journalV2.generatedAtUtc=generated;journalV2.startedAtUtc='2026-10-30T12:45:00.000Z';journalV2.datasetSha256=hashValue(dataset);
 journalV2.datasetAcquiredAtUtc=dataset.acquiredAtUtc;journalV2.sourceFiles=dataset.files;journalV2.sourceCommit=dataset.commit;
 journalV2.manifest={season:scope.season,matchday:round,events:structuredClone(manifest.events)};
 journalV2.manifestSha256=hashValue(journalV2.manifest);
 for(let n=0;n<10;n++){
  const e=journalV2.entries[n];e.kickoffUtc=manifest.events[n].kickoffUtc;e.generatedAtUtc=generated;
  for(const p of Object.values(e.forecasts))p.uncertainty.seed=20261010;
  const {entrySha256,...content}=e;void entrySha256;e.entrySha256=hashValue(content);
 }
 journalV2.id=`2026-27-round-${round}-${hashValue(studyV2).slice(0,16)}`;
 const studyV1={schema:'lamultipla-goals-study-v1',synthetic:true,validationCompletedAtUtc:'2026-10-14T17:00:00.000Z',acceptance:{oneXTwo:{retrospectiveAccepted:true}}};
 const v1manifest={schema:'lamultipla-round-manifest-v1',season:scope.season,matchday:round,events:manifest.events.map(e=>({...e,season:scope.season,matchday:round}))};
 const journalV1={schema:'lamultipla-prospective-journal-v1',id:journalId(v1manifest),modelVersion:MODEL_VERSION,modelCommit:MODEL_COMMIT,
  modelCodeCanonicalSha256:MODEL_CODE_SHA,protocolCanonicalSha256:PROTOCOL_SHA,config:CONFIG,fit:{converged:true,config:CONFIG,cutoffUtc:'2026-10-01T00:00:00.000Z'},
  generatedAtUtc:generated,trainingCutoffUtc:'2026-10-01T00:00:00.000Z',manifest:v1manifest,manifestSha256:hashValue(v1manifest),
  provenance:{synthetic:true,studySha256:hashValue(studyV1),datasetSha256:hashValue(dataset),datasetAcquiredAtUtc:dataset.acquiredAtUtc,sourceCommit:dataset.commit,sourceFiles:dataset.files},
  entries:v1manifest.events.map(e=>{const v={...e,status:'prospective',generatedAtUtc:generated};return {...v,entrySha256:hashValue(v)};})};
 const plannedRounds=[];let year=2026,day=8;for(let i=0;i<60;i++){plannedRounds.push({season:`${year}/${String(year+1).slice(-2)}`,matchday:day,expectedEvents:10});if(++day===39){year++;day=1;}}
 const proposal={synthetic:true,id:scope.cohortId,sourceRole:'A',source:'openfootball/football.json',plannedEvents:600,plannedRounds,
  initialCutoffUtc:'2026-10-01T00:00:00.000Z',models:[{id:'goals-v1',studySha256:hashValue(studyV1)},...['dc-v2','bivariate-v2'].map(id=>({id,studySha256:hashValue(studyV2)}))]};
 const cohortApproval={synthetic:true,cohortApproved:true,proposalSha256:hashValue(proposal),approvedAtUtc:'2026-10-22T12:00:00.000Z'};
 const roundApproval={schema:ROUND_APPROVAL_SCHEMA,synthetic:true,scope,proposalSha256:hashValue(proposal),cohortApprovalSha256:hashValue(cohortApproval),
  manifestSha256:hashValue(manifest),datasetSha256:hashValue(dataset),studyV2Sha256:hashValue(studyV2),freezeAuthorized:true,sourceRole:'A',
  reviewer:'SYNTHETIC_REVIEWER',provenance:'EXPLICIT_USER_APPROVAL_LOCAL_RECORD',approvedAtUtc:'2026-10-30T12:30:00.000Z',expiresAtUtc:'2026-10-30T16:15:00.000Z'};
 const b={proposal,cohortApproval,roundApproval,manifest,calendar,dataset,studyV1,registryDataset:structuredClone(dataset),studyV2,journalV1,journalV2,intent:null,receipt:null};
 const raw=structuredClone(f.raw),bindings=structuredClone(f.bindings);bindings.round=round;
 for(let n=0;n<10;n++){
  raw[n].startTime=manifest.events[n].kickoffUtc;raw[n].updatedAt=calendar.observedAtUtc;bindings.events[n].kickoffUtc=raw[n].startTime;
  for(const m of Object.values(raw[n].bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))for(const p of Object.values(o.players))p.changedAt='2026-10-30T12:49:00.000Z';
 }
 const cfg=path.join(root,'.local/reader-fixture/input.json'),inputs=path.dirname(cfg);
 const names=await fs.readdir(path.join(ROOT,'scripts/lib/engine'));
 for(const relative of [...names.filter(n=>n.endsWith('.mjs')).map(n=>'scripts/lib/engine/'+n),...['data','model','metrics','study','bridge'].map(n=>'scripts/lib/goals/'+n+'.mjs'),'docs/protocollo-motore-gol-v2.md','docs/protocollo-modello-gol-v1.md']){
  await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});await fs.copyFile(path.join(ROOT,relative),path.join(root,relative));
 }
 const write=async(file,value,sealed=false)=>{await fs.mkdir(path.dirname(file),{recursive:true});const bytes=Buffer.from(JSON.stringify(sealed?envelope(value):value));await fs.writeFile(file,bytes);return {ref:file,sha256:hashBytes(bytes)};};
 async function save(){
  // Test-only writer deliberately rebinds altered vectors so semantic validators,
  // not merely a stale outer checksum, must detect the test corruption.
  b.intent={schema:ROUND_INTENT_SCHEMA,scope,inputSha256:null,bindings:roundBindings(scope,b),startedAtUtc:'2026-10-30T12:45:00.000Z'};b.intent.inputSha256=hashValue(b.intent.bindings);
  const paths={journalV1:path.join(base,'.local/model/prospective/journals',journalId(b.journalV1.manifest)+'.json'),
   journalV2:path.join(base,'.local/model-v2/journals',`2026-27-round-${round}-${hashValue(b.studyV2).slice(0,16)}.json`)};
  b.receipt={schema:ROUND_RECEIPT_SCHEMA,synthetic:true,scope,inputSha256:b.intent.inputSha256,intentSha256:hashValue(b.intent),manifestSha256:hashValue(b.manifest),
   completedAtUtc:'2026-10-30T12:47:00.000Z',journals:{v1:{file:paths.journalV1,sha256:hashValue(b.journalV1)},v2:{file:paths.journalV2,sha256:hashValue(b.journalV2)}},providerRequests:0,quotesRead:false,actualStakeEUR:0};
  const artifacts={};for(const [k,v]of Object.entries(b))artifacts[k]=await write(paths[k]??path.join(base,k==='intent'?'freeze-intent.json':k==='receipt'?'freeze-receipt.json':k+'.json'),v,true);
  const index=await write(path.join(base,'archive-index.json'),{schema:ROUND_INDEX_SCHEMA,scope,artifacts});
  const report=buildReport(raw,f.catalog,{round:{season:scope.season,matchday:round,fixtureIds:manifest.events.map(e=>e.fixtureId),
   fromUtc:'2026-10-30T00:00:00.000Z',toUtc:'2026-11-03T00:00:00.000Z'},observedAt:observed,source:'synthetic_test'});
  const source={providerId:'oddspapi',bookmaker:'bet365.it'};
  for(const [k,v]of [['raw',raw],['catalog',f.catalog],['report',report]])source[k]=await write(path.join(inputs,k+'.json'),v);
  const boardRef=await write(path.join(inputs,'boards.json'),{schema:INPUT_SCHEMA,source,bindings});
  const input={schema:READER_INPUT_SCHEMA,scope,archive:{kind:'ROUND_ARCHIVE_V1',reference:index},boardsInput:boardRef};
  await write(cfg,input);return input;
 }
 const input=await save();return {root,base,cfg,scope,b,raw,bindings,input,save,write,observed,readAtUtc:'2026-10-30T12:51:00.000Z'};
}
