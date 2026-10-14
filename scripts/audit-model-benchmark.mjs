#!/usr/bin/env node
// Performance only. Never builds a journal, screens live prices, tunes or publishes.
import path from 'node:path';
import os from 'node:os';
import {parseArgs} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {readSnapshot,writeExclusive,digest} from './lib/prospective/store.mjs';
import {trainingBefore} from './lib/goals/data.mjs';
import {fitPoisson} from './lib/goals/model.mjs';
import {fitGoals,predictGrid} from './lib/engine/model.mjs';
import {requireRegisteredCode} from './lib/engine/registry.mjs';
import {validateCurrentDataset} from './lib/shadow/registry.mjs';
import {rng,quantile} from './lib/goals/metrics.mjs';
const {values}=parseArgs({strict:true,options:{dataset:{type:'string'},'study-v2':{type:'string'},development:{type:'boolean'},synthetic:{type:'boolean'},worker:{type:'string'},help:{type:'boolean'}}});
const cutoff='2024-06-01T00:00:00.000Z',seed=20261010,replicates=40;
async function inputs(){
 let rows,source,sourceDigest=null;
 if(values.development){if(!values.dataset||!values['study-v2'])throw Error('Development benchmark requires existing dataset and fixed study');
  const input=await loadJson(await privateInput(ROOT,values.dataset)),dataset=validateCurrentDataset(input,new Date()).dataset;
  sourceDigest=digest(dataset);rows=trainingBefore(dataset.rows.filter(r=>r.date<'2024-07-01'),cutoff);
  source='observed_development_rows_before_July2024_not_validation';
 }else{const random=rng(seed);rows=Array.from({length:1490},(_,i)=>{const date=new Date(Date.UTC(2020,5,1)+i%1450*86400000).toISOString().slice(0,10),home='Bench'+(i%30),away='Bench'+((i+1+i%7)%30);
   return {key:'synthetic-'+i,date,home,away,goals:[Math.floor(random()*4),Math.floor(random()*3)],availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()};});rows=trainingBefore(rows,cutoff);source='synthetic_test';}
 if(!rows.length||rows.some(r=>r.date>='2024-07-01'||Date.parse(r.availableAtUtc)>=Date.parse(cutoff)))throw Error('Consumed or future data refused');
 // Opaque benchmark names: never create real G7 fixture forecasts or retain coefficients.
 const names=[...new Set(rows.flatMap(r=>[r.home,r.away]))].sort(),aliases=new Map(names.map((n,i)=>[n,'SYNTHETIC_BENCH_TEAM_'+i]));
 rows=rows.map(r=>({...r,home:aliases.get(r.home),away:aliases.get(r.away)}));
 let selected={dc:{config:{kind:'dc',halfLife:365,ridge:20},temperature:.8},bivariate:{config:{kind:'bivariate',halfLife:365,ridge:20},temperature:.8}};
 if(values['study-v2']){const study=await readSnapshot(await privateInput(ROOT,values['study-v2']));await requireRegisteredCode(ROOT,study);selected=study.selected;}
 return {rows,selected,source,sourceDigest};
}
async function worker(kind){
 const {rows,selected,source,sourceDigest}=await inputs(),cpu=process.cpuUsage(),start=performance.now();
 const config=kind==='v1'?{halfLife:365,ridge:5,rho:-.1}:selected[kind].config;
 const fit=sample=>kind==='v1'?fitPoisson(sample,cutoff,config):fitGoals(sample,cutoff,config);
 const t=performance.now(),central=fit(rows),centralMs=performance.now()-t;
 const teams=central.teams.filter(n=>central.counts[n]>=20),targets=Array.from({length:10},(_,i)=>[teams[i%teams.length],teams[(i+10)%teams.length]]);
 const groups=new Map();for(const r of rows){const key=kind==='v1'?r.date:Math.floor(Date.parse(r.date)/(7*86400000)),g=groups.get(key)??[];g.push(r);groups.set(key,g);}
 const blocks=[...groups.values()],random=rng(seed),times=[],iterations=[],stored=[],failedFits=[];const failuresByTarget=targets.map(()=>0);
 const beforeBootstrap=performance.now();
 for(let b=0;b<replicates;b++){const sample=[];for(let k=0;k<blocks.length;k++)sample.push(...blocks[Math.floor(random()*blocks.length)]);
  const before=performance.now(),f=fit(sample);iterations.push(f.iterations);if(!f.converged)failedFits.push(b);
  stored.push(targets.map(([home,away],i)=>{const g=predictGrid(f,home,away,kind==='v1'?1:selected[kind].temperature);if(!g)failuresByTarget[i]++;return kind==='v1'?(g?g[0][0]:null):g;}));times.push(performance.now()-before);
 }
 const memory=process.memoryUsage(),usage=process.resourceUsage(),elapsedMs=performance.now()-start,used=process.cpuUsage(cpu);
 return {kind,source,sourceDigest,cutoffUtc:cutoff,trainingRows:rows.length,teams:central.teams.length,targets:10,parameters:config,temperature:kind==='v1'?1:selected[kind].temperature,
  central:{milliseconds:centralMs,converged:central.converged,iterations:central.iterations},bootstrap:{replicates,blockKind:kind==='v1'?'date':'week',blocks:blocks.length,
    milliseconds:performance.now()-beforeBootstrap,minFitMs:Math.min(...times),medianFitMs:quantile(times,.5),p95FitMs:quantile(times,.95),maxFitMs:Math.max(...times),failedFits:failedFits.length,failuresByTarget,iterations},
  elapsedMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,rssEndMiB:memory.rss/1048576,heapUsedEndMiB:memory.heapUsed/1048576,processPeakRssMiB:usage.maxRSS/1024,
  retainedBootstrapGrids:kind==='v1'?0:stored.flat().filter(Boolean).length,forecastCreated:false,tuningPerformed:false,statisticalValidationPerformed:false};
}
async function main(){
 if(values.help){console.log('--synthetic | --development --dataset PRIVATE_FILE --study-v2 REGISTERED_STUDY. Fixed pre-July2024 development cutoff, 40 resamples; performance only, no journal/API/tuning.');return;}
 if(Boolean(values.development)===Boolean(values.synthetic))throw Error('Choose one permitted benchmark scope');
 if(values.worker){if(!['v1','dc','bivariate'].includes(values.worker))throw Error('Invalid worker');console.log(JSON.stringify(await worker(values.worker)));return;}
 const results=[];for(const kind of ['v1','dc','bivariate']){console.log('Benchmark performance:',kind);
  const args=[path.join(ROOT,'scripts/audit-model-benchmark.mjs'),values.development?'--development':'--synthetic','--worker',kind];
  if(values.dataset)args.push('--dataset',values.dataset);if(values['study-v2'])args.push('--study-v2',values['study-v2']);
  const r=await promisify(execFile)(process.execPath,args,{cwd:ROOT,windowsHide:true,timeout:1800000,maxBuffer:1024*1024});const result=JSON.parse(r.stdout);results.push(result);console.log(JSON.stringify({kind,seconds:result.elapsedMs/1000,peakRssMiB:result.processPeakRssMiB}));}
 const payload={schema:'lamultipla-permitted-model-benchmark-v1',generatedAtUtc:new Date().toISOString(),host:{platform:process.platform,node:process.version,cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length,totalMemoryGiB:os.totalmem()/1073741824},
  runs:results,totalSequentialMs:results.reduce((s,r)=>s+r.elapsedMs,0),operationallyApproved:false,actualStakeEUR:0,providerRequests:0,
  limitations:['One isolated process per candidate; peak RSS not system-wide or GPU memory','Development/synthetic workload is not a G7 live benchmark or predictive validation','No p95 end-to-end guarantee; production includes input acquisition, original v1/v2 reference duplication, serialization, screening and transport','No coefficients, probabilities or journals retained; parameters fixed, no tuning']};
 const file=path.join(ROOT,'.local/diagnostics/strategic-audit/benchmarks',digest(payload)+'.json');await writeExclusive(file,payload);console.log(JSON.stringify({file,totalSequentialSeconds:payload.totalSequentialMs/1000}));
}
main().catch(()=>{console.error('Performance audit stopped; inspect permitted input and private benchmark state. No forecast, provider or delivery.');process.exitCode=1;});
