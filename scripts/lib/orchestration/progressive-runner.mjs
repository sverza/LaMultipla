import {roundManagerTick} from './round-manager.mjs';
import {deliveryPump} from './delivery-pump.mjs';
import {privateInput} from './analysis-plan.mjs';
import {loadJson,saveJson} from '../private-store.mjs';
import {digest} from '../prospective/store.mjs';
import path from 'node:path';
export async function progressiveAndDeliveryTick({root,filename,expectedConfigSha256=null,clock=()=>new Date(),
  runManager=roundManagerTick,pump=deliveryPump}){
  let analysis,delivery;
  try{
    if(expectedConfigSha256!==null){
      const config=await loadJson(await privateInput(root,filename));
      if(!/^[a-f0-9]{64}$/.test(expectedConfigSha256)||digest(config)!==expectedConfigSha256)throw new Error('PROGRESSIVE_CONFIG_PIN_MISMATCH');
    }
    analysis=await runManager({root,filename,clock});
  }catch(error){analysis={state:'blocked',reason:/^PROGRESSIVE_[A-Z_]+$/.test(error.code??error.message??'')?error.code??error.message:'PROGRESSIVE_RUN_REJECTED'};}
  try{delivery=await pump({root,channel:'shadow',clock});}catch{delivery={state:'blocked',reason:'PRIVATE_DELIVERY_RUN_REJECTED'};}
  const result={mode:'PRIVATE_PROGRESSIVE_AND_SHADOW_DELIVERY',analysis,delivery,actualStakeEUR:0,tasksRegistered:false};
  let diagnosticSaved=false;
  try{await saveJson(path.join(root,'.local/orchestrator/progressive/runner-state.private.json'),{atUtc:clock().toISOString(),...result});diagnosticSaved=true;}catch{}
  return {...result,diagnosticSaved};
}
