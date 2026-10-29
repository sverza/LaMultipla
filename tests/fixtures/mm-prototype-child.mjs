import fs from 'node:fs/promises';
import {runSyntheticPrototype} from '../../scripts/lib/mm-simulator-v1/prototype-store.mjs';
const [root,inputFile,at,stop='NONE',barrier='NONE']=process.argv.slice(2);
const input=JSON.parse(await fs.readFile(inputFile,'utf8'));
try{
 if(barrier!=='NONE'){
  process.send?.({ready:true});await new Promise(resolve=>process.once('message',resolve));
 }
 const result=await runSyntheticPrototype({root,input,simulationClock:()=>at,onCheckpoint:async stage=>{
  if(stage===stop){process.send?.({stage});process.exit(73);}
  if(stage==='after:receipt.json'&&stop==='CLEANUP_FAILURE'){
   const unlink=fs.unlink;fs.unlink=async file=>{if(String(file).endsWith('.ticket.json'))throw Object.assign(Error('SYNTHETIC_DENIED_CLEANUP'),{code:'EPERM'});return unlink(file);};
  }
  if(stage==='after:intent.json'&&barrier==='HOLD'){process.send?.({holding:true});await new Promise(resolve=>process.once('message',resolve));}
 }});
 process.send?.({ok:true,state:result.state,decisionState:result.decision.state,replayed:result.replayed});
}catch(e){process.send?.({ok:false,error:e.message,errorName:e.name});process.exitCode=1;}
finally{process.disconnect?.();}
