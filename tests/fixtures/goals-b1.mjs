import {syntheticMultimarket} from './multimarket.mjs';
import {buildReport} from '../../scripts/lib/odds-report.mjs';
// Materialize a coherent synthetic source chain; not a replacement for an actual provider snapshot.
export function bindSyntheticB1Source(s){
 const definitions=new Map(),fixtures=s.journal.entries.map((e,i)=>({fixtureId:e.fixtureId,sportId:10,tournamentId:23,seasonId:123,statusId:0,
  participant1Id:2*i+1,participant2Id:2*i+2,participant1Name:e.home,participant2Name:e.away,startTime:e.kickoffUtc,updatedAt:s.report.fetchedAtUtc,
  bookmakerOdds:{'bet365.it':{bookmakerIsActive:true,suspended:false,bookmakerFixtureId:'SYNTHETIC-'+i,markets:{}}}})),byId=new Map(fixtures.map(f=>[f.fixtureId,f]));
 for(const q of s.report.selections){
  let d=definitions.get(String(q.marketId));if(!d){d={marketId:Number(q.marketId),marketType:q.marketType,marketName:q.marketName,period:q.period,handicap:q.line,playerProp:q.playerProp,sportId:10,outcomes:[]};definitions.set(String(q.marketId),d);}
  if(!d.outcomes.some(o=>String(o.outcomeId)===String(q.outcomeId)))d.outcomes.push({outcomeId:Number(q.outcomeId),outcomeName:q.outcome});
  const b=byId.get(q.fixtureId).bookmakerOdds['bet365.it'],market=b.markets[q.marketId]??={marketActive:q.marketActive,bookmakerMarketId:'SYNTHETIC-'+q.marketId,outcomes:{}};
  const o=market.outcomes[q.outcomeId]??={players:{}};
  o.players[q.playerKey]={price:q.price,active:q.active,changedAt:q.changedAt,bookmakerChangedAt:null,playerName:q.playerName,bookmakerOutcomeId:'SYNTHETIC-'+q.outcomeId,mainLine:true};
 }
 const catalog=[...definitions.values()],round={season:s.journal.manifest.season,matchday:s.journal.manifest.matchday,fixtureIds:fixtures.map(f=>f.fixtureId),fromUtc:'2026-10-16T00:00:00Z',toUtc:'2026-10-20T00:00:00Z'};
 return {...s,fixtures,catalog,report:buildReport(fixtures,catalog,{round,observedAt:s.report.fetchedAtUtc,source:'synthetic_test'})};
}
export async function syntheticB1(){
 const s=await syntheticMultimarket(),base=s.report.selections[0];
 const specs=[['doublechance','Double Chance Full Time',0,['1X','2X','12']],['drawnobet','Draw No Bet',0,['1','2']],
  ['teamtotals-team1','Over Under Team 1',1.5,['Over','Under']],['teamtotals-team2','Over Under Team 2',2,['Over','Under']],
  ['totals','Over Under Full Time',2,['Over','Under']],['totals','Over Under Full Time',2.25,['Over','Under']]];
 specs.forEach(([marketType,marketName,line,outcomes],i)=>outcomes.forEach((outcome,j)=>s.report.selections.push({...base,marketId:900+i,outcomeId:9000+i*3+j,marketType,marketName,line,outcome})));
 return bindSyntheticB1Source(s);
}
