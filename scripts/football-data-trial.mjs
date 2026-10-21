#!/usr/bin/env node
import {parseArgs} from 'node:util';
import path from 'node:path';
import {ROOT} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {readSnapshot} from './lib/prospective/store.mjs';
import {loadFootballDataKey,installFootballDataKey} from './lib/private/football-data-key.mjs';
import {acquireFootballTrial} from './lib/football-data-trial.mjs';
const {values}=parseArgs({strict:true,options:{'install-key':{type:'boolean'},grant:{type:'string'},help:{type:'boolean'}}});
async function main(){if(values.help){console.log('--install-key: user-entered DPAPI dialog only, no network. --grant PRIVATE_ENVELOPE: one explicit approved trial, never automatic retry. No training or adoption.');return;}
 if(values['install-key']&&values.grant||!values['install-key']&&!values.grant)throw Error('CHOOSE_ONE_MODE');
 const result=values['install-key']?await installFootballDataKey(ROOT):await acquireFootballTrial({directory:path.join(ROOT,'.local/football-data/trial-2026'),grant:await readSnapshot(await privateInput(ROOT,values.grant)),keyLoader:()=>loadFootballDataKey(ROOT)});
 console.log(JSON.stringify(result));}
main().catch(()=>{console.error('Football-data operation blocked; inspect authorization and private receipt without sharing credentials. No retry performed.');process.exitCode=1;});
