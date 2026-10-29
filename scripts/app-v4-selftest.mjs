#!/usr/bin/env node
// Explicitly synthetic software self-test. Never forecasts a real match, calls APIs or publishes.
import path from 'node:path';
import {ROOT} from './lib/private-store.mjs';
import {digest,writeExclusive,readSnapshot} from './lib/prospective/store.mjs';
import {syntheticDecisionBundle} from '../tests/fixtures/decision.mjs';
import {appPackage} from './lib/decision/app-package.mjs';
import {redactedReceipt} from './lib/decision/delivery.mjs';
import {parseExperimentalEnvelope} from '../shared/decision-v4.mjs';
const directory=path.join(ROOT,'.local/app-v4-synthetic-selftest');
async function main(){
  if(process.argv.slice(2).length)throw new Error('Selftest takes no inputs: all data are explicitly synthetic');
  for(const [name,payload] of [['SYNTHETIC-simulation',appPackage(syntheticDecisionBundle())],['SYNTHETIC-no-value',appPackage(syntheticDecisionBundle('no_value'))],
    ['SYNTHETIC-missing-rules',appPackage(syntheticDecisionBundle('missing_rules'))],['SYNTHETIC-public-receipt',redactedReceipt(syntheticDecisionBundle())]]){
    const filename=path.join(directory,name+'-'+digest(payload)+'.json');
    try{await writeExclusive(filename,payload);}catch(e){if(e.code!=='EEXIST')throw e;if(digest(await readSnapshot(filename))!==digest(payload))throw new Error('Selftest snapshot conflict');}
    const parsed=await parseExperimentalEnvelope({schema:'lamultipla-prospective-envelope-v1',sha256:digest(payload),payload});
    console.log(name+': '+filename);if(parsed.sha256!==digest(payload))throw new Error('Selftest envelope mismatch');
  }
  console.log(JSON.stringify({sourceData:'SYNTHETIC_TEST_ONLY',test:'selector_to_contract_v4',actualStakeEUR:0,apiRequests:0,publication:false,
    next:'Import these local JSON files in the experimental UI. No real validation or forecasts produced.'}));
}
main().catch(e=>{console.error('Selftest v4 interrotto:',e.message);process.exitCode=1;});
