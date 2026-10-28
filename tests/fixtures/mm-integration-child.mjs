import {runSyntheticIntegration} from '../../scripts/lib/mm-simulator-v1/synthetic-integration.mjs';
const [root,filename,atUtc,checkpoint,mode]=process.argv.slice(2);
try{
 const result=await runSyntheticIntegration({root,filename,simulationClock:()=>atUtc,onCheckpoint:async stage=>{
  if(stage!==checkpoint)return;
  if(mode==='crash')process.exit(73);
  process.send?.({stage});await new Promise(resolve=>process.once('message',resolve));
 }});
 process.send?.({status:result.status,decisionSha256:result.decisionSha256});
}catch(e){process.send?.({error:e.message});process.exitCode=1;}
// Do not hold an idle IPC channel after the operation completes.
if(process.connected)process.disconnect();
