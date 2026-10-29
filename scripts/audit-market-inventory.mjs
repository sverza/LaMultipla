#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {digest,writeExclusive} from './lib/prospective/store.mjs';
import {inventoryMarkets,inventoryMarkdown} from './lib/audit/market-inventory.mjs';
const {values}=parseArgs({strict:true,options:{report:{type:'string',multiple:true},fixtures:{type:'string',multiple:true},catalog:{type:'string'},help:{type:'boolean'}}});
async function load(file){const resolved=await privateInput(ROOT,file);return {file:resolved,value:await loadJson(resolved)};}
async function main(){
 if(values.help){console.log('--catalog EXISTING_PRIVATE_CACHE --report EXISTING_REPORT [--report ...] [--fixtures EXISTING_RAW ...]. Read-only inputs; private immutable census, no API/forecast/model changes.');return;}
 if(!values.catalog||!values.report?.length)throw Error('Existing private catalog/report required');
 const c=await load(values.catalog),reports=await Promise.all(values.report.map(async f=>{const x=await load(f);return {file:x.file,report:x.value};})),rawSnapshots=await Promise.all((values.fixtures??[]).map(async f=>{const x=await load(f);return {file:x.file,fixtures:x.value};}));
 const inventory=inventoryMarkets({reports,rawSnapshots,catalog:c.value.catalog??c.value}),directory=path.join(ROOT,'.local/diagnostics/strategic-audit/inventories'),filename=path.join(directory,digest(inventory)+'.json');
 await writeExclusive(filename,inventory);const markdownFile=filename.replace(/\.json$/,'.md');await fs.writeFile(markdownFile,inventoryMarkdown(inventory),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({file:filename,markdownFile,counts:inventory.counts,observedMarketTypes:inventory.observedMarketTypes,providerRequests:0,actualStakeEUR:0}));
}
main().catch(()=>{console.error('Market census stopped: verify existing private inputs/hashes; no provider requests or forecast.');process.exitCode=1;});
