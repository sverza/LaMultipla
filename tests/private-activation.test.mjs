import test from 'node:test';
import assert from 'node:assert/strict';
import {activatePrivateReception} from '../shared/private-activation.mjs';
test('activation renews session first and reports success only after device registration',async()=>{
  const order=[];let enabled=false;
  await activatePrivateReception({ensureSession:async()=>order.push('session'),setBackground:async v=>{enabled=v;order.push(v);},registerDevice:async()=>{assert.equal(enabled,true);order.push('registered');}});
  assert.deepEqual(order,['session',true,'registered']);assert.equal(enabled,true);
});
test('session, native partial activation and remote registration failure all suspend reception',async()=>{
  for(const stage of ['session','native','register']){
    let enabled=true,registered=0,suspensions=0;const fault=new Error('SYNTHETIC failure');
    await assert.rejects(activatePrivateReception({ensureSession:async()=>{if(stage==='session')throw fault;},
      setBackground:async value=>{enabled=value;if(!value)suspensions++;else if(stage==='native')throw fault;},
      registerDevice:async()=>{registered++;if(stage==='register')throw fault;}}),error=>error===fault);
    assert.equal(enabled,false);assert.equal(suspensions,1);assert.equal(registered,stage==='register'?1:0);
  }
});
test('failed rollback reports unverified suspension instead of claiming reception is disabled',async()=>{
  await assert.rejects(activatePrivateReception({ensureSession:async()=>{throw new Error('SYNTHETIC session');},
    setBackground:async()=>{throw new Error('SYNTHETIC vault');},registerDevice:async()=>assert.fail()}),/Sospensione.*verificare/);
});
