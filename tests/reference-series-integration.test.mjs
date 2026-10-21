// SYNTHETIC ONLY. Original fit/freeze functions run inside a unique .local/tests root.
// No real approval, source acquisition, G8 team, registry or existing journal is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../scripts/lib/private-store.mjs';
import {digest,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {sha256} from '../scripts/lib/goals/data.mjs';
import {EXPERIMENT} from '../scripts/lib/engine/study.mjs';
import {engineCodeIdentity,requireRegisteredCode} from '../scripts/lib/engine/registry.mjs';
import {freezeForwardForecast} from '../scripts/lib/shadow/pipeline.mjs';
import {freezeReferenceSeries,referenceSeriesPreflight,verifyReferenceReceipt} from '../scripts/lib/reference-series.mjs';
import {freezeEngine} from '../scripts/lib/engine/forecast.mjs';
import {CALENDAR_LICENSE_SHA256} from '../scripts/lib/orchestration/calendar-discovery.mjs';

const within='2026-10-23T13:00:00.000Z';
async function syntheticInput(){
 const root=path.join(ROOT,'.local/tests/reference-series-integration-'+crypto.randomUUID()),events=Array.from({length:10},(_,i)=>({fixtureId:'id'+(97000+i),home:'Synthetic Home '+i,away:'Synthetic Away '+i,kickoffUtc:'2026-10-23T18:45:00.000Z'}));
 const fixtures=events.map(e=>({fixtureId:e.fixtureId,sportId:10,tournamentId:23,seasonId:123,statusId:0,participant1Name:e.home,participant2Name:e.away,startTime:e.kickoffUtc,updatedAt:within}));
 const body=JSON.stringify({name:'Italian Serie A 2026/27',matches:events.map(e=>({round:'Matchday 8',date:'2026-10-23',time:'20:45',team1:e.home,team2:e.away}))});
 const calendar={schema:'lamultipla-private-calendar-snapshot-v1',observedAtUtc:within,fixtures,
  source:{schema:'lamultipla-calendar-public-source-v1',source:'openfootball/football.json',path:'2026-27/it.1.json',commit:'a'.repeat(40),license:'CC0-1.0',licenseSha256:CALENDAR_LICENSE_SHA256,body,bodySha256:sha256(body),fetchedAtUtc:within}};
 const schedule={schema:'lamultipla-prospective-schedule-v1',season:'2026/27',matchday:8,scheduleSource:'SYNTHETIC_TEST_ONLY',events,
  source:{officialUrl:'https://www.legaseriea.it/synthetic',officialPdfUrl:'https://www.legaseriea.it/synthetic.pdf',confirmedAtUtc:within,providerObservedAtUtc:within,providerFixturesSha256:digest(fixtures)}};
 const rows=[];for(let y=2022;y<=2025;y++)for(let d=1;d<=8;d++)for(let i=0;i<10;i++){
  const season=`${y}-${String(y+1).slice(-2)}`,date=`${y}-09-${String(d).padStart(2,'0')}`,home=`Synthetic Home ${i}`,away=`Synthetic Away ${(i+d)%10}`;
  rows.push({key:`${season}:${home}:${away}`,season,date,home,away,goals:[(i+d)%3,(2*i+d)%3],availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()});}
 const dataset={schema:'lamultipla-results-dataset-v1',synthetic:true,source:'openfootball/football.json',commit:'a'.repeat(40),license:'CC0-1.0',licenseSha256:CALENDAR_LICENSE_SHA256,
  files:[{path:'2025-26/it.1.json',sha256:'a'.repeat(64)}],acquiredAtUtc:'2026-10-23T12:00:00.000Z',cutoffUtc:'2026-10-23T12:00:00.000Z',rows};
 const code=await engineCodeIdentity(ROOT),study={schema:'lamultipla-engine-development-v2',synthetic:true,experiment:EXPERIMENT,
  selected:Object.fromEntries(['dc','bivariate'].map(kind=>[kind,{config:{kind,halfLife:365,ridge:20},temperature:1}])),generatedAtUtc:'2026-10-14T00:00:00.000Z',
  validFor:'DEVELOPMENT_AND_CALIBRATION_ONLY',validatedMarkets:[],operationallyApproved:false,modelCodeSha256:code.sha256,protocolSha256:code.protocolSha256};
 const registry={study:{schema:'lamultipla-goals-study-v1',synthetic:true,validationCompletedAtUtc:'2026-10-09T23:00:00.000Z'},identity:{synthetic:true},dataset};
 const proposal={schema:'lamultipla-reference-cohort-proposal-v1',active:false,state:'DRAFT_REQUIRES_USER_APPROVAL',id:'reference-g8-20261023-v1',createdAtUtc:'2026-10-21T10:00:00.000Z',
  firstSeason:'2026/27',firstMatchday:8,firstRoundEvents:events,synthetic:true,
  models:[{id:'goals-v1',studySha256:digest(registry.study)},{id:'dc-v2',studySha256:digest(study)},{id:'bivariate-v2',studySha256:digest(study)}]};
 const approval={schema:'lamultipla-reference-series-approval-v1',proposalSha256:digest(proposal),cohortApproved:true,freezeAuthorized:true,round:8,sourceRole:'A',reviewer:'SYNTHETIC_TEST_ONLY_NOT_A_REAL_APPROVAL',
  approvedAtUtc:'2026-10-22T10:00:00.000Z',expiresAtUtc:'2026-10-23T17:00:00.000Z',synthetic:true};
 return {root,proposal,approval,schedule,calendar,dataset,registry,study};
}
const preflight=input=>referenceSeriesPreflight({...input,verifyCode:(_root,study)=>requireRegisteredCode(ROOT,study)});
const baseOf=input=>path.join(input.root,'.local/research-review/cohorts/reference-g8-20261023-v1');
const exists=file=>fs.stat(file).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});

