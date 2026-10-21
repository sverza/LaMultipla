import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {researchDemoInput} from '../scripts/research-cycle.mjs';
import {createResearchPlan,researchCycleTick,builtInResearchHandlers} from '../scripts/lib/orchestration/research-cycle.mjs';
import {readSnapshot,envelope} from '../scripts/lib/prospective/store.mjs';
const clock=()=>new Date('2026-10-26T12:00:00.000Z');
async function sandbox(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-research-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('research dry-run completes, retains worse challenger, pairs identical events and is idempotent',async t=>{
 const directory=await sandbox(t),input=researchDemoInput(),before=JSON.stringify(input),handlers=builtInResearchHandlers();let calls=0;
 const original=handlers.capture_local;handlers.capture_local=ctx=>{calls++;return original(ctx);};
 const result=await researchCycleTick({directory,input,clock,handlers});
 assert.equal(result.state,'DRY_RUN_COMPLETE');assert.equal(calls,1);
 assert.equal(result.outputs.evaluate.markets.oneXTwo.n,10);
 assert.ok(result.outputs.evaluate.markets.oneXTwo.differenceFromReference.challenger_worse.logLoss>0);
 assert.equal(result.outputs.evaluate.markets.btts.n,10);assert.equal(result.outputs.review.negativeModelsRetained,true);
 assert.equal(result.outputs.refit_plan.trainingExecuted,false);assert.equal(result.outputs.next_ready.deliveries,0);
 assert.equal((await researchCycleTick({directory,input,clock,handlers})).state,'DRY_RUN_COMPLETE');assert.equal(calls,1);assert.equal(JSON.stringify(input),before);
});
test('research retries only explicit local failure and resumes completed stages after offline error',async t=>{
 const directory=await sandbox(t),input=researchDemoInput(),handlers=builtInResearchHandlers();let captures=0,evaluations=0;
 const capture=handlers.capture_local,evaluate=handlers.evaluate;
 handlers.capture_local=ctx=>{captures++;return capture(ctx);};
 handlers.evaluate=ctx=>{evaluations++;if(evaluations===1)throw Object.assign(Error('synthetic offline'),{localRetryable:true});return evaluate(ctx);};
 assert.equal((await researchCycleTick({directory,input,clock,handlers})).state,'LOCAL_FAILURE_RETRYABLE');
 assert.equal((await researchCycleTick({directory,input,clock,handlers})).state,'LOCAL_FAILURE_RETRYABLE');assert.equal(evaluations,1);
 const recovered=await researchCycleTick({directory,input,clock,handlers,resumeRetryable:true});
 assert.equal(recovered.state,'DRY_RUN_COMPLETE');assert.equal(captures,1);assert.equal(evaluations,2);
});
test('research ambiguous interrupted stage never retries, even with explicit local retry',async t=>{
 const directory=await sandbox(t),handlers=builtInResearchHandlers();let calls=0;
 handlers.capture_local=()=>{calls++;throw Object.assign(Error('unknown outcome'),{ambiguous:true});};
 for(let i=0;i<2;i++)assert.equal((await researchCycleTick({directory,input:researchDemoInput(),clock,handlers,resumeRetryable:true})).state,'AMBIGUOUS_STAGE_REQUIRES_REVIEW');
 assert.equal(calls,1);
});
test('research conflicts, removal, duplicates and changed kickoff stay withheld including restart',async t=>{
 for(const type of ['revision','removal','duplicate','kickoff']){
  const directory=await sandbox(t),input=researchDemoInput();input.previousObservation=structuredClone(input.observation);
  input.previousObservation.acquiredAtUtc='2026-10-26T09:30:00.000Z';
  if(type==='revision')input.observation.rows[0].goals=[2,0];
  if(type==='removal')input.observation.rows.shift();
  if(type==='duplicate')input.observation.rows.push(structuredClone(input.observation.rows[0]));
  if(type==='kickoff')input.observation.rows[0].kickoffUtc='2026-10-23T19:45:00.000Z';
  const handlers=builtInResearchHandlers();handlers.dataset_version=()=>{throw Error('must not execute');};
  for(let i=0;i<2;i++){const result=await researchCycleTick({directory,input,clock,handlers});assert.equal(result.state,'SOURCE_CONFLICT_REQUIRES_REVIEW');assert.equal(result.outputs.dataset_version,undefined);}
 }
});
test('research missing results remain pending and missing forecasts are never recreated',async t=>{
 const input=researchDemoInput(),directory=await sandbox(t);input.observation.rows.pop();input.forecasts.entries.shift();
 const result=await researchCycleTick({directory,input,clock});
 assert.equal(result.state,'DRY_RUN_COMPLETE');assert.equal(result.outputs.evaluate.markets.oneXTwo.n,8);
 assert.ok(result.outputs.evaluate.excluded.some(r=>r.reason==='FORECAST_MISSING_NOT_RECREATED'));
 assert.ok(result.outputs.evaluate.excluded.some(r=>r.reason==='RESULT_PENDING_OR_WITHHELD'));
 assert.equal(result.outputs.next_ready.events[0].state,'PAST_NO_RETROACTIVE_FORECAST');
});
test('research permits normal pending-to-final transition but rejects a resealed mismatched intent',async t=>{
 const directory=await sandbox(t),input=researchDemoInput();input.previousObservation=structuredClone(input.observation);
 input.previousObservation.acquiredAtUtc='2026-10-26T09:30:00.000Z';
 input.previousObservation.rows[0].status='SCHEDULED';input.previousObservation.rows[0].regularTime=false;input.previousObservation.rows[0].goals=null;
 const result=await researchCycleTick({directory,input,clock});assert.equal(result.state,'DRY_RUN_COMPLETE');
 const file=path.join(result.directory,'quality','0001','intent.json'),intent=await readSnapshot(file);intent.inputSha256='0'.repeat(64);
 await fs.writeFile(file,JSON.stringify(envelope(intent)));
 await assert.rejects(researchCycleTick({directory,input,clock}),/CHECKPOINT_BINDING_INVALID/);
});
test('research rejects retrospective forecasts, future observations, malformed probabilities and unapproved real evaluation',async t=>{
 for(const type of ['late','probability']){
  const input=researchDemoInput(),directory=await sandbox(t);
  if(type==='late')input.forecasts.entries[0].generatedAtUtc=input.manifest.events[0].kickoffUtc;
  else input.forecasts.entries[0].probabilities.reference.oneXTwo=[.9,.9,.9];
  const result=await researchCycleTick({directory,input,clock});assert.equal(result.state,'LOCAL_FAILURE_REQUIRES_REVIEW');assert.equal(result.stage,'evaluate');
 }
 const input=researchDemoInput();input.observation.acquiredAtUtc='2026-10-27T12:00:00.000Z';
 assert.throws(()=>createResearchPlan(input,{now:clock()}),/OBSERVATION_INVALID/);
 const local=researchDemoInput();local.mode='local-only';
 const result=await researchCycleTick({directory:await sandbox(t),input:local,clock});assert.equal(result.outputs.evaluate.state,'REAL_EVALUATION_REQUIRES_APPROVED_PROTOCOL');
});
test('research preserves distinct source versions, exact UTC kickoff across DST and fixed refit policy',async t=>{
 const directory=await sandbox(t),input=researchDemoInput();input.refitPolicy={id:'registered-synthetic-policy',kind:'registered-refit'};
 const first=await researchCycleTick({directory,input,clock});
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 assert.equal(fmt.format(new Date(first.outputs.next_ready.events[0].kickoffUtc)),'20:45');
 assert.equal(fmt.format(new Date(first.outputs.next_ready.events[9].kickoffUtc)),'20:45');
 assert.notEqual(input.manifest.events[0].kickoffUtc.slice(11,16),input.manifest.events[9].kickoffUtc.slice(11,16));
 input.observation.acquiredAtUtc='2026-10-26T11:00:00.000Z';const second=await researchCycleTick({directory,input,clock});
 assert.notEqual(first.cycleId,second.cycleId);assert.equal(second.outputs.refit_plan.state,'PREPARED_NOT_EXECUTED');assert.equal(second.outputs.refit_plan.trainingExecuted,false);
 assert.equal((await fs.readdir(directory)).filter(n=>n!=='locks').length,2);
});
test('research checkpoint namespace includes handler identity and explicit retry boolean',async t=>{
 const directory=await sandbox(t),input=researchDemoInput(),first=await researchCycleTick({directory,input,clock});
 const handlers=builtInResearchHandlers();const capture=handlers.capture_local;handlers.capture_local=ctx=>({...capture(ctx),adapterTestRevision:2});
 const second=await researchCycleTick({directory,input,clock,handlers});assert.notEqual(first.cycleId,second.cycleId);
 assert.equal(second.outputs.capture_local.adapterTestRevision,2);
 const plan=await readSnapshot(path.join(second.directory,'plan.json'));assert.match(plan.adapterIdentity.codeSha256,/^[a-f0-9]{64}$/);assert.match(plan.adapterIdentity.handlersSha256,/^[a-f0-9]{64}$/);
 await assert.rejects(researchCycleTick({directory,input,clock,resumeRetryable:'true'}),/RESEARCH_RETRY_FLAG_INVALID/);
});
test('research CLI rejects live, URLs, credentials and arbitrary paths before creating outputs',()=>{
 for(const args of [['--live'],['--demo','--dry-run','--url','https://example.invalid'],['--demo','--dry-run','--key','secret'],['--demo','--dry-run','--directory','C:/LaMultipla']]){
  const result=spawnSync(process.execPath,['scripts/research-cycle.mjs',...args],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.doesNotMatch(result.stderr,/secret/);
 }
});
