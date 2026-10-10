#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,loadJson,withLock} from './lib/private-store.mjs';
import {readSnapshot,writeExclusive,digest} from './lib/prospective/store.mjs';
import {validateCurrentDataset} from './lib/shadow/registry.mjs';
import {runDevelopment} from './lib/engine/study.mjs';
import {engineCodeIdentity,requireRegisteredCode} from './lib/engine/registry.mjs';
import {buildForecast} from './lib/engine/forecast.mjs';
import {experimentalScreen} from './lib/engine/screen.mjs';
import {evaluateEngine,engineProgress} from './lib/engine/evaluate.mjs';
const {values}=parseArgs({options:{help:{type:'boolean'},develop:{type:'boolean'},freeze:{type:'boolean'},screen:{type:'boolean'},evaluate:{type:'boolean'},progress:{type:'boolean'},
  dataset:{type:'string'},study:{type:'string'},schedule:{type:'string'},journal:{type:'string'},report:{type:'string'},assessment:{type:'string'},results:{type:'string'},inspect:{type:'string'}},strict:true});
const directory=path.join(ROOT,'.local/model-v2');
const files=async folder=>{try{return(await fs.readdir(folder)).filter(n=>n.endsWith('.json')).map(n=>path.join(folder,n));}catch(e){if(e.code==='ENOENT')return [];throw e;}};
async function main(){
  if(values.help){console.log('--develop --dataset FILE | --freeze --study FILE --dataset FILE --schedule FILE | --screen --journal FILE --study FILE --report FILE [--assessment FILE] | --evaluate --journal FILE --study FILE --results FILE | --progress | --inspect FILE. Local only; no OddsPapi calls or scheduler.');return;}
  if(values.inspect){console.log(JSON.stringify(await readSnapshot(values.inspect),null,2));return;}
  if(['develop','freeze','screen','evaluate','progress'].filter(k=>values[k]).length!==1)throw new Error('Exactly one engine mode required');
  await withLock(directory,async()=>{
    const now=new Date();
    if(values.develop){
      if(!values.dataset)throw new Error('--dataset required');const input=await loadJson(values.dataset),{dataset,sha256}=validateCurrentDataset(input,now);
      if(input.schema!=='lamultipla-prospective-envelope-v1'&&path.basename(values.dataset,'.json')!==sha256)throw new Error('Content-addressed original dataset required');
      const startedAtUtc=now.toISOString(),identity=await engineCodeIdentity(ROOT),result=runDevelopment(dataset.rows,{progress:console.log});
      let commit=null,dirty=null;try{commit=(await promisify(execFile)('git',['-C',ROOT,'rev-parse','HEAD'])).stdout.trim();dirty=Boolean((await promisify(execFile)('git',['-C',ROOT,'status','--porcelain'])).stdout.trim());}catch{/* Hash remains the primary source identity. */}
      const study={...result,startedAtUtc,generatedAtUtc:new Date().toISOString(),datasetSha256:sha256,sourceCommit:dataset.commit,sourceFiles:dataset.files,
        modelCodeSha256:identity.sha256,codePaths:identity.paths,protocolSha256:identity.protocolSha256,repositoryCommit:commit,repositoryDirty:dirty};
      const filename=path.join(directory,'development',digest(study)+'.json');await writeExclusive(filename,study);
      console.log('Sviluppo v2 privato:',filename);console.log(JSON.stringify({selected:study.selected,validFor:study.validFor,validatedMarkets:[],operationallyApproved:false}));return;
    }
    if(values.progress){const journals=await Promise.all((await files(path.join(directory,'journals'))).map(readSnapshot)),evaluations=await Promise.all((await files(path.join(directory,'evaluations'))).map(readSnapshot));
      const result=engineProgress(journals,evaluations,{now}),filename=path.join(directory,'progress',digest(result)+'.json');await writeExclusive(filename,result);console.log('Monitoraggio v2 privato:',filename);console.log(JSON.stringify(result));return;}
    if(!values.study)throw new Error('--study required');const study=await readSnapshot(values.study);await requireRegisteredCode(ROOT,study);
    if(values.freeze){
      if(!values.dataset||!values.schedule)throw new Error('--dataset and --schedule required');const schedule=await loadJson(values.schedule),input=await loadJson(values.dataset),{dataset}=validateCurrentDataset(input,now);
      const id=`${schedule.season?.replace('/','-')}-round-${schedule.matchday}-${digest(study).slice(0,16)}`,filename=path.join(directory,'journals',id+'.json');
      try{await fs.stat(filename);throw new Error('Engine forecast already frozen: no replacement');}catch(e){if(e.code!=='ENOENT')throw e;}
      const journal=buildForecast(study,dataset,schedule);await writeExclusive(filename,journal);console.log('Forecast v2 shadow congelato:',filename);console.log(JSON.stringify(journal.counts));return;
    }
    if(!values.journal)throw new Error('--journal required');const journal=await readSnapshot(values.journal);
    if(values.screen){if(!values.report)throw new Error('--report required');const report=await loadJson(values.report),assessment=values.assessment?await loadJson(values.assessment):{};
      const result=experimentalScreen({journal,study,report,assessment,now}),filename=path.join(directory,'screens',digest(result)+'.json');await writeExclusive(filename,result);console.log('Screening multi-mercato shadow:',filename);console.log(JSON.stringify({decision:result.decision,...result.counts,globalIssues:result.globalIssues}));return;}
    if(!values.results)throw new Error('--results required');const results=await readSnapshot(values.results),result=evaluateEngine(journal,study,results,{now});
    const filename=path.join(directory,'evaluations',digest(result)+'.json');await writeExclusive(filename,result);console.log('Valutazione v2 privata:',filename);console.log(JSON.stringify({planned:result.planned,observed:result.observed.length,paired:result.records.length}));
  });
}
main().catch(e=>{console.error('Motore v2 interrotto:',e.code==='EEXIST'?'Snapshot già esistente; nessuna sovrascrittura':e.message);process.exitCode=1;});
