import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {digest,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {sha256} from '../scripts/lib/goals/data.mjs';
import {draftReferenceCohort,romeInstant} from '../scripts/lib/g8-preparation.mjs';
import {assembleReferenceSchedule,inspectReferenceReadiness,validateReferenceProposal,writeReferencePlan,privateOutputDirectory} from '../scripts/lib/reference-readiness.mjs';
import {freezeReferenceSeries,referenceSeriesPreflight,referenceWindow,verifyReferenceReceipt} from '../scripts/lib/reference-series.mjs';
import {writeSame} from '../scripts/lib/shadow/progressive.mjs';
const at='2026-10-23T13:00:00.000Z',observed='2026-10-23T12:40:00.000Z';
const exists=file=>fs.access(file).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
async function input(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lm-reference-synthetic-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'.local'));
 const events=Array.from({length:10},(_,i)=>({fixtureId:'id'+(97000+i),home:'Synthetic H '+i,away:'Synthetic A '+i,kickoffUtc:'2026-10-23T18:45:00.000Z'}));
 const rows=[];for(let y=2024;y<=2025;y++)for(let d=1;d<=10;d++)for(let i=0;i<10;i++){
  const season=`${y}-${String(y+1).slice(-2)}`,date=`${y}-09-${String(d).padStart(2,'0')}`,home=events[i].home,away=events[(i+d)%10].away;
  rows.push({key:`${season}:${home}:${away}`,season,date,home,away,goals:[1,1],availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()});}
 const dataset={schema:'lamultipla-results-dataset-v1',synthetic:true,source:'openfootball/football.json',commit:'a'.repeat(40),license:'CC0-1.0',licenseSha256:'36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673',files:[{path:'2025-26/it.1.json',sha256:'a'.repeat(64)}],rows,acquiredAtUtc:'2026-10-23T12:00:00.000Z',cutoffUtc:'2026-10-23T12:00:00.000Z'};
 const registry={study:{synthetic:true},dataset},study={synthetic:true};
 const proposal=draftReferenceCohort({season:'2026/27',matchday:8,events},{studyV1Sha256:digest(registry.study),studyV2Sha256:digest(study),now:'2026-10-21T12:00:00.000Z'});
 const body=JSON.stringify({name:'Italian Serie A 2026/27',matches:events.map(e=>({round:'Matchday 8',date:'2026-10-23',time:'20:45',team1:e.home,team2:e.away}))});
 const calendar={schema:'lamultipla-private-calendar-snapshot-v1',observedAtUtc:observed,source:{schema:'lamultipla-calendar-public-source-v1',source:'openfootball/football.json',path:'2026-27/it.1.json',commit:'a'.repeat(40),license:'CC0-1.0',licenseSha256:dataset.licenseSha256,body,bodySha256:sha256(body),fetchedAtUtc:observed},fixtures:events.map(e=>({fixtureId:e.fixtureId,sportId:10,tournamentId:23,seasonId:123,statusId:0,participant1Name:e.home,participant2Name:e.away,startTime:e.kickoffUtc}))};
 const documentBytes=Buffer.from('SYNTHETIC OFFICIAL DOCUMENT NOT A REAL ATTESTATION');
 const official={schema:'lamultipla-reference-official-reconfirmation-v1',season:'2026/27',matchday:8,reviewer:'SYNTHETIC_ONLY',observedAtUtc:observed,reviewedAtUtc:observed,officialUrl:'https://www.legaseriea.it/synthetic',officialPdfUrl:'https://www.legaseriea.it/synthetic.pdf',documentSha256:sha256(documentBytes),events};
 const approval={schema:'lamultipla-reference-series-approval-v1',synthetic:true,proposalSha256:digest(proposal),cohortApproved:true,freezeAuthorized:true,round:8,sourceRole:'A',reviewer:'SYNTHETIC_ONLY',approvedAtUtc:'2026-10-22T12:00:00.000Z',expiresAtUtc:'2026-10-23T16:15:00.000Z'};
 const schedule=await assembleReferenceSchedule({proposal,calendar,official,documentBytes,now:at});
 return {root,proposal,registry,study,dataset,calendar,official,documentBytes,approval,schedule};
}
const verifyCode=async()=>({synthetic:true});

