// SYNTHETIC ONLY: injected stages/transport, no provider requests or task registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {analysisAndDeliveryTick} from '../scripts/lib/orchestration/analysis-delivery-runner.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
import {loadJson} from '../scripts/lib/private-store.mjs';
import {windowsTaskXml} from '../scripts/prepare-windows-task.mjs';

const plan={purpose:'SYNTHETIC_TEST_ONLY',round:{season:'2026/27',matchday:7}};
async function setup(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-analysis-delivery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const counts={load:0,analysis:0,pump:0};
  return {root,filename:path.join(root,'.local/SYNTHETIC-plan.json'),clock:()=>new Date('2026-10-13T00:00:00.000Z'),counts,
    loadPlan:async()=>{counts.load++;return structuredClone(plan);},makeAdapters:()=>({purpose:'SYNTHETIC_ADAPTERS'}),
    runAnalysis:async()=>{counts.analysis++;return {state:'waiting_window',actualStakeEUR:0};},
    pump:async options=>{counts.pump++;assert.equal(options.channel,'shadow');return {state:'acknowledged',acknowledged:1,pending:0};}};
}
test('missing private plan still recovers shadow delivery and persists only redacted diagnostics',async t=>{
  const s=await setup(t);s.loadPlan=async()=>{throw Object.assign(new Error('SYNTHETIC_TOKEN and private path'),{code:'ENOENT'});};
  const result=await analysisAndDeliveryTick(s);assert.equal(result.analysis.reason,'PRIVATE_INPUT_MISSING');assert.equal(result.delivery.acknowledged,1);
  assert.equal(result.diagnosticSaved,true);assert.equal(s.counts.analysis,0);assert.equal(s.counts.pump,1);
  const state=await fs.readFile(path.join(s.root,'.local/orchestrator/runner-state.private.json'),'utf8');assert.doesNotMatch(state,/SYNTHETIC_TOKEN|private path|filename/);
});
test('analysis replay rejection does not block pending transport or leak its error',async t=>{
  const s=await setup(t);s.runAnalysis=async()=>{throw new Error('ANALYSIS_RECEIPT_INVALID');};
  const result=await analysisAndDeliveryTick(s);assert.equal(result.analysis.reason,'ANALYSIS_RECEIPT_INVALID');assert.equal(s.counts.pump,1);
  s.runAnalysis=async()=>{throw new Error('SYNTHETIC_PASSWORD');};
  assert.equal((await analysisAndDeliveryTick(s)).analysis.reason,'ANALYSIS_RUN_REJECTED');
  const state=await loadJson(path.join(s.root,'.local/orchestrator/runner-state.private.json'));assert.doesNotMatch(JSON.stringify(state),/SYNTHETIC_PASSWORD/);
});
test('prepared task pins complete admitted plan; changed input prevents producers but still delivers',async t=>{
  const s=await setup(t);s.makeAdapters=()=>assert.fail('No producers before plan pin verification');
  const result=await analysisAndDeliveryTick({...s,expectedPlanSha256:'a'.repeat(64)});
  assert.equal(result.analysis.reason,'ANALYSIS_PLAN_PIN_MISMATCH');assert.equal(s.counts.analysis,0);assert.equal(s.counts.pump,1);
});
test('matching plan executes existing analysis once and keeps window/review states distinct from NO BET',async t=>{
  const s=await setup(t);
  assert.equal((await analysisAndDeliveryTick({...s,expectedPlanSha256:digest(plan)})).analysis.state,'waiting_window');
  s.runAnalysis=async()=>({state:'review_required',reason:'QUOTE_ATTEMPT_INTERRUPTED'});
  const result=await analysisAndDeliveryTick({...s,expectedPlanSha256:digest(plan)});
  assert.equal(result.analysis.state,'review_required');assert.equal(result.delivery.pending,0);assert.equal(result.actualStakeEUR,0);assert.equal(result.tasksRegistered,false);
  assert.equal(s.counts.analysis,1);assert.equal(s.counts.pump,2);assert.equal('decision' in result,false);
});
test('transport failure is independent from a committed analysis and is never represented as ACK',async t=>{
  const s=await setup(t);s.runAnalysis=async()=>({state:'queued'});s.pump=async()=>{throw new Error('SYNTHETIC_PRIVATE_CONNECTION_DETAILS');};
  const result=await analysisAndDeliveryTick(s);assert.equal(result.analysis.state,'queued');assert.equal(result.delivery.state,'blocked');
  assert.equal(result.delivery.reason,'PRIVATE_DELIVERY_RUN_REJECTED');assert.equal('acknowledged' in result.delivery,false);
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE_CONNECTION_DETAILS/);
});
test('diagnostic write failure cannot prevent an already attempted delivery',async t=>{
  const s=await setup(t);s.saveState=async()=>{throw new Error('SYNTHETIC disk failure');};
  const result=await analysisAndDeliveryTick(s);assert.equal(result.delivery.acknowledged,1);assert.equal(result.diagnosticSaved,false);assert.equal(s.counts.pump,1);
});
test('Windows analysis XML is disabled, pins private plan, resumes at login and repeats while PC is on',()=>{
  const base={root:'C:\\Private & Test',nodePath:'C:\\Program Files\\nodejs\\node.exe',userSid:'S-1-5-21-111-222-333-1001',startAtUtc:'2026-10-13T00:00:00.000Z'};
  const analysisPlan='C:\\Private & Test\\.local\\plans\\SYNTHETIC plan.json',planSha256='b'.repeat(64);
  const xml=windowsTaskXml({...base,analysisPlan,planSha256});
  assert.match(xml,/--analysis-once &quot;C:\\Private &amp; Test\\.local\\plans\\SYNTHETIC plan.json&quot; --plan-sha256 b{64}/);
  assert.match(xml,/<Enabled>false<\/Enabled>/);assert.match(xml,/<LogonTrigger>/);assert.match(xml,/<Interval>PT5M<\/Interval>/);
  assert.match(xml,/<ExecutionTimeLimit>PT10M<\/ExecutionTimeLimit>/);assert.match(xml,/<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(xml,/<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);assert.doesNotMatch(xml,/--once|--live-odds|public\/latest-slip/);
  for(const bad of [{analysisPlan},{planSha256},{analysisPlan:'C:\\Public\\plan.json',planSha256},
    {analysisPlan:'C:\\Private & Test\\.local\\..\\public\\plan.json',planSha256},
    {analysisPlan:'C:\\Private & Test\\.local\\plan" --unsafe',planSha256},{analysisPlan,planSha256:'bad'}])assert.throws(()=>windowsTaskXml({...base,...bad}));
});
