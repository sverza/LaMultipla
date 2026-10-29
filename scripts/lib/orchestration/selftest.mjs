import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {deliveryPump} from './delivery-pump.mjs';
import {writeExclusive} from '../prospective/store.mjs';
// Adapter-only fixture: deliberately not a valid transport frame and never sent.
export async function deliveryPumpSelftest(root){
  const directory=path.join(root,'.local/orchestrator/synthetic-selftest',randomUUID());
  const outbox=path.join(directory,'.local/private-delivery/outbox');
  await writeExclusive(path.join(outbox,'000000000001.json'),{purpose:'SYNTHETIC_ADAPTER_ONLY'});
  let at=Date.now(),calls=0;
  const args={root:directory,clock:()=>new Date(at),flush:async()=>{calls++;return {acknowledged:0,pending:1,notifications:'configured'};}};
  const initial=await deliveryPump(args);if(initial.state!=='waiting_ack')throw new Error('Synthetic waiting state');
  const backoff=await deliveryPump(args);if(backoff.networkAttempted||calls!==1)throw new Error('Synthetic backoff failed');
  at+=5*60000;let interrupted=true;
  const ackArgs={...args,flush:async()=>{calls++;return {acknowledged:1,pending:0};},afterReceipt:async()=>{if(interrupted)throw new Error('SYNTHETIC interrupted after receipt');}};
  await deliveryPump(ackArgs);interrupted=false;
  const recovered=await deliveryPump(ackArgs);if(recovered.acknowledged!==1||recovered.networkAttempted||calls!==2)throw new Error('Synthetic receipt recovery failed');
  const idle=await deliveryPump(args);if(idle.networkAttempted||calls!==2)throw new Error('Synthetic duplicate flush');
  await fs.rm(directory,{recursive:true,force:true}); // only the fresh self-test directory
  return {purpose:'SYNTHETIC_WINDOWS_DELIVERY_PUMP_TEST',durableReceiptRecovery:true,idempotent:true,backoff:true,
    networkRequests:0,oddsApiRequests:0,tasksRegistered:false,actualStakeEUR:0,realOutboxUnchanged:true};
}
