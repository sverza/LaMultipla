#!/usr/bin/env node
// Development-only, private artifacts, deterministic synthetic forecasts. No provider or delivery.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput} from './lib/orchestration/analysis-plan.mjs';
import {digest,envelope,writeExclusive} from './lib/prospective/store.mjs';
import {diagnosticHtml} from './lib/diagnostics/html.mjs';
import {syntheticDiagnosticVolume} from '../tests/fixtures/diagnostic-volume.mjs';
const {values}=parseArgs({strict:true,options:{shape:{type:'string'},mode:{type:'string'},timeout:{type:'string'},worker:{type:'string'},directory:{type:'string'},variant:{type:'string'},help:{type:'boolean'}}});
const moduleUrl=p=>pathToFileURL(path.join(ROOT,p)).href;
async function profiledReference(directory,memoize=false){
 const helpers=path.join(directory,'profile-helpers.mjs'),profile=path.join(directory,'profile-progress.private.json');
 await fs.writeFile(helpers,`import fs from 'node:fs';
import {digest as hash} from ${JSON.stringify(moduleUrl('scripts/lib/prospective/store.mjs'))};
import * as markets from ${JSON.stringify(moduleUrl('scripts/lib/engine/markets.mjs'))};
export const metrics={reportHashComputations:0,reportHashLookups:0,reportHashMs:0,payoutMs:0,payoutCalls:0};let report,reportHash;
export function setReport(r){report=r;}
export function digest(v){if(v===report){metrics.reportHashLookups++;if(${memoize}&&reportHash!==undefined)return reportHash;}const t=performance.now(),h=hash(v);if(v===report){reportHash=h;metrics.reportHashComputations++;metrics.reportHashMs+=performance.now()-t;
 if(metrics.reportHashComputations%64===0)fs.writeFileSync(${JSON.stringify(profile)},JSON.stringify({...metrics,peakRssMiB:process.resourceUsage().maxRSS/1024,cpu:process.cpuUsage()}));}return h;}
export const fingerprint=digest,quoteSpec=markets.quoteSpec,FAMILIES=markets.FAMILIES;
export function settlementProbabilities(...a){const t=performance.now();const r=markets.settlementProbabilities(...a);metrics.payoutMs+=performance.now()-t;metrics.payoutCalls++;return r;}
export function evForGrid(...a){const t=performance.now();const r=markets.evForGrid(...a);metrics.payoutMs+=performance.now()-t;metrics.payoutCalls++;return r;}
`,{flag:'wx'});
 const originals={};
 for(const [name,relative] of [['screen','scripts/lib/engine/screen.mjs'],['multimarket','scripts/lib/diagnostics/multimarket.mjs']]){
  let source=(await fs.readFile(path.join(ROOT,relative),'utf8')).replace(/\r\n/g,'\n');originals[relative]=digest(source);
  source=source.replace(/from '([^']+)'/g,(_,specifier)=>{
   let url=pathToFileURL(path.resolve(path.dirname(path.join(ROOT,relative)),specifier)).href;
   if(/(?:odds-report|prospective\/store|engine\/markets)\.mjs$/.test(url)||name==='screen'&&specifier==='./markets.mjs')url=pathToFileURL(helpers).href;
   if(name==='multimarket'&&specifier==='../engine/screen.mjs')url=pathToFileURL(path.join(directory,'profile-screen.mjs')).href;
   return 'from '+JSON.stringify(url);
  });
  if(name==='multimarket')source=source.replace('  const screen=report?experimentalScreen({journal,study,report,assessment,now}):null;',
   '  const phaseStarted=performance.now();const screen=report?experimentalScreen({journal,study,report,assessment,now}):null;profileMetrics.screeningMs=performance.now()-phaseStarted;');
  if(name==='multimarket')source=`import {metrics as profileMetrics} from ${JSON.stringify(pathToFileURL(helpers).href)};\n`+source;
  await fs.writeFile(path.join(directory,'profile-'+name+'.mjs'),source,{flag:'wx'});
 }
 return {originals,helpers,module:path.join(directory,'profile-multimarket.mjs')};
}
async function worker(){
 const directory=await privateInput(ROOT,values.directory),shape=await loadJson(await privateInput(ROOT,values.shape)),s=await syntheticDiagnosticVolume(shape);
 if(values.variant==='incomplete'){s.report.round.verified=false;s.report.selections[0].price=null;s.report.selections[1].active=false;}
 else if(values.variant==='duplicates')s.report.selections[1]=structuredClone(s.report.selections[0]);
 else if(values.variant&&values.variant!=='base')throw Error('BENCHMARK_VARIANT_INVALID');
 let build,metrics={},sources=null;
 if(['reference','reference-cached'].includes(values.worker)){
  const profiled=await profiledReference(directory,values.worker==='reference-cached'),helpers=await import(pathToFileURL(profiled.helpers));helpers.setReport(s.report);
  await writeExclusive(path.join(directory,'reference-sources.private.json'),profiled.originals);
  build=(await import(pathToFileURL(profiled.module))).buildMultimarketDiagnostic;metrics=helpers.metrics;sources=profiled.originals;
 }else if(values.worker==='optimized')build=(await import('./lib/diagnostic-performance/multimarket.mjs')).buildMultimarketDiagnosticOptimized;
 else throw Error('BENCHMARK_MODE_INVALID');
 const inputHash=digest(s),cpu=process.cpuUsage(),start=performance.now(),d=build(s,metrics),buildMs=performance.now()-start;
 const jsonStart=performance.now(),sealed=envelope(d),json=JSON.stringify(sealed,null,2)+'\n',jsonMs=performance.now()-jsonStart;
 const htmlStart=performance.now(),html=diagnosticHtml(d),htmlMs=performance.now()-htmlStart,used=process.cpuUsage(cpu);
 if(inputHash!==digest(s))throw Error('BENCHMARK_INPUT_MUTATED');
 const result={schema:'lamultipla-diagnostic-performance-benchmark-v1',mode:values.worker,variant:values.variant??'base',sourceData:'synthetic_test',generatedAtUtc:new Date().toISOString(),
  quotes:s.report.selections.length,marketTypes:new Set(s.report.selections.map(q=>q.marketType)).size,buildMs,jsonMs,htmlMs,totalMs:buildMs+jsonMs+htmlMs,metrics,
  cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,peakRssMiB:process.resourceUsage().maxRSS/1024,rssEndMiB:process.memoryUsage().rss/1048576,
  outputSha256:sealed.sha256,jsonFormat:'immutable-envelope-pretty-json',jsonBytes:Buffer.byteLength(json),htmlBytes:Buffer.byteLength(html),htmlSha256:digest(html),counts:d.counts,
  originalSources:sources,inputShapeSha256:digest(shape.selections.map(q=>[q.marketType,q.period,q.marketId,q.outcomeId,q.line,q.outcome])),originalForecastProduced:false,providerRequests:0,actualStakeEUR:0};
 const archiveStarted=performance.now();
 await fs.writeFile(path.join(directory,'diagnostic.private.json'),json,{flag:'wx',mode:0o600});await fs.writeFile(path.join(directory,'diagnostic.private.html'),html,{flag:'wx',mode:0o600});
 result.artifactWriteMs=performance.now()-archiveStarted;result.peakRssMiB=process.resourceUsage().maxRSS/1024;
 await writeExclusive(path.join(directory,'completed.private.json'),result);console.log(JSON.stringify({mode:result.mode,totalSeconds:result.totalMs/1000,peakRssMiB:result.peakRssMiB,metrics}));
}
async function main(){
 if(values.help){console.log('--shape PRIVATE_EXISTING_REPORT --mode reference|reference-cached|optimized [--timeout 300] [--variant base|incomplete|duplicates]. reference-cached changes only pure invariant report hashing, retaining all original algorithm searches/maths. Synthetic only; private process profile retained on timeout.');return;}
 if(values.worker)return worker();
 if(!values.shape||!['reference','reference-cached','optimized'].includes(values.mode))throw Error('BENCHMARK_SHAPE_MODE_REQUIRED');
 const timeout=Number(values.timeout??300);if(!Number.isFinite(timeout)||timeout<1||timeout>1800)throw Error('BENCHMARK_TIMEOUT_INVALID');
 const directory=path.join(ROOT,'.local/diagnostics/performance',randomUUID());await fs.mkdir(directory,{recursive:true});
 await writeExclusive(path.join(directory,'intent.private.json'),{mode:values.mode,variant:values.variant??'base',timeoutSeconds:timeout,startedAtUtc:new Date().toISOString(),sourceData:'synthetic_test',providerRequests:0});
 const args=[fileURLToPath(import.meta.url),'--worker',values.mode,'--shape',await privateInput(ROOT,values.shape),'--directory',directory];
 if(values.variant)args.push('--variant',values.variant);
 const start=performance.now(),child=spawn(process.execPath,args,{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false,interrupted=false;
 const interrupt=()=>{interrupted=true;child.kill();};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
 const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout*1000);
 let completion;try{completion=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,signal:null,error:error.code??error.name}));child.once('close',(code,signal)=>resolve({code,signal}));});}finally{clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);if(child.exitCode===null&&child.signalCode===null)child.kill();}
 const result={status:interrupted?'INTERRUPTED':timedOut?'TIMEOUT':completion.code===0?'COMPLETED':'FAILED',workerPid:child.pid,completedAtUtc:new Date().toISOString(),elapsedMs:performance.now()-start,completion,stdout,stderr,
  progress:fsSync.existsSync(path.join(directory,'profile-progress.private.json'))?JSON.parse(await fs.readFile(path.join(directory,'profile-progress.private.json'),'utf8')):null};
 await writeExclusive(path.join(directory,'outcome.private.json'),result);console.log(JSON.stringify({directory,status:result.status,elapsedSeconds:result.elapsedMs/1000,output:stdout}));if(result.status!=='COMPLETED')process.exitCode=2;
}
main().catch(e=>{console.error('Diagnostic benchmark stopped:',e.code??e.name);process.exitCode=1;});
