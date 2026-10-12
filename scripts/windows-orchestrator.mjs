#!/usr/bin/env node
import {ROOT} from './lib/private-store.mjs';
import {deliveryPump} from './lib/orchestration/delivery-pump.mjs';
import {loadAnalysisPlan} from './lib/orchestration/analysis-plan.mjs';
import {analysisTick} from './lib/orchestration/analysis-workflow.mjs';
import {analysisAdapters} from './lib/orchestration/analysis-adapters.mjs';
async function main(){
  if(process.argv.length===3&&process.argv[2]==='--once')return {mode:'PRIVATE_DELIVERY_PUMP_ONLY',...await deliveryPump({root:ROOT}),
    analysisEngineEnabled:false,actualStakeEUR:0,oddsApiRequests:0,tasksRegistered:false};
  if(process.argv.length===4&&['--inspect-plan','--analysis-once'].includes(process.argv[2])){
    const plan=await loadAnalysisPlan(ROOT,process.argv[3]);
    if(process.argv[2]==='--inspect-plan')return {mode:'PRIVATE_ANALYSIS_PREFLIGHT',season:plan.round.season,matchday:plan.round.matchday,
      ...plan.window,calendarStatus:'LOCAL_SOURCE_CLAIMS_NOT_REVERIFIED_ONLINE',networkRequests:0,oddsApiRequests:0,tasksRegistered:false,actualStakeEUR:0};
    const analysis=await analysisTick({root:ROOT,plan,adapters:analysisAdapters(ROOT)});
    // Delivery stays independent: previously queued packages are recovered
    // even when this round waits for a window, credentials or review.
    const delivery=await deliveryPump({root:ROOT});
    return {analysis,delivery,actualStakeEUR:0,tasksRegistered:false};
  }
  throw new Error('ORCHESTRATOR_ARGUMENTS_INVALID');
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{
  console.error('Orchestratore sospeso: stato, lock, outbox o orologio da verificare. Nessun dato privato stampato.');process.exitCode=1;
});
