#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,saveJson,loadJson,withLock} from './lib/private-store.mjs';
import {SOURCE_COMMIT,sha256,normalizeSeason} from './lib/goals/data.mjs';
import {runStudy,forecastWithUncertainty} from './lib/goals/study.mjs';
const {values}=parseArgs({options:{source:{type:'string'},dataset:{type:'string'},'prepare-only':{type:'boolean'},download:{type:'boolean'},cutoff:{type:'string'},study:{type:'string'},
  home:{type:'string'},away:{type:'string'},help:{type:'boolean'}},strict:true});
const directory=path.join(ROOT,'.local/model');
if(values.help){console.log('node scripts/goals-study.mjs --download --cutoff 2026-10-09T23:59:59Z');
  console.log('oppure --source cartella_clone_openfootball. Forecast: --study file --home nome --away nome --cutoff timestamp UTC');}
else try {
  if(!values.cutoff || !/T.*Z$/.test(values.cutoff) || !Number.isFinite(Date.parse(values.cutoff)) || Date.parse(values.cutoff)>Date.now())throw new Error('Explicit UTC cutoff required, not in future');
  await withLock(directory,async()=>{
    if(values.study){
      const study=await loadJson(values.study),dataset=await loadJson(values.dataset||path.join(directory,'datasets',study.datasetSha256+'.json'));
      const forecastDatasetSha256=sha256(JSON.stringify(dataset));
      const expectedDatasetSha256=values.dataset?path.basename(values.dataset,'.json'):study.datasetSha256;
      if(forecastDatasetSha256!==expectedDatasetSha256 || dataset.schema!=='lamultipla-results-dataset-v1' || dataset.license!=='CC0-1.0')throw new Error('Dataset hash mismatch');
      if(study.schema!=='lamultipla-goals-study-v1'||!values.home||!values.away)throw new Error('Invalid forecast inputs');
      if(!Number.isFinite(Date.parse(dataset.acquiredAtUtc)) || Date.parse(dataset.acquiredAtUtc)>Date.parse(values.cutoff)
        || Date.parse(dataset.cutoffUtc)>Date.parse(values.cutoff))throw new Error('Dataset not available at forecast cutoff');
      if(Date.parse(values.cutoff)<=Date.parse(study.validationCompletedAtUtc))throw new Error('Forecast must follow frozen test and study acquisition');
      const forecast=forecastWithUncertainty(dataset.rows,values.cutoff,study.selected,values.home,values.away);
      const out=path.join(directory,'forecasts',randomUUID()+'.json');
      await saveJson(out,{...forecast,generatedAtUtc:new Date().toISOString(),validationCompletedAtUtc:study.validationCompletedAtUtc,studySha256:sha256(JSON.stringify(study)),datasetSha256:forecastDatasetSha256,acceptance:study.acceptance});
      console.log('Forecast sperimentale privato:',out);console.log(JSON.stringify({decision:forecast.decision,cause:forecast.cause,uncertaintySufficient:forecast.uncertainty?.sufficient}));return;
    }
    if(!values.download&&!values.source)throw new Error('Source directory or explicit --download required');
    const files=[],audits=[],rows=[];
    let sourceCommit=values.download?SOURCE_COMMIT:null;
    if(values.source){
      try { const result=await promisify(execFile)('git',['-C',path.resolve(values.source),'rev-parse','HEAD']);
        const status=await promisify(execFile)('git',['-C',path.resolve(values.source),'status','--porcelain']);
        if(!status.stdout.trim())sourceCommit=result.stdout.trim();
      } catch { /* Plain directories are identified by individual file hashes. */ }
    }
    const get=async relative=>{
      if(values.download){const url=`https://raw.githubusercontent.com/openfootball/football.json/${SOURCE_COMMIT}/${relative}`;
        const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Source HTTP ${response.status}`);return response.text();}
      return fs.readFile(path.join(values.source,relative),'utf8');};
    const license=await get('LICENSE.md');if(!license.startsWith('CC0 1.0 Universal'))throw new Error('Source license not verified');
    for(let year=2013;year<=2026;year++){
      const season=`${year}-${String(year+1).slice(-2)}`,relative=`${season}/it.1.json`,raw=await get(relative);
      const normalized=normalizeSeason(JSON.parse(raw),season,values.cutoff);
      files.push({path:relative,sha256:sha256(raw)});rows.push(...normalized.rows);audits.push(normalized.audit);
    }
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
    const dataset={schema:'lamultipla-results-dataset-v1',source:'openfootball/football.json',commit:sourceCommit,
      localSource:values.download?null:path.resolve(values.source),acquiredAtUtc:new Date().toISOString(),cutoffUtc:values.cutoff,
      license:'CC0-1.0',licenseSha256:sha256(license),files,audits,rows};
    const datasetSha256=sha256(JSON.stringify(dataset));await saveJson(path.join(directory,'datasets',datasetSha256+'.json'),dataset);
    if(values['prepare-only']){console.log('Dataset privato:',path.join(directory,'datasets',datasetSha256+'.json'));return;}
    console.log('Dataset verificato:',rows.length,'risultati; studio in corso.');
    const study=runStudy(rows,audits);
    const protocol=await fs.readFile(path.join(ROOT,'docs/protocollo-modello-gol-v1.md'),'utf8');
    const codeFiles=['data','model','metrics','study','bridge'];const codeSha256=sha256((await Promise.all(codeFiles.map(n=>fs.readFile(path.join(ROOT,`scripts/lib/goals/${n}.mjs`),'utf8')))).join('\n'));
    const result={...study,datasetSha256,protocolSha256:sha256(protocol),codeSha256,sourceFiles:files,audits,
      validationCompletedAtUtc:new Date().toISOString(),cutoffUtc:values.cutoff};
    const out=path.join(directory,'studies',randomUUID()+'.json');await saveJson(out,result);
    console.log('Studio privato:',out);console.log(JSON.stringify({selected:study.selected,
      testPredictions:study.test.records.length,excluded:study.test.excluded.length,
      markets:Object.fromEntries(Object.entries(study.acceptance).map(([k,v])=>[k,{retrospectiveAccepted:v.retrospectiveAccepted,reasons:v.reasons}]))}));
  });
} catch(error){console.error('Studio interrotto:',error.message);process.exitCode=1;}
