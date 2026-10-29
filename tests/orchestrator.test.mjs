import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {deliveryPump} from '../scripts/lib/orchestration/delivery-pump.mjs';
import {deliveryPumpSelftest} from '../scripts/lib/orchestration/selftest.mjs';
import {writeExclusive} from '../scripts/lib/prospective/store.mjs';
import {saveJson,loadJson} from '../scripts/lib/private-store.mjs';
import {windowsTaskXml} from '../scripts/prepare-windows-task.mjs';
async function setup(t,count=1){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-pump-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(let n=1;n<=count;n++)await writeExclusive(path.join(root,'.local/private-delivery/outbox',String(n).padStart(12,'0')+'.json'),{purpose:'SYNTHETIC_ADAPTER_ONLY',sequence:n});
  return {root,clock:()=>new Date('2026-10-13T00:00:00.000Z')};}
test('pump repairs durable receipt after interrupted state write without a second network flush',async t=>{
  const s=await setup(t);let calls=0;const args={...s,flush:async()=>{calls++;return {acknowledged:1,pending:0};},afterReceipt:async()=>{throw new Error('SYNTHETIC crash');}};
  assert.equal((await deliveryPump(args)).state,'retry_required');
  const recovered=await deliveryPump(args);assert.equal(recovered.acknowledged,1);assert.equal(recovered.networkAttempted,false);assert.equal(calls,1);
});
test('pending ACK and network failure use bounded persisted backoff across instances',async t=>{
  const s=await setup(t);let at=Date.parse(s.clock()),calls=0;const args={...s,clock:()=>new Date(at),flush:async()=>{calls++;throw new Error('SYNTHETIC_SECRET');}};
  const first=await deliveryPump(args);assert.equal(first.state,'retry_required');assert.equal(Date.parse(first.nextAttemptAtUtc)-at,5*60000);
  assert.equal((await deliveryPump(args)).networkAttempted,false);assert.equal(calls,1);
  at+=5*60000;const next=await deliveryPump(args);assert.equal(Date.parse(next.nextAttemptAtUtc)-at,10*60000);
  const state=await fs.readFile(path.join(s.root,'.local/orchestrator/delivery-state.private.json'),'utf8');assert.doesNotMatch(state,/SYNTHETIC_SECRET/);
});
test('pump handles interrupted in-flight intent idempotently and refuses simultaneous runs',async t=>{
  const s=await setup(t);const file=path.join(s.root,'.local/orchestrator/delivery-state.private.json');
  await saveJson(file,{schema:'lamultipla-delivery-pump-state-v1',acknowledged:0,failures:0,lastObservedAtUtc:s.clock().toISOString(),nextAttemptAtUtc:'2026-10-13T00:30:00.000Z',inFlight:true});
  let finish;const first=deliveryPump({...s,flush:()=>new Promise(resolve=>{finish=resolve;})});
  while(!finish)await new Promise(resolve=>setTimeout(resolve,5));
  await assert.rejects(deliveryPump({...s,flush:async()=>assert.fail()}),/già in esecuzione/);
  finish({acknowledged:1,pending:0});assert.equal((await first).acknowledged,1);
});
test('idle acknowledged outbox makes no further network requests, new delivery wakes pump',async t=>{
  const s=await setup(t);let calls=0;
  await deliveryPump({...s,flush:async()=>{calls++;return {acknowledged:1,pending:0};}});
  await deliveryPump({...s,flush:async()=>assert.fail()});
  await writeExclusive(path.join(s.root,'.local/private-delivery/outbox/000000000002.json'),{purpose:'SYNTHETIC_ADAPTER_ONLY',sequence:2});
  assert.equal((await deliveryPump({...s,flush:async()=>{calls++;return {acknowledged:2,pending:0};}})).acknowledged,2);assert.equal(calls,2);
});
test('invalid flush, future/rollback clock, missing receipt and gapped outbox fail closed',async t=>{
  const s=await setup(t),file=path.join(s.root,'.local/orchestrator/delivery-state.private.json');
  assert.equal((await deliveryPump({...s,flush:async()=>({acknowledged:2,pending:0})})).state,'retry_required');
  let state=await loadJson(file);await saveJson(file,{...state,lastObservedAtUtc:'2026-10-13T00:01:00.000Z'});
  await assert.rejects(deliveryPump(s),/CLOCK_ROLLBACK/);
  state={...state,acknowledged:1,nextAttemptAtUtc:null};await saveJson(file,state);
  await assert.rejects(deliveryPump(s),/RECEIPT_MISSING/);
  await fs.rename(path.join(s.root,'.local/private-delivery/outbox/000000000001.json'),path.join(s.root,'.local/private-delivery/outbox/000000000002.json'));
  await assert.rejects(deliveryPump(s),/OUTBOX_GAP/);
});
test('empty pump and portable Windows self-test never access real vault, cloud or jobs',async t=>{
  const s=await setup(t,0);assert.equal((await deliveryPump({...s,flush:async()=>assert.fail()})).state,'idle');
  const result=await deliveryPumpSelftest(s.root);assert.equal(result.networkRequests,0);assert.equal(result.tasksRegistered,false);assert.equal(result.durableReceiptRecovery,true);
});
test('Windows preparation uses disabled least-privilege task, login and periodic checks, escaped paths',()=>{
  const xml=windowsTaskXml({root:'C:\\Private & Test',nodePath:'C:\\Program Files\\nodejs\\node.exe',userSid:'S-1-5-21-111-222-333-1001',startAtUtc:'2026-10-13T00:00:00.000Z'});
  assert.match(xml,/^<Task /);assert.doesNotMatch(xml,/<\?xml|encoding=/);
  assert.match(xml,/<LogonTrigger>/);assert.match(xml,/<TimeTrigger>/);assert.match(xml,/<Interval>PT5M<\/Interval>/);
  assert.match(xml,/<Enabled>false<\/Enabled>/);assert.match(xml,/<LogonType>InteractiveToken<\/LogonType>/);assert.match(xml,/<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(xml,/Private &amp; Test/);assert.match(xml,/windows-orchestrator\.mjs&quot; --once/);assert.doesNotMatch(xml,/Password|HighestAvailable|BootTrigger|--live-odds/);
  for(const root of ['relative','C:\\x" --unsafe','C:\\x\n'])assert.throws(()=>windowsTaskXml({root,nodePath:'C:\\node.exe',userSid:'S-1-5-21-1-2-3-4'}));
});

test('Windows validator normalizes only in memory and uses validate-only on native XML',async()=>{
  const script=await fs.readFile(new URL('../scripts/validate-windows-task.ps1',import.meta.url),'utf8');
  assert.match(script,/NewTask\(0\)/);assert.match(script,/\$nativeDefinition\.XmlText = \$comText/);
  assert.match(script,/RegisterTask\(\$name, \$nativeXml, 1, \$null, \$null, 3, \$null\)/);
  assert.match(script,/ValidateSet\('Delivery', 'Analysis', 'Progressive'\)/);
  assert.match(script,/--config-sha256 \[a-f0-9\]\{64\}/);
  assert.match(script,/--plan-sha256 \[a-f0-9\]\{64\}/);
  assert.doesNotMatch(script,/Register-ScheduledTask|Set-Content|WriteAllText|Out-File|\.DeleteTask\(/);
});
