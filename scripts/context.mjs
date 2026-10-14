#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ROOT,loadJson,withLock} from './lib/private-store.mjs';
import {readSnapshot,writeExclusive,digest} from './lib/prospective/store.mjs';
import {validateCurrentDataset} from './lib/shadow/registry.mjs';
import {buildContext,evidenceTemplate,contextGate} from './lib/context/dossier.mjs';
import {recentForm} from './lib/context/history.mjs';
import {CONTEXT_POLICY} from './lib/context/policy.mjs';
import {contextIdentity} from './lib/context/identity.mjs';
const {values}=parseArgs({options:{help:{type:'boolean'},build:{type:'boolean'},template:{type:'boolean'},history:{type:'boolean'},
  dataset:{type:'string'},schedule:{type:'string'},journal:{type:'string'},evidence:{type:'string'},inspect:{type:'string'},check:{type:'string'}},strict:true});
const directory=path.join(ROOT,'.local/context');
async function main(){
  if(values.help){console.log('--build --dataset FILE (--journal FILE | --schedule FILE) [--evidence FILE] | --template (--journal FILE | --schedule FILE) | --history --dataset FILE | --check CONTEXT --journal FILE | --inspect FILE. Local only; no API or numeric probability changes.');return;}
  if(values.inspect){console.log(JSON.stringify(await readSnapshot(values.inspect),null,2));return;}
  if(values.check){if(!values.journal)throw new Error('--journal required');console.log(JSON.stringify(contextGate(await readSnapshot(values.check),await readSnapshot(values.journal),new Date()),null,2));return;}
  if(['build','template','history'].filter(k=>values[k]).length!==1)throw new Error('Exactly one context mode required');
  await withLock(directory,async()=>{
    const now=new Date();let manifest;
    if(!values.history){if(Boolean(values.schedule)===Boolean(values.journal))throw new Error('Exactly one schedule/journal required');manifest=values.journal?(await readSnapshot(values.journal)).manifest:await loadJson(values.schedule);}
    let payload,folder;
    if(values.template){payload=evidenceTemplate(manifest,now);folder='templates';}
    else{if(!values.dataset)throw new Error('--dataset required');const {dataset,sha256}=validateCurrentDataset(await loadJson(values.dataset),now);
      if(values.history){const season=dataset.rows.map(r=>r.season).sort().at(-1),teams=[...new Set(dataset.rows.filter(r=>r.season===season).flatMap(r=>[r.home,r.away]))].sort();
        payload={schema:'lamultipla-context-history-v1',generatedAtUtc:now.toISOString(),datasetSha256:sha256,sourceCommit:dataset.commit,season,policy:CONTEXT_POLICY,
          teams:teams.map(team=>recentForm(dataset.rows,team,{atUtc:now.toISOString()})),sourceData:dataset.synthetic?'synthetic_test':'observed_real_history',
          decision:'NO_BET',reason:'HISTORY_SUMMARY_NOT_A_MATCH_FORECAST_OR_VALUE_DECISION',probabilityAdjustment:null};folder='history';}
      else{payload=buildContext({manifest,dataset,evidence:values.evidence?await loadJson(values.evidence):undefined,now});folder='dossiers';}}
    payload.provenance=await contextIdentity(ROOT);
    const filename=path.join(directory,folder,digest(payload)+'.json');await writeExclusive(filename,payload);console.log('Contesto privato:',filename);
    console.log(JSON.stringify({schema:payload.schema,...payload.counts,teams:payload.teams?.length,sourceData:payload.sourceData,probabilityAdjustment:null,operationallyApproved:false}));
  });
}
main().catch(e=>{console.error('Contesto interrotto:',e.code==='EEXIST'?'Snapshot già esistente; nessuna sovrascrittura':e.message);process.exitCode=1;});
