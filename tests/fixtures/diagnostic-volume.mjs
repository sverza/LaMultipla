import {syntheticMultimarket} from './multimarket.mjs';
import {digest} from '../../scripts/lib/prospective/store.mjs';
// Input contributes schema/cardinality only. Never copy actual prices, teams, players or clocks.
export async function syntheticDiagnosticVolume(shape){
 const s=await syntheticMultimarket(),ids=new Map(shape.coverage.map((e,i)=>[e.fixtureId,i]));
 if(ids.size!==10)throw Error('SYNTHETIC_SHAPE_TEN_FIXTURES_REQUIRED');
 s.report.selections=shape.selections.map((q,i)=>{
  const index=ids.get(q.fixtureId),e=s.journal.entries[index];if(!e)throw Error('SYNTHETIC_SHAPE_IDENTITY_UNKNOWN');
  const v={fixtureId:e.fixtureId,fixture:[e.home,e.away],kickoffUtc:e.kickoffUtc,
   marketId:q.marketId,outcomeId:q.outcomeId,playerKey:q.playerProp?'SYNTHETIC_PLAYER_'+i:'0',playerName:q.playerProp?'SYNTHETIC BENCH PLAYER':null,
   playerProp:q.playerProp,marketType:q.marketType,marketName:q.marketName,period:q.period,line:q.line,outcome:q.outcome,
   price:2,bookmaker:'bet365.it',tournamentId:23,seasonId:123,active:true,marketActive:true,bookmakerIsActive:true,suspended:false,statusId:0,
   observedAtUtc:s.report.fetchedAtUtc,changedAt:s.report.fetchedAtUtc,issues:[]};
  v.quoteId=digest([v.fixtureId,'bet365.it',v.marketId,v.outcomeId,v.playerKey]);return v;
 });return s;
}
