import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ROOT} from './lib/private-store.mjs';
import {researchCycleTick} from './lib/orchestration/research-cycle.mjs';

// Only a compiled-in synthetic fixture is accepted. No input URLs, arbitrary
// handlers, provider credentials, production directories or executable hooks.
export function researchDemoInput(){
 const events=Array.from({length:10},(_,i)=>({fixtureId:'synthetic-'+i,home:'Synthetic Home '+i,away:'Synthetic Away '+i,
  kickoffUtc:i<5?'2026-10-23T18:45:00.000Z':'2026-10-25T19:45:00.000Z'}));
 const models=[{id:'reference',role:'reference'},{id:'challenger_worse',role:'challenger'},{id:'baseline',role:'baseline'}]
  .map(m=>({...m,registeredAtUtc:'2026-10-20T10:00:00.000Z'}));
 return {schema:'lamultipla-research-cycle-input-v1',mode:'synthetic',manifest:{synthetic:true,season:'2026/27',matchday:8,events},
  observation:{sourceId:'synthetic-local',synthetic:true,permission:'LOCAL_REVIEW_ONLY',license:'Synthetic test fixture',acquiredAtUtc:'2026-10-26T10:00:00.000Z',
   rows:events.map(e=>({...e,status:'FINISHED',regularTime:true,goals:[1,0],observedAtUtc:'2026-10-26T09:00:00.000Z'}))},
  forecasts:{models,entries:events.map(e=>({...e,generatedAtUtc:'2026-10-23T12:45:00.000Z',probabilities:{
   reference:{oneXTwo:[.5,.25,.25],btts:.4,over:.4},challenger_worse:{oneXTwo:[.1,.2,.7],btts:.8,over:.8},baseline:{oneXTwo:[.34,.33,.33],btts:.5,over:.5}}}))},
  refitPolicy:{id:'synthetic-fixed-policy',kind:'fixed'}};
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||!args.includes('--demo')||!args.includes('--dry-run'))throw Error('Usage: node scripts/research-cycle.mjs --demo --dry-run; no live mode exists');
 const root=await fs.realpath(ROOT);let directory=root;
 for(const segment of ['.local','research-cycle','dry-run']){directory=path.join(directory,segment);await fs.mkdir(directory,{recursive:false,mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  if(await fs.realpath(directory)!==directory||(await fs.lstat(directory)).isSymbolicLink())throw Error('RESEARCH_PRIVATE_DIRECTORY_REDIRECTED');}
 const result=await researchCycleTick({directory,input:researchDemoInput(),clock:()=>new Date('2026-10-26T12:00:00.000Z')});
 console.log(JSON.stringify({state:result.state,cycleId:result.cycleId,outputDirectory:result.directory,syntheticClock:true,simulationAtUtc:'2026-10-26T12:00:00.000Z',
  actualInvocationAtUtc:new Date().toISOString(),providerRequests:0,trainingExecuted:false,forecastCreated:false,automaticActionsActivated:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('Research cycle refused: only --demo --dry-run is supported; check local inputs/checkpoints without removing them.');process.exitCode=1;});
}