test('reference inspection is offline, does no fit or write and distinguishes temporal prerequisites from corruption',async t=>{
 const i=await input(t),before=digest(i),fetchBefore=globalThis.fetch;globalThis.fetch=()=>assert.fail('no network');
 try{
  const r=await inspectReferenceReadiness(i,{now:at,verifyCode});assert.equal(r.state,'READY');assert.equal(r.readOnly,true);
  assert.equal((await fs.readdir(path.join(i.root,'.local'))).length,0);assert.equal(digest(i),before);
  assert.equal((await inspectReferenceReadiness({...i,approval:null,schedule:null,calendar:null},{now:at,verifyCode})).state,'READY_CON_PREREQUISITI_TEMPORALI');
  const changed=structuredClone(i);changed.dataset.rows[0].goals=[5,5];changed.registry.dataset=i.dataset;
  assert.equal((await inspectReferenceReadiness(changed,{now:at,verifyCode})).state,'BLOCKED');
  assert.equal((await inspectReferenceReadiness(i,{now:'2026-10-23T16:15:00Z',verifyCode})).state,'BLOCKED');
 }finally{globalThis.fetch=fetchBefore;}
});
test('reference manifest assembly rejects stale, discordant, swapped or foreign provider identities without inventing IDs',async t=>{
 const i=await input(t);
 const reordered=structuredClone(i);reordered.documentBytes=i.documentBytes;reordered.official.events.reverse();assert.equal((await assembleReferenceSchedule({...reordered,now:at})).events.length,10);
 for(const mutate of [x=>x.official.documentSha256='a'.repeat(64),x=>x.official.observedAtUtc='2026-10-22T12:00:00Z',x=>x.calendar.fixtures[0].fixtureId='m_0pSK27',x=>x.calendar.fixtures[0].participant1Name=x.calendar.fixtures[0].participant2Name,x=>x.calendar.fixtures[0].startTime='2026-10-23T18:46:00Z']){
  const x=structuredClone(i);x.documentBytes=i.documentBytes;mutate(x);
  await assert.rejects(assembleReferenceSchedule({...x,now:at}));
 }
 const x=structuredClone(i);x.documentBytes=i.documentBytes;x.calendar.observedAtUtc='2026-10-23T11:00:00Z';await assert.rejects(assembleReferenceSchedule({...x,now:at}),/RECONFIRM/);
});
test('reference proposal cannot slide sixty rounds, replace source, add a challenger or alter thresholds',async t=>{
 const i=await input(t);for(const mutate of [p=>p.plannedRounds.shift(),p=>p.plannedEvents=590,p=>p.source='PitchAPI',p=>p.challengerAllowed=true,p=>p.evaluation.minPaired=10,p=>p.deadlinePolicy.analysisLeadMinutes=5]){const p=structuredClone(i.proposal);mutate(p);assert.throws(()=>validateReferenceProposal(p),/FRAME_OR_PROTOCOL/);}
});
test('reference execution strictly rejects stale dataset/calendar, unknown status and changed training before fitting',async t=>{
 const i=await input(t);assert.equal((await referenceSeriesPreflight({...i,now:at,verifyCode})).providerRequests,0);
 for(const [mutate,reason] of [[x=>x.dataset.acquiredAtUtc='2026-10-19T12:00:00Z',/DATASET_STALE/],
  [x=>x.calendar.observedAtUtc='2026-10-23T11:00:00Z',/RECONFIRM/],
  [x=>x.calendar.source.fetchedAtUtc='2026-10-22T12:00:00Z',/PUBLIC_SOURCE_INVALID/],
  [x=>{x.calendar.fixtures[0].statusId=2;x.schedule.source.providerFixturesSha256=digest(x.calendar.fixtures);},/DISCREPANCY/],
  [x=>x.schedule.events[0].status='postponed',/DISCREPANCY/]]){
  const x=structuredClone(i);mutate(x);await assert.rejects(referenceSeriesPreflight({...x,now:at,verifyCode}),reason);
 }
 const x=structuredClone(i);x.dataset.rows[0].goals=[5,5];x.registry.dataset=i.dataset;
 await assert.rejects(referenceSeriesPreflight({...x,now:at,verifyCode}),/ORIGINAL_TRAINING_CHANGED/);
});
test('reference private plan assembly is idempotent, pinned, resumable and never activates the cohort',async t=>{
 const i=await input(t),paths={proposalFile:'synthetic',studyV1File:'synthetic',studyV2File:'synthetic',datasetFile:'synthetic',approvalFile:'synthetic',calendarFile:'synthetic'};
 const first=await writeReferencePlan({...i,input:i,out:'.local/authorized-synthetic-only',paths,now:'2026-10-23T12:44:59Z',verifyCode});
 const again=await writeReferencePlan({...i,input:i,out:'.local/authorized-synthetic-only',paths,now:at,verifyCode});
 assert.equal(first.sha256,again.sha256);assert.equal(first.cohortActivated,false);assert.equal(first.forecastProduced,false);
 const plan=await readSnapshot(first.file);assert.equal(plan.inputHashes.dataset,digest(i.dataset));assert.equal(plan.proposalSha256,digest(i.proposal));
 await assert.rejects(writeReferencePlan({...i,input:{...i,approval:null},out:'.local/not-authorized',paths,now:at,verifyCode}),/APPROVAL/);
 assert.equal(await exists(path.join(i.root,'.local/not-authorized')),false);
 await assert.rejects(privateOutputDirectory(i.root,path.join(i.root,'outside-local')),/PRIVATE_OUTPUT/);
});
test('reference window and DST boundary includes final millisecond, excludes close and never uses machine local timezone',()=>{
 const schedule={events:Array.from({length:10},()=>({kickoffUtc:romeInstant('2026-10-23','20:45')}))};
 assert.throws(()=>referenceWindow(schedule,'2026-10-23T12:44:59.999Z'),/OUTSIDE/);
 assert.equal(referenceWindow(schedule,'2026-10-23T16:14:59.999Z').closesAtUtc,'2026-10-23T16:15:00.000Z');assert.throws(()=>referenceWindow(schedule,'2026-10-23T16:15:00.000Z'),/OUTSIDE/);
 assert.equal(romeInstant('2026-10-25','12:30'),'2026-10-25T11:30:00.000Z');assert.throws(()=>romeInstant('2026-10-25','02:30'),/AMBIGUOUS/);
});
test('reference authorization and time checks run before a cohort directory or intent can be created',async t=>{
 const i=await input(t);for(const reason of ['REFERENCE_EXPLICIT_APPROVAL_REQUIRED','REFERENCE_OUTSIDE_WINDOW']){
  await assert.rejects(freezeReferenceSeries(i,{preflight:async()=>{throw Error(reason);},freezeV1:()=>assert.fail(),freezeV2:()=>assert.fail()}),new RegExp(reason));
  assert.equal(await exists(path.join(i.root,'.local/research-review')),false);
 }
});
test('reference concurrent runs cannot duplicate effects; clock rollback aborts and preserves intent without receipt',async t=>{
 const i=await input(t);let unlock,started;const gate=new Promise(r=>{unlock=r;}),entered=new Promise(r=>{started=r;});
 const fake=async({root})=>{const filename=path.join(root,'synthetic-journal.json'),journal={synthetic:true};await writeSame(filename,journal);return {filename,journal};};
 const options={clock:()=>new Date(at),preflight:async()=>({synthetic:true}),freezeV1:async args=>{started();await gate;return fake(args);},freezeV2:fake};
 const first=freezeReferenceSeries(i,options);await entered;await assert.rejects(freezeReferenceSeries(i,options),/già in esecuzione/);unlock();await first;
 const j=await input(t);let n=0;const times=[at,at,'2026-10-23T13:00:02Z','2026-10-23T13:00:01Z'];
 const changingClock=()=>new Date(times[Math.min(n++,times.length-1)]);
 await assert.rejects(freezeReferenceSeries(j,{clock:changingClock,preflight:async()=>({synthetic:true}),freezeV1:async({clock})=>{clock();clock();return fake({root:j.root});},freezeV2:fake}),/CLOCK_BACKWARDS/);
 assert.equal((await verifyReferenceReceipt(j.root)).status,'PARTIAL_REQUIRES_REVIEW');
});
test('reference CLI rejects mixed modes before reading files, and exposes no clock override',()=>{
 for(const args of [['--inspect','--freeze-approved','--plan','missing'],['--inspect','--now','2026-10-23T13:00:00Z']]){
  const r=spawnSync(process.execPath,['scripts/reference-series.mjs',...args],{encoding:'utf8'});assert.notEqual(r.status,0);
 }
 const h=spawnSync(process.execPath,['scripts/private-calendar.mjs','--help'],{encoding:'utf8'});assert.equal(h.status,0);assert.match(h.stdout,/max-age-minutes/);
});
test('standalone reference preflight accepts no freeze, assembly, network, scheduling or clock capability',()=>{
 const file='scripts/reference-preflight.mjs';
 const help=spawnSync(process.execPath,[file,'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/read-only/);
 for(const option of ['--freeze-approved','--assemble','--refresh','--schedule','--now']){
  const result=spawnSync(process.execPath,[file,option,'--plan','missing'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/REFERENCE_LOCAL_INPUT_CHECK_FAILED/);
 }
});
