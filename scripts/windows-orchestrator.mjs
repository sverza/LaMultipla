#!/usr/bin/env node
import {ROOT} from './lib/private-store.mjs';
import {deliveryPump} from './lib/orchestration/delivery-pump.mjs';
// First executable component. No new decision engine, forecasts or odds calls.
if(process.argv.length!==3||process.argv[2]!=='--once'){
  console.error('Uso: node scripts/windows-orchestrator.mjs --once');process.exitCode=1;
}else deliveryPump({root:ROOT}).then(result=>console.log(JSON.stringify({mode:'PRIVATE_DELIVERY_PUMP_ONLY',...result,
  analysisEngineEnabled:false,actualStakeEUR:0,oddsApiRequests:0,tasksRegistered:false},null,2))).catch(()=>{
  console.error('Orchestratore sospeso: stato, lock, outbox o orologio da verificare. Nessun dato privato stampato.');process.exitCode=1;
});
