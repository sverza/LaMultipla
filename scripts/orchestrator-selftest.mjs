#!/usr/bin/env node
import {ROOT} from './lib/private-store.mjs';
import {deliveryPumpSelftest} from './lib/orchestration/selftest.mjs';
if(process.argv.length!==2){console.error('Self-test sintetico senza argomenti');process.exitCode=1;}
else deliveryPumpSelftest(ROOT).then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{
  console.error('Self-test interrotto; cartella sintetica privata conservata, nessuna richiesta di rete.');process.exitCode=1;
});
