#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareSyntheticDeliveryBatch} from './lib/private/synthetic-selftest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function main(){
  if(process.argv.length!==2)throw new Error('Solo fixture sintetiche nuove: nessun input o override dell’orologio consentito');
  return prepareSyntheticDeliveryBatch(path.join(root,'.local/private-delivery/synthetic-selftest'));
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
