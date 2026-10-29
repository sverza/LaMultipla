// Every team, fixture, distribution, price and clock here is SYNTHETIC.
import {digest} from '../../scripts/lib/prospective/store.mjs';
import {distribution,marketsFromGrid} from '../../scripts/lib/goals/model.mjs';
import {EXPERIMENT} from '../../scripts/lib/engine/study.mjs';
import {engineCodeIdentity} from '../../scripts/lib/engine/registry.mjs';
import {requestedSpecs} from '../../scripts/lib/diagnostics/multimarket.mjs';
import {CALENDAR_LICENSE_SHA256} from '../../scripts/lib/orchestration/calendar-discovery.mjs';
import {sha256} from '../../scripts/lib/goals/data.mjs';
import {ROOT} from '../../scripts/lib/private-store.mjs';
export async function syntheticMultimarket(){
  const now='2026-10-16T12:50:00.000Z',generated='2026-10-16T12:46:00.000Z',observed='2026-10-16T12:48:00.000Z';
  const events=Array.from({length:10},(_,i)=>({fixtureId:'id'+(9000+i),home:'SYNTHETIC Home '+i,away:'SYNTHETIC Away '+i,
    kickoffUtc:i===0?'2026-10-16T18:45:00.000Z':i<=3?'2026-10-17T13:00:00.000Z':i<=7?'2026-10-18T13:00:00.000Z':'2026-10-19T18:45:00.000Z'}));
  const fixtures=events.map(e=>({fixtureId:e.fixtureId,sportId:10,tournamentId:23,seasonId:123,statusId:0,
    participant1Name:e.home,participant2Name:e.away,startTime:e.kickoffUtc,updatedAt:'2026-10-16T12:20:00.000Z'}));
  const body=JSON.stringify({name:'Italian Serie A 2026/27',matches:events.map(e=>({round:'Matchday 7',date:e.kickoffUtc.slice(0,10),
    time:e.kickoffUtc.slice(11,16)==='18:45'?'20:45':'15:00',team1:e.home,team2:e.away}))});
  const calendar={schema:'lamultipla-private-calendar-snapshot-v1',observedAtUtc:'2026-10-16T12:20:00.000Z',fixtures,
    source:{schema:'lamultipla-calendar-public-source-v1',source:'openfootball/football.json',path:'2026-27/it.1.json',commit:'a'.repeat(40),
      license:'CC0-1.0',licenseSha256:CALENDAR_LICENSE_SHA256,body,bodySha256:sha256(body),fetchedAtUtc:'2026-10-16T12:20:00.000Z'}};
  const schedule={schema:'lamultipla-prospective-schedule-v1',season:'2026/27',matchday:7,events,
    source:{officialUrl:'https://www.legaseriea.it/synthetic',officialPdfUrl:'https://www.legaseriea.it/synthetic.pdf',
      confirmedAtUtc:calendar.observedAtUtc,providerObservedAtUtc:calendar.observedAtUtc,providerFixturesSha256:digest(fixtures)}};
  const identity=await engineCodeIdentity(ROOT),study={schema:'lamultipla-engine-development-v2',synthetic:true,experiment:EXPERIMENT,
    selected:Object.fromEntries(['dc','bivariate'].map(kind=>[kind,{config:{kind,halfLife:365,ridge:20},temperature:1}])),generatedAtUtc:'2026-10-14T17:00:00.000Z',
    validFor:'DEVELOPMENT_AND_CALIBRATION_ONLY',validatedMarkets:[],operationallyApproved:false,modelCodeSha256:identity.sha256,protocolSha256:identity.protocolSha256};
  const dataset={schema:'lamultipla-results-dataset-v1',synthetic:true,source:'openfootball/football.json',commit:'a'.repeat(40),license:'CC0-1.0',licenseSha256:CALENDAR_LICENSE_SHA256,
    acquiredAtUtc:'2026-10-16T12:00:00.000Z',cutoffUtc:'2026-10-16T12:00:00.000Z',files:[{path:'2025-26/it.1.json',sha256:'a'.repeat(64)}],rows:[]};
  const entries=events.map((e,i)=>{
    const grid=distribution(1.5+i*.02,1),boots=Array.from({length:40},(_,b)=>distribution(1.45+i*.02+b*.0025,.95+b*.0025));
    const entry={...e,generatedAtUtc:generated,status:'prospective',forecasts:Object.fromEntries(['dc','bivariate'].map(kind=>[kind,
      {grid,bootstrapGrids:boots,probabilities:marketsFromGrid(grid),uncertainty:{replicates:40,failures:0,sufficient:true}}])),referenceV1:{grid,probabilities:marketsFromGrid(grid)}};
    return {...entry,entrySha256:digest(entry)};
  });
  const manifest={season:'2026/27',matchday:7,events},journal={schema:'lamultipla-engine-journal-v2',modelVersion:EXPERIMENT.version,id:'SYNTHETIC-ENGINE-7',
    generatedAtUtc:generated,trainingCutoffUtc:'2026-10-01T00:00:00.000Z',datasetSha256:digest(dataset),datasetAcquiredAtUtc:dataset.acquiredAtUtc,sourceCommit:dataset.commit,
    studySha256:digest(study),manifest,manifestSha256:digest(manifest),entries,counts:{planned:10,forecasted:10,excluded:0},sourceData:'synthetic_test'};
  const selections=events.flatMap(e=>requestedSpecs().map((spec,i)=>{
    const q={fixtureId:e.fixtureId,fixture:[e.home,e.away],kickoffUtc:e.kickoffUtc,marketId:100+i,outcomeId:200+i,playerKey:'0',playerName:null,playerProp:false,
      marketType:spec.family==='oneXTwo'?'1x2':spec.family==='btts'?'bothteamsscore':'totals',marketName:spec.family==='oneXTwo'?'Full Time Result':spec.family==='btts'?'Both Teams To Score':'Over Under Full Time',
      period:'fulltime',line:spec.line??0,outcome:spec.outcome,price:3,bookmaker:'bet365.it',tournamentId:23,seasonId:123,
      active:true,marketActive:true,bookmakerIsActive:true,suspended:false,statusId:0,observedAtUtc:observed,changedAt:observed,issues:[]};
    q.quoteId=digest([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey]);return q;
  }));
  const report={schema:'lamultipla-oddspapi-private-v2',fetchedAtUtc:observed,source:{provider:'OddsPapi',bookmaker:'bet365.it',tournamentId:23,mode:'synthetic_test'},
    round:{verified:true,season:'2026/27',matchday:7,fixtureIds:events.map(e=>e.fixtureId)},selections};
  return {now,study,journal,report,dataset,schedule,calendar};
}
