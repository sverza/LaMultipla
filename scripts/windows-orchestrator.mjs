#!/usr/bin/env node
import {ROOT} from './lib/private-store.mjs';
import {deliveryPump} from './lib/orchestration/delivery-pump.mjs';
import {loadAnalysisPlan} from './lib/orchestration/analysis-plan.mjs';
import {analysisAndDeliveryTick} from './lib/orchestration/analysis-delivery-runner.mjs';
import {digest} from './lib/prospective/store.mjs';
import {progressiveAndDeliveryTick} from './lib/orchestration/progressive-runner.mjs';
import {PROGRESSIVE_POLICY} from './lib/orchestration/progressive-policy.mjs';
import {analysisTick} from './lib/orchestration/analysis-workflow.mjs';
async function main(){
  if(process.argv[2]==='--progressive-once'&&(process.argv.length===4||process.argv.length===6&&process.argv[4]==='--config-sha256'&&/^[a-f0-9]{64}$/.test(process.argv[5])))
    return progressiveAndDeliveryTick({root:ROOT,filename:process.argv[3],expectedConfigSha256:process.argv[5]??null});
  if(process.argv.length===3&&process.argv[2]==='--once')return {mode:'PRIVATE_DELIVERY_PUMP_ONLY',...await deliveryPump({root:ROOT}),
    analysisEngineEnabled:false,actualStakeEUR:0,oddsApiRequests:0,tasksRegistered:false};
  if(process.argv.length===4&&process.argv[2]==='--inspect-plan'){
    const plan=await loadAnalysisPlan(ROOT,process.argv[3]);
    return {mode:'PRIVATE_ANALYSIS_PREFLIGHT',season:plan.round.season,matchday:plan.round.matchday,planSha256:digest(plan),
      ...plan.window,calendarStatus:'LOCAL_SOURCE_CLAIMS_NOT_REVERIFIED_ONLINE',networkRequests:0,oddsApiRequests:0,tasksRegistered:false,actualStakeEUR:0};
  }
  if(process.argv[2]==='--analysis-once'&&(process.argv.length===4||process.argv.length===6&&process.argv[4]==='--plan-sha256'&&/^[a-f0-9]{64}$/.test(process.argv[5])))
    return analysisAndDeliveryTick({root:ROOT,filename:process.argv[3],expectedPlanSha256:process.argv[5]??null,
      runAnalysis:args=>Math.min(...args.plan.schedule.events.map(e=>Date.parse(e.kickoffUtc)))>=Date.parse(PROGRESSIVE_POLICY.registeredAtUtc)?
        Promise.resolve({mode:'PRIVATE_ANALYSIS_WORKFLOW',state:'blocked',reason:'PROGRESSIVE_CONFIG_REQUIRED_FOR_FUTURE_ROUND'}):analysisTick(args)});
  throw new Error('ORCHESTRATOR_ARGUMENTS_INVALID');
}
main().then(result=>{
  console.log(JSON.stringify(result,null,2));
  if(result.analysis?.state==='blocked'||result.delivery?.state==='blocked'||result.diagnosticSaved===false)process.exitCode=1;
}).catch(()=>{
  console.error('Orchestratore sospeso: stato, lock, outbox o orologio da verificare. Nessun dato privato stampato.');process.exitCode=1;
});
