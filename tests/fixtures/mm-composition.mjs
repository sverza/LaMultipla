// All identities, distributions, reviews, clocks and prices are SYNTHETIC.
import {syntheticMultimarket} from './multimarket.mjs';
import {market,quote} from './oddspapi.mjs';
import {syntheticReviewedContext} from './context.mjs';
import {buildReport} from '../../scripts/lib/odds-report.mjs';
import {adaptOddsPapi} from '../../scripts/lib/mm-simulator-v1/oddspapi.mjs';
import {diagnoseProbabilityBoards} from '../../scripts/lib/mm-simulator-v1/probabilities.mjs';
import {BINDINGS_SCHEMA,hashBytes,hashValue} from '../../scripts/lib/mm-simulator-v1/contracts.mjs';
import {SCENARIO_SCHEMA,REVIEW_SCHEMA,TICKET_SCHEMA} from '../../scripts/lib/mm-simulator-v1/composition-gates.mjs';

const grid=p=>[[1-p,0,0],[0,0,0],[0,0,p]];
export async function syntheticCompositionFixture({events=2}={}){
 const a=await syntheticMultimarket(),journal=a.journal,study=a.study,atUtc=a.now;
 journal.models=Object.fromEntries(['dc','bivariate'].map(k=>[k,{synthetic:true,config:structuredClone(study.selected[k].config),converged:true}]));
 for(const e of journal.entries){e.forecasts=Object.fromEntries(['dc','bivariate'].map(kind=>[kind,{grid:grid(kind==='dc'?.95:.94),temperature:1,
  bootstrapGrids:Array.from({length:40},(_,i)=>grid(.90+i*.002)),uncertainty:{replicates:40,failures:0,sufficient:true,seed:123}}]));}
 const raw=a.calendar.fixtures.map((f,i)=>({...f,participant1Id:2*i+1,participant2Id:2*i+2,bookmakerOdds:{'bet365.it':{
  bookmakerIsActive:true,suspended:false,bookmakerFixtureId:'synthetic-event-'+i,markets:{
   104:market({104:{0:quote({price:1.2,bookmakerOutcomeId:'synthetic-yes',changedAt:a.report.fetchedAtUtc})},105:{0:quote({price:1.2,bookmakerOutcomeId:'synthetic-no',changedAt:a.report.fetchedAtUtc})}},{bookmakerMarketId:'synthetic-btts'}),
   1010:market({1010:{0:quote({price:1.2,bookmakerOutcomeId:'synthetic-over',changedAt:a.report.fetchedAtUtc})},1011:{0:quote({price:1.2,bookmakerOutcomeId:'synthetic-under',changedAt:a.report.fetchedAtUtc})}},{bookmakerMarketId:'synthetic-total'})}}}}));
 for(let i=events;i<raw.length;i++)raw[i].bookmakerOdds['bet365.it'].markets={};
 const catalog=[{marketId:104,marketLength:2,marketName:'Both Teams To Score',marketType:'bothteamsscore',sportId:10,playerProp:false,period:'fulltime',handicap:0,outcomes:[{outcomeId:104,outcomeName:'Yes'},{outcomeId:105,outcomeName:'No'}]},
  {marketId:1010,marketLength:2,marketName:'Over Under Full Time',marketType:'totals',sportId:10,playerProp:false,period:'fulltime',handicap:2.5,outcomes:[{outcomeId:1010,outcomeName:'Over'},{outcomeId:1011,outcomeName:'Under'}]}];
 const round={season:'2026/27',matchday:7,fixtureIds:raw.map(f=>f.fixtureId),fromUtc:'2026-10-16T00:00:00Z',toUtc:'2026-10-20T00:00:00Z'};
 const bindings={schema:BINDINGS_SCHEMA,competition:'ITA_SERIE_A',season:round.season,round:7,events:raw.map((f,i)=>({id:'synthetic-event-'+i,sourceEventId:f.fixtureId,sourceSeasonId:f.seasonId,kickoffUtc:f.startTime,home:{id:'synthetic-home-'+i,sourceId:f.participant1Id,name:f.participant1Name},away:{id:'synthetic-away-'+i,sourceId:f.participant2Id,name:f.participant2Name}}))};
 function boardsFromRaw(){
  const report=buildReport(raw,catalog,{round,observedAt:a.report.fetchedAtUtc,source:'synthetic_test'}),rawBytes=Buffer.from(JSON.stringify(raw)),catalogBytes=Buffer.from(JSON.stringify(catalog)),reportBytes=Buffer.from(JSON.stringify(report));
  return adaptOddsPapi({rawBytes,catalogBytes,reportBytes,bindings,source:{providerId:'oddspapi',bookmaker:'bet365.it',
   raw:{ref:'SYNTHETIC-raw.json',sha256:hashBytes(rawBytes)},catalog:{ref:'SYNTHETIC-catalog.json',sha256:hashBytes(catalogBytes)},report:{ref:'SYNTHETIC-report.json',sha256:hashBytes(reportBytes)}}});
 }
 const scenario={schema:SCENARIO_SCHEMA,synthetic:true,approvalState:'NOT_APPROVED',minPointEV:.05,minLowerEV:.02,maxIntervalWidth:.25,minCombinationLowerEV:.05,
  maxForecastAgeHours:24,maxQuoteAgeMinutes:30,maxCalendarAgeMinutes:60,maxChangeAgeHours:24,completionLeadMinutes:150,maxTicketReviews:10};
 const f={raw,catalog,journal,study,bindings,boardsFromRaw,input:null};
 f.rebuild=()=>{
  for(const e of journal.entries){const {entrySha256,...content}=e;void entrySha256;e.entrySha256=hashValue(content);}
  const boards=boardsFromRaw(),diagnostic=diagnoseProbabilityBoards({boards,journal,study,freezeCompletedAtUtc:'2026-10-16T12:47:00.000Z'});
  f.input={boards,diagnostic,journal,study,atUtc,search:{primaryModel:'dc',minLegs:2,maxLegs:2,maxCombinations:100,maxVisitedNodes:1000,order:'IDENTITY',excludeRepeatedTeams:true},
   scenario:structuredClone(scenario),context:syntheticReviewedContext(journal.manifest,atUtc),
   calendar:{synthetic:true,diagnosticSha256:diagnostic.canonicalSha256,officialObservedAtUtc:atUtc,providerObservedAtUtc:atUtc,
    eventsSha256:hashValue(diagnostic.boardStates.filter((b,i,arr)=>arr.findIndex(x=>x.event.id===b.event.id)===i).map(b=>b.event))},
   selectionReviews:diagnostic.records.map(r=>({schema:REVIEW_SCHEMA,synthetic:true,quoteId:r.quoteId,
    diagnosticSha256:diagnostic.canonicalSha256,recordSha256:hashValue(r),reviewer:'SYNTHETIC_TEST_REVIEWER',evidence:'SYNTHETIC_TEST_VECTOR',
    observedPrice:r.historicalPrice,available:true,reviewedAtUtc:atUtc,oldChangeReviewed:true,rules:{family:r.family,line:r.line,period:r.period,
     regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,voidAndPostponementReviewed:true,definitionSha256:'a'.repeat(64),reviewedAtUtc:atUtc}})),ticketReviews:[]};
  const records=diagnostic.records.filter(r=>['YES','OVER'].includes(r.outcome));
  for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++)if(records[i].event.id!==records[j].event.id){
   const ids=[records[i].quoteId,records[j].quoteId];f.input.ticketReviews.push({schema:TICKET_SCHEMA,synthetic:true,
    diagnosticSha256:diagnostic.canonicalSha256,quoteIds:ids,selectionReviewSha256:ids.map(id=>hashValue(f.input.selectionReviews.find(r=>r.quoteId===id))),
    kind:'ordinary_accumulator',bookmaker:'bet365.it',available:true,reviewer:'SYNTHETIC_TEST_REVIEWER',evidence:'SYNTHETIC_EXACT_TICKET_OBSERVATION',price:1.4,reviewedAtUtc:atUtc});
  }
  return f.input;
 };f.rebuild();return f;
}
