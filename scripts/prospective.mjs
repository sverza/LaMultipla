#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ROOT, PRIVATE_DIR, loadJson, withLock } from './lib/private-store.mjs';
import { sha256, normalizeSeason } from './lib/goals/data.mjs';
import { digest, readSnapshot, writeExclusive } from './lib/prospective/store.mjs';
import { validateReproduction, manifestFromReport, journalId, batchForecast, sealJournal, MODEL_VERSION } from './lib/prospective/freeze.mjs';
import { evaluateJournal, progressiveMetrics } from './lib/prospective/evaluate.mjs';
import { normalizeBoard } from './lib/prospective/market.mjs';

const {values}=parseArgs({options:{'verify-study':{type:'boolean'},freeze:{type:'boolean'},inspect:{type:'string'},
  'market-template':{type:'string'},'capture-results':{type:'string'},evaluate:{type:'string'},progress:{type:'boolean'},market:{type:'string'},boards:{type:'string'},
  study:{type:'string'},report:{type:'string'},schedule:{type:'string'},results:{type:'string'},help:{type:'boolean'}},strict:true});
const directory=path.join(ROOT,'.local/model/prospective');
const codePaths=['data','model','metrics','study','bridge'].map(n=>`scripts/lib/goals/${n}.mjs`);
async function identity(){
  const texts=await Promise.all(codePaths.map(p=>fs.readFile(path.join(ROOT,p),'utf8')));
  const protocol=await fs.readFile(path.join(ROOT,'docs/protocollo-modello-gol-v1.md'),'utf8');
  const normalize=t=>t.replace(/\r\n/g,'\n');
  let repositoryCommit=null;
  try {repositoryCommit=(await promisify(execFile)('git',['-C',ROOT,'rev-parse','HEAD'])).stdout.trim();}catch{ /* content hashes remain mandatory */ }
  return {codeRawSha256:sha256(texts.join('\n')),codeCanonicalSha256:sha256(texts.map(normalize).join('\n')),
    protocolRawSha256:sha256(protocol),protocolCanonicalSha256:sha256(normalize(protocol)),repositoryCommit,
    journalCodeSha256:sha256((await Promise.all(['scripts/prospective.mjs','scripts/lib/prospective/freeze.mjs','scripts/lib/prospective/store.mjs',
      'scripts/lib/prospective/evaluate.mjs','scripts/lib/prospective/market.mjs'].map(p=>fs.readFile(path.join(ROOT,p),'utf8')))).map(normalize).join('\n'))};
}
async function artifacts(){
  if(!values.study)throw new Error('--study required');
  const study=await loadJson(values.study),dataset=await loadJson(path.join(ROOT,'.local/model/datasets',study.datasetSha256+'.json'));
  const codeIdentity=await identity();validateReproduction(study,dataset,codeIdentity);
  return {study,dataset,codeIdentity};
}
async function filesIn(dir){try{return (await fs.readdir(dir)).filter(n=>n.endsWith('.json')).map(n=>path.join(dir,n));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
const nowUtc=()=>new Date().toISOString();
async function main(){
  if(values.help){console.log('--verify-study --study FILE | --freeze --study FILE [--report FILE] | --inspect JOURNAL | --capture-results JOURNAL | --evaluate JOURNAL --results FILE | --progress | --market JOURNAL --boards FILE');return;}
  const modes=['verify-study','freeze','inspect','market-template','capture-results','evaluate','progress','market'].filter(k=>values[k]);
  if(modes.length!==1)throw new Error('Exactly one mode required');
  if(values['verify-study']){
    const {study,dataset,codeIdentity}=await artifacts();console.log(JSON.stringify({historicalReproductionVerified:true,modelVersion:MODEL_VERSION,
      sourceCommit:dataset.commit,sourceFiles:dataset.files.length,results:dataset.rows.length,testPredictions:study.test.records.length,
      datasetSha256:study.datasetSha256,...codeIdentity},null,2));return;
  }
  if(values.inspect){
    const journal=await readSnapshot(values.inspect);if(journal.schema!=='lamultipla-prospective-journal-v1')throw new Error('Journal required');
    console.log(JSON.stringify({id:journal.id,sha256:digest(journal),generatedAtUtc:journal.generatedAtUtc,trainingCutoffUtc:journal.trainingCutoffUtc,
      modelVersion:journal.modelVersion,counts:journal.counts,entries:journal.entries.map(e=>({fixtureId:e.fixtureId,home:e.home,away:e.away,kickoffUtc:e.kickoffUtc,
        status:e.status,reason:e.reason,probabilities:e.probabilities,intervals95:e.intervals95,entrySha256:e.entrySha256}))},null,2));return;
  }
  await withLock(directory,async()=>{
    if(values.freeze){
      const {study,dataset,codeIdentity}=await artifacts();
      const schedule=await loadJson(values.schedule||path.join(ROOT,'docs/fixtures/seriea-2026-27-round06.json'));
      const latest=values.report?null:await loadJson(path.join(PRIVATE_DIR,'latest.json'));
      const report=await loadJson(values.report||path.join(PRIVATE_DIR,latest.reportPath));
      const manifest=manifestFromReport(report,schedule),id=journalId(manifest),out=path.join(directory,'journals',id+'.json');
      try {await fs.stat(out);throw new Error('Journal already exists: forecasts cannot be overwritten');}catch(e){if(e.code!=='ENOENT')throw e;}
      const startedAtUtc=nowUtc();
      if(Date.parse(dataset.acquiredAtUtc)>Date.parse(startedAtUtc)||Date.parse(study.validationCompletedAtUtc)>Date.parse(startedAtUtc))throw new Error('Future artifacts');
      const trainingCutoffUtc=manifest.events.map(e=>e.kickoffUtc.slice(0,7)).sort()[0]+'-01T00:00:00.000Z';
      if(Date.parse(trainingCutoffUtc)>Date.parse(startedAtUtc))throw new Error('Monthly training cutoff in future');
      const legacyForecasts=[];
      for(const file of await filesIn(path.join(ROOT,'.local/model/forecasts'))){const raw=await fs.readFile(file,'utf8');
        const old=JSON.parse(raw);legacyForecasts.push({filename:path.basename(file),sha256:sha256(raw),generatedAtUtc:old.generatedAtUtc??null,registeredAsProspective:false});}
      const batch=batchForecast(dataset.rows,trainingCutoffUtc,manifest);
      const generatedAtUtc=nowUtc();
      const journal=sealJournal(batch,manifest,{studySha256:digest(study),datasetSha256:digest(dataset),sourceCommit:dataset.commit,
        sourceFiles:dataset.files,datasetAcquiredAtUtc:dataset.acquiredAtUtc,startedAtUtc,...codeIdentity},generatedAtUtc,legacyForecasts);
      const hash=await writeExclusive(out,journal);console.log('Journal prospettico privato:',out);
      console.log(JSON.stringify({id,sha256:hash,generatedAtUtc,trainingCutoffUtc,counts:journal.counts,decision:journal.decision}));return;
    }
    if(values['market-template']){
      const journal=await readSnapshot(values['market-template']);
      const boards=journal.entries.filter(e=>e.status==='prospective').map(e=>({fixtureId:e.fixtureId,home:e.home,away:e.away,
        domain:'bet365.it',origin:'manual_bet365_it',reviewer:'',evidence:'',period:'fulltime',marketName:'Full Time Result',marketType:'1x2',line:0,playerKey:'0',
        selections:['1','X','2'].map(outcome=>({outcome,price:null,availability:null,verifiedAtUtc:null,providerFlags:null}))}));
      const out=path.join(directory,'market-templates',journal.id+'-'+randomUUID()+'.json');await writeExclusive(out,{journalId:journal.id,boards});
      console.log('Template senza quote inventate:',out);return;
    }
    if(values['capture-results']){
      const journal=await readSnapshot(values['capture-results']);
      const get=async url=>{const r=await fetch(url,{headers:{'User-Agent':'LaMultipla-public-results-experiment'},signal:AbortSignal.timeout(30000)});
        if(!r.ok)throw new Error(`Public source HTTP ${r.status}`);return r.text();};
      const meta=JSON.parse(await get('https://api.github.com/repos/openfootball/football.json/commits/master'));
      if(!/^[a-f0-9]{40}$/.test(meta.sha))throw new Error('Invalid source commit');
      const base=`https://raw.githubusercontent.com/openfootball/football.json/${meta.sha}/`;
      const license=await get(base+'LICENSE.md');if(!license.startsWith('CC0 1.0 Universal'))throw new Error('CC0 license not verified');
      const season=journal.manifest.season.replace('/','-'),url=base+season+'/it.1.json',raw=await get(url),acquiredAtUtc=nowUtc();
      const normalized=normalizeSeason(JSON.parse(raw),season,acquiredAtUtc);
      const result={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:meta.sha,
        sourceCommitAtUtc:meta.commit?.committer?.date??null,url,rawSha256:sha256(raw),licenseSha256:sha256(license),acquiredAtUtc,
        rows:normalized.rows,audit:normalized.audit,pointInTimeClaim:'Observed now; no original historical publication timestamps'};
      const out=path.join(directory,'results',digest(result)+'.json');await writeExclusive(out,result);
      console.log('Risultati osservati privati:',out);console.log(JSON.stringify({sourceCommit:meta.sha,results:result.rows.length,missing:result.audit.skipped.length}));return;
    }
    if(values.evaluate){
      if(!values.results)throw new Error('--results required');
      const journal=await readSnapshot(values.evaluate),result=await readSnapshot(values.results),markets=[];
      for(const file of await filesIn(path.join(directory,'markets',journal.id)))markets.push(await readSnapshot(file));
      const evaluation=evaluateJournal(journal,result,{markets}),out=path.join(directory,'evaluations',journal.id,digest(result)+'.json');
      await writeExclusive(out,evaluation);console.log('Valutazione privata:',out);console.log(JSON.stringify({counts:evaluation.counts,metrics:evaluation.metrics}));return;
    }
    if(values.market){
      if(!values.boards)throw new Error('--boards required');
      const journal=await readSnapshot(values.market),inputRaw=await loadJson(values.boards),input=inputRaw.payload||inputRaw,capturedAtUtc=nowUtc(),audit=[];
      if(input.journalId!==journal.id || !Array.isArray(input.boards)||new Set(input.boards.map(b=>b.fixtureId)).size!==input.boards.length)throw new Error('Unique boards required');
      for(const board of input.boards){
        try {const entry=journal.entries.find(e=>e.fixtureId===board.fixtureId);if(!entry)throw new Error('Fixture absent');
          const market=normalizeBoard(board,entry,journal.id,capturedAtUtc),out=path.join(directory,'markets',journal.id,board.fixtureId+'.json');
          const hash=await writeExclusive(out,market);audit.push({fixtureId:board.fixtureId,sha256:hash,compatible:market.compatible});
        }catch(e){audit.push({fixtureId:board.fixtureId,rejected:true,reason:e.code==='EEXIST'?'Snapshot already exists':e.message});}
      }
      await writeExclusive(path.join(directory,'market-attempts',randomUUID()+'.json'),{journalId:journal.id,capturedAtUtc,audit});
      console.log(JSON.stringify(audit,null,2));return;
    }
    if(values.progress){
      const journals=await Promise.all((await filesIn(path.join(directory,'journals'))).map(readSnapshot)),evaluations=[];
      for(const j of journals)for(const file of await filesIn(path.join(directory,'evaluations',j.id)))evaluations.push(await readSnapshot(file));
      const groups=new Map();for(const j of journals){const group=groups.get(j.modelVersion)||[];group.push(j);groups.set(j.modelVersion,group);}
      const output={generatedAtUtc:nowUtc(),versions:Object.fromEntries([...groups].map(([version,js])=>[version,progressiveMetrics(js,evaluations)]))};
      const out=path.join(directory,'progress',randomUUID()+'.json');await writeExclusive(out,output);console.log('Progressione privata:',out);console.log(JSON.stringify(output,null,2));
    }
  });
}
main().catch(error=>{console.error('Procedura interrotta:',error.code==='EEXIST'?'Snapshot esistente: nessuna sovrascrittura':error.message);process.exitCode=1;});
