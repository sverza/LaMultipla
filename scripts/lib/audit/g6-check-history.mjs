import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,readSnapshot} from '../prospective/store.mjs';
import {GENERAL_POLICY} from '../decision/policy.mjs';
// Read completed records and their original links; never rescore, acquire or modify an observation.
export async function inspectG6CheckHistory(root,original,{now=new Date()}={}){
 if(!Number.isFinite(new Date(now).getTime()))throw Error('G6_HISTORY_CLOCK_INVALID');
 const directory=path.join(root,'.local/model/prospective/checks',original.journal.id),completed=[];let incomplete=0;
 const entries=await fs.readdir(directory,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 for(const entry of entries.filter(e=>e.isDirectory())){
  const dir=path.join(directory,entry.name);let record;
  try{record=await readSnapshot(path.join(dir,'check.json'));}catch(e){if(e.code==='ENOENT'){incomplete++;continue;}throw e;}
  if(record.schema!=='lamultipla-original-g6-check-v1'||record.journalSha256!==digest(original.journal)||record.baselineSha256!==digest(original.baseline)
   ||digest(record.originalFileHashes)!==digest(original.fileHashes)||record.originalForecastUnchanged!==true||record.supplementalSourceUsed!==false
   ||!Number.isFinite(Date.parse(record.startedAtUtc))||Date.parse(record.startedAtUtc)<Date.parse(GENERAL_POLICY.protectedPilot.evaluationFromUtc)
   ||!Number.isFinite(Date.parse(record.checkedAtUtc))||Date.parse(record.checkedAtUtc)<Date.parse(record.startedAtUtc)||Date.parse(record.checkedAtUtc)>new Date(now).getTime())throw Error('G6_HISTORY_RECORD_INVALID');
  if(record.resultsSha256){
   if(!/^[a-f0-9]{64}$/.test(record.resultsSha256))throw Error('G6_HISTORY_LINK_INVALID');
   const observation=await readSnapshot(path.join(dir,'results.json'));
   const evaluation=await readSnapshot(path.join(root,'.local/model/prospective/evaluations',original.journal.id,record.resultsSha256+'.json'));
   if(observation.source!=='openfootball/football.json'||observation.license!=='CC0-1.0'
    ||!Number.isFinite(Date.parse(observation.acquiredAtUtc))||Date.parse(observation.acquiredAtUtc)<Date.parse(record.startedAtUtc)||Date.parse(observation.acquiredAtUtc)>Date.parse(record.checkedAtUtc)
    ||digest(observation)!==record.resultsSha256||digest(evaluation)!==record.evaluationSha256||evaluation.journalSha256!==record.journalSha256
    ||evaluation.resultsSha256!==record.resultsSha256||evaluation.evaluatedAtUtc!==record.checkedAtUtc||digest(evaluation.counts)!==digest(record.counts)
    ||!['EVALUATED_WITH_PENDING','EVALUATED_AVAILABLE_RESULTS'].includes(record.status))throw Error('G6_HISTORY_LINK_INVALID');
  }else if(record.status!=='CHECK_RECORDED_SOURCE_UNAVAILABLE'||record.evaluationSha256!==null)throw Error('G6_HISTORY_SOURCE_FAILURE_INVALID');
  completed.push({record,file:path.join(dir,'check.json')});
 }
 completed.sort((a,b)=>a.record.checkedAtUtc.localeCompare(b.record.checkedAtUtc)||a.file.localeCompare(b.file));
 const latest=completed.at(-1);
 return {status:latest?.record.status??original.summary.status,recordingState:latest?'COMPLETED_CHECK_PRESENT':'NO_COMPLETED_CHECK',completedChecks:completed.length,incompleteIntents:incomplete,
  latestCheckAtUtc:latest?.record.checkedAtUtc??null,latestCheckFile:latest?.file??null,latestCounts:latest?.record.counts??null,readOnly:true,evaluationExecuted:false};
}