test('original v1/v2 freezes recover a crash after v1, preserve bytes and reject changed inputs or late reuse',async t=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('freeze-only must never access network');t.after(()=>{globalThis.fetch=originalFetch;});
 const input=await syntheticInput(),inputHash=digest(input),base=baseOf(input),clock=()=>new Date(within);let savedV1;
 await assert.rejects(freezeReferenceSeries(input,{clock,preflight,
  freezeV1:async args=>{savedV1=await freezeForwardForecast(args);return savedV1;},
  freezeV2:async()=>{throw Error('SYNTHETIC_CRASH_AFTER_ORIGINAL_V1');}}),/SYNTHETIC_CRASH_AFTER_ORIGINAL_V1/);
 assert.equal(await exists(path.join(base,'freeze-intent.json')),true);assert.equal(await exists(path.join(base,'freeze-receipt.json')),false);
 assert.equal(savedV1.journal.fit.converged,true);assert.equal(savedV1.journal.counts.prospective,10);
 assert.equal(savedV1.journal.trainingCutoffUtc,'2026-10-01T00:00:00.000Z');
 const originalV1Bytes=await fs.readFile(savedV1.filename),changed=structuredClone(input);changed.dataset.rows[0].goals=[8,8];
 await assert.rejects(freezeReferenceSeries(changed,{clock,preflight}),/CHANGED_INPUT_OR_APPROVAL/);
 assert.deepEqual(await fs.readFile(savedV1.filename),originalV1Bytes);
 let reusedV1=false;const recovered=await freezeReferenceSeries(input,{clock:()=>new Date('2026-10-23T13:00:15.000Z'),preflight,
  freezeV1:async args=>{const result=await freezeForwardForecast(args);reusedV1=result.reused;return result;}});
 assert.equal(reusedV1,true);assert.deepEqual(await fs.readFile(savedV1.filename),originalV1Bytes);
 const v1=await readSnapshot(recovered.v1.file),v2=await readSnapshot(recovered.v2.file);
 assert.equal(recovered.v1.sha256,digest(v1));assert.equal(recovered.v2.sha256,digest(v2));
 assert.equal(v2.sourceData,'synthetic_test');assert.equal(v2.counts.forecasted,10);assert.equal(v2.models.dc.converged,true);assert.equal(v2.models.bivariate.converged,true);
 assert.equal(v2.trainingCutoffUtc,v1.trainingCutoffUtc);assert.ok(v2.entries.every(e=>e.forecasts.dc.bootstrapGrids.length>=36&&e.forecasts.bivariate.bootstrapGrids.length>=36));
 // Direct original runners on the SAME synthetic input/clock must produce
 // byte-equivalent payloads: infrastructure cannot change a probability.
 const directRoot=path.join(input.root,'direct-original-synthetic-only');
 const directV1=await freezeForwardForecast({...input,root:directRoot,clock});
 const directV2=await freezeEngine({...input,root:directRoot,clock:()=>new Date('2026-10-23T13:00:15.000Z')});
 assert.deepEqual(v1,directV1.journal);assert.deepEqual(v2,directV2.journal);
 const v2Bytes=await fs.readFile(recovered.v2.file),again=await freezeReferenceSeries(input,{clock:()=>new Date('2026-10-23T13:01:00.000Z'),preflight});
 assert.equal(again.reused,true);assert.deepEqual(await fs.readFile(recovered.v2.file),v2Bytes);
 // A valid envelope with different content must still fail the frozen receipt link.
 const changedEnvelope=JSON.parse(v2Bytes.toString('utf8'));changedEnvelope.payload.syntheticAlteration=true;changedEnvelope.sha256=digest(changedEnvelope.payload);
 await fs.writeFile(recovered.v2.file,JSON.stringify(changedEnvelope));
 await assert.rejects(freezeReferenceSeries(input,{clock,preflight}),/FROZEN_JOURNAL_CHANGED/);
 await fs.writeFile(recovered.v2.file,v2Bytes);
 await fs.rename(recovered.v2.file,recovered.v2.file+'.synthetic-missing');
 await assert.rejects(freezeReferenceSeries(input,{clock,preflight}),{code:'ENOENT'});
 await fs.rename(recovered.v2.file+'.synthetic-missing',recovered.v2.file);
 assert.equal((await freezeReferenceSeries(input,{clock,preflight})).reused,true);
 await assert.rejects(freezeReferenceSeries(input,{clock:()=>new Date('2026-10-23T16:15:00.000Z'),preflight}),/OUTSIDE_ORIGINAL_WINDOW/);
 assert.equal(await exists(path.join(input.root,'.local/model/prospective/journals')),false);
 assert.equal(await exists(path.join(input.root,'.local/model-v2/journals')),false);
 assert.equal(digest(input),inputHash);assert.equal(recovered.deliveryExecuted,false);assert.equal(recovered.providerRequests,0);
 const verified=await verifyReferenceReceipt(input.root);assert.equal(verified.status,'FROZEN_VERIFIED');assert.equal(verified.readOnly,true);assert.equal(verified.forecastExecuted,false);
});
