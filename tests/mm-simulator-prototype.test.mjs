import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {syntheticPrototypeFixture} from './fixtures/mm-prototype.mjs';
import {forceMutualWithdrawal} from './fixtures/lock-failfast-schedule.mjs';
import {PROTOTYPE_POLICY,PROTOTYPE_POLICY_SHA256} from '../scripts/lib/mm-simulator-v1/prototype-policy.mjs';
import {discoverPrototype} from '../scripts/lib/mm-simulator-v1/prototype-analysis.mjs';
import {runSyntheticPrototype,verifySyntheticPrototype,prototypeAuthorityPath} from '../scripts/lib/mm-simulator-v1/prototype-store.mjs';
import {hashValue,hashBytes} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
import {readSnapshot,envelope} from '../scripts/lib/prospective/store.mjs';

const at='2026-10-16T12:50:00.000Z',clock=()=>at;
const childFile=fileURLToPath(new URL('./fixtures/mm-prototype-child.mjs',import.meta.url));
async function rootFor(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-mm-prototype-'));t.after(async()=>{
 const real=await fs.realpath(root),base=await fs.realpath(os.tmpdir());assert.ok(real.startsWith(base+path.sep));await fs.rm(real,{recursive:true,force:true});});return root;}
async function inventory(root){const out={};async function visit(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const f=path.join(dir,e.name);if(e.isDirectory())await visit(f);else{const b=await fs.readFile(f),s=await fs.stat(f);out[path.relative(root,f)]={sha256:hashBytes(b),mtime:s.mtimeMs};}}}await visit(root);return out;}
function spawn(root,inputFile,{time=at,stop='NONE',barrier='NONE'}={}){
 const child=fork(childFile,[root,inputFile,time,stop,barrier],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 const messages=[];let stderr='';child.stderr.on('data',b=>{stderr+=b.toString();});child.stdout.resume();child.on('message',m=>messages.push(m));
 const timeout=setTimeout(()=>child.kill(),25000);
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{clearTimeout(timeout);resolve({code,signal,messages,stderr});});});
 const message=predicate=>new Promise((resolve,reject)=>{const existing=messages.find(predicate);if(existing){resolve(existing);return;}
  const timer=setTimeout(()=>{child.off('message',listener);reject(Error('CHILD_MESSAGE_TIMEOUT'));},15000);
  function listener(m){if(predicate(m)){clearTimeout(timer);child.off('message',listener);resolve(m);}}child.on('message',listener);});
 return {child,done,message};
}
async function savedInput(root,input){const file=path.join(root,'SYNTHETIC-input.json');await fs.writeFile(file,JSON.stringify(input),{flag:'wx'});return file;}
const run=(root,input,extra={})=>runSyntheticPrototype({root,input,simulationClock:clock,...extra});

test('M3-B: registered synthetic policy, independent combined lower EV ranking, immutable chain and byte-identical replay',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture();f.input.data.ticketReviews[0].price=1.8;
 const original=hashValue(f.input),r=await run(root,f.input);assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED');
 assert.equal(r.decision.state,'SYNTHETIC_EXPLORATORY_SIMULATION_RECORDED');assert.equal(r.decision.selected.syntheticTicketPrice,1.8);
 assert.ok(r.decision.verifiedRanking.every((x,i,a)=>i===0||a[i-1].conditionalSyntheticNetPerUnitBounds[0]>=x.conditionalSyntheticNetPerUnitBounds[0]));
 assert.equal(r.decision.jointProbability,null);assert.equal(r.decision.jointConfidenceInterval,null);assert.equal(r.decision.actualStakeEUR,0);
 assert.equal(r.decision.operationallyApproved,false);assert.equal(r.decision.scientificallyValidated,false);assert.equal(r.decision.selected.actualTicketPrice,null);
 const before=await inventory(root),again=await run(root,f.input);assert.equal(again.replayed,true);assert.deepEqual(again.decision,r.decision);
 assert.deepEqual(await inventory(root),before);assert.equal(hashValue(f.input),original);
 assert.equal((await verifySyntheticPrototype({root,input:f.input})).receipt.bytesSha256,r.receipt.bytesSha256);
 const registry=await readSnapshot(path.join(r.directory,'policy.json'));assert.equal(registry.policySha256,PROTOTYPE_POLICY_SHA256);assert.equal(registry.policy.executionMode,'SYNTHETIC_ONLY');
 assert.equal(r.decision.counts.reviewSlots,4);assert.deepEqual(await fs.readdir(path.join(r.directory,'locks')),[]);
});
test('M3-B: crash before and after every critical phase recovers one authority without resetting review slots',async t=>{
 const f=await syntheticPrototypeFixture();
 const phases=['policy.json','intent.json','input.json','preview.json','review-01-claim.json','review-01-result.json','prepared.json','decision.json','commit-proof.json','receipt.json'];
 for(const phase of phases)for(const side of ['before:','after:']){
  const root=await rootFor(t),file=await savedInput(root,f.input),where=prototypeAuthorityPath(root,f.input);
  const actor=spawn(root,file,{stop:side+phase}),result=await actor.done;assert.equal(result.code,73,`${side}${phase}: ${result.stderr}`);
  const before=await inventory(where.directory),r=await run(root,f.input);assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED',side+phase);
  const after=await inventory(where.directory);for(const [name,meta] of Object.entries(before))if(!name.startsWith('locks'+path.sep))assert.deepEqual(after[name],meta,`existing ${side}${phase}: ${name}`);
  const names=await fs.readdir(r.directory);assert.equal(names.filter(n=>/^review-\d+-claim.json$/.test(n)).length,4);
  assert.equal((await readSnapshot(path.join(r.directory,'decision.json'))).selected.combinationId,r.decision.selected.combinationId);
 }
});
test('M3-B: two controlled BUSY rejections leave no intent, then explicit serialized recovery publishes exactly one decision',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture(),where=prototypeAuthorityPath(root,f.input);await fs.mkdir(where.directory,{recursive:true});
 const race=await forceMutualWithdrawal(where.directory,()=>run(root,f.input));
 assert.equal(race.results.filter(r=>r.status==='fulfilled').length,0);
 assert.ok(race.results.every(r=>r.status==='rejected'&&r.reason.message==='Produttore privato già in esecuzione'));
 assert.deepEqual(await fs.readdir(where.directory),['locks']);assert.deepEqual(await fs.readdir(path.join(where.directory,'locks')),[]);
 const r=await run(root,f.input);assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED');assert.equal((await run(root,f.input)).replayed,true);
 t.diagnostic(JSON.stringify({controlledBusy:2,finalDecisions:1}));
});
test('M3-B: separate processes cannot enter while owner holds lock; owner completes, loser retries only by explicit replay',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture(),file=await savedInput(root,f.input);
 const a=spawn(root,file,{barrier:'HOLD'});await a.message(m=>m.ready);a.child.send('GO');await a.message(m=>m.holding);
 const b=spawn(root,file),br=await b.done;assert.equal(br.code,1);assert.ok(br.messages.some(m=>m.error==='Produttore privato già in esecuzione'));
 const c=spawn(root,file),cr=await c.done;assert.equal(cr.code,1);assert.ok(cr.messages.some(m=>m.error==='Produttore privato già in esecuzione'));
 a.child.send('RELEASE');const ar=await a.done;assert.equal(ar.code,0,ar.stderr);assert.ok(ar.messages.some(m=>m.ok));
 const r=await run(root,f.input);assert.equal(r.replayed,true);assert.deepEqual(await fs.readdir(path.join(r.directory,'locks')),[]);
});
test('M3-B: altered input, policy, published artifacts and duplicate authority cannot overwrite a final',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture(),r=await run(root,f.input),before=await inventory(root);
 const changed=structuredClone(f.input);changed.data.ticketReviews[0].price=2;
 await assert.rejects(run(root,changed),/CONFLICT/);await assert.rejects(run(root,f.input,{policy:{...PROTOTYPE_POLICY,minPointEV:0}}),/POLICY_UNRECOGNIZED/);
 assert.deepEqual(await inventory(root),before);
 for(const name of ['input.json','preview.json','review-01-result.json','prepared.json','decision.json','commit-proof.json','receipt.json']){
  const file=path.join(r.directory,name),bytes=await fs.readFile(file),value=JSON.parse(bytes);value.payload.TAMPERED=true;await fs.writeFile(file,JSON.stringify(envelope(value.payload)));
  const altered=await fs.readFile(file);await assert.rejects(run(root,f.input),/ALTERED|MISMATCH|INVALID/);assert.ok(altered.equals(await fs.readFile(file)));await fs.writeFile(file,bytes);
 }
 assert.equal((await verifySyntheticPrototype({root,input:f.input})).state,'SYNTHETIC_FINAL_VERIFIED');
});
test('M3-B: truncated published file blocks; unpublished incomplete temporary is preserved during recovery',async t=>{
 for(const published of [true,false]){
  const root=await rootFor(t),f=await syntheticPrototypeFixture(),where=prototypeAuthorityPath(root,f.input);
  await assert.rejects(run(root,f.input,{onCheckpoint:stage=>{if(stage==='after:intent.json')throw Error('SYNTHETIC_STOP');}}),/SYNTHETIC_STOP/);
  const filename=path.join(where.directory,published?'input.json':'input.json.11111111-1111-4111-8111-111111111111.tmp');await fs.writeFile(filename,'{"unfinished":');
  if(published)await assert.rejects(run(root,f.input),/TRUNCATED_OR_INVALID/);else assert.equal((await run(root,f.input)).state,'SYNTHETIC_FINAL_VERIFIED');
  assert.equal(await fs.readFile(filename,'utf8'),'{"unfinished":');
 }
});
test('M3-B: final without commit proof cannot be recovered outside window; proven commit permits receipt-only recovery',async t=>{
 const f=await syntheticPrototypeFixture();
 for(const phase of ['decision.json','commit-proof.json']){
  const root=await rootFor(t),file=await savedInput(root,f.input),a=spawn(root,file,{stop:'after:'+phase});assert.equal((await a.done).code,73);
  const where=prototypeAuthorityPath(root,f.input),decisionBefore=await fs.readFile(path.join(where.directory,'decision.json'));
  if(phase==='decision.json')await assert.rejects(run(root,f.input,{simulationClock:()=> '2026-10-16T16:15:00.000Z'}),/WINDOW_CLOSED/);
  else{const r=await run(root,f.input,{simulationClock:()=> '2026-10-16T16:15:00.000Z'});assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED');assert.equal(r.recovered,true);}
  assert.ok(decisionBefore.equals(await fs.readFile(path.join(where.directory,'decision.json'))));
 }
});
test('M3-B: review budget is persisted once; unverified candidates and missing evidence remain explicitly incomplete',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture({activeFixtures:3});const r=await run(root,f.input);
 assert.equal(r.decision.state,'ANALYSIS_INCOMPLETE');assert.ok(r.decision.reasons.includes('REVIEW_BUDGET_EXHAUSTED'));assert.equal(r.decision.counts.reviewSlots,10);
 assert.equal(r.decision.selected,null);assert.equal(r.decision.globalNoBet,false);const before=await inventory(root);await run(root,f.input);assert.deepEqual(await inventory(root),before);
 for(const edit of [i=>{i.data.context=null;},i=>{i.data.ticketReviews=[];},i=>{i.data.selectionReviews=[];}]){
  const rroot=await rootFor(t),g=await syntheticPrototypeFixture();edit(g.input);const result=await run(rroot,g.input);
  assert.equal(result.decision.state,'ANALYSIS_INCOMPLETE');assert.equal(result.decision.selected,null);assert.equal(result.decision.globalNoBet,false);
 }
});
test('M3-B: marginal width is absolute probability width; central outside CI excludes without fallback',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture();
 for(const e of f.source.journal.entries)for(const m of Object.values(e.forecasts))m.bootstrapGrids=Array.from({length:40},()=>[[.15,0,0],[0,0,0],[0,0,.85]]);
 f.rebuild();const r=await run(root,f.input);assert.equal(r.decision.selected,null);assert.ok(r.decision.reasons.includes('MARGINAL_REVIEWS_INCOMPLETE'));
 assert.equal(PROTOTYPE_POLICY.maxIntervalWidth,.25);assert.equal(PROTOTYPE_POLICY.intervalWidthQuantity,'UPPER_MINUS_LOWER_DC_MARGINAL_PROBABILITY');
});
test('M3-B: incomplete boards, invalid forecasts and authentic mode cannot be promoted',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture();delete f.source.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes[105];f.rebuild();
 const r=await run(root,f.input);assert.equal(r.decision.state,'ANALYSIS_INCOMPLETE');assert.ok(r.decision.reasons.includes('INPUT_COVERAGE_INCOMPLETE'));
 const g=await syntheticPrototypeFixture();g.input.data.journal.sourceData='original_local';const untouched=await rootFor(t);
 await assert.rejects(run(untouched,g.input),/INPUT_INVALID/);assert.deepEqual(await fs.readdir(untouched),[]);
});
test('M3-B: input clock rollback, no active progressive slot and exact exclusive boundary preserve partial state',async t=>{
 const f=await syntheticPrototypeFixture();assert.throws(()=>discoverPrototype(f.input,'2026-10-16T12:44:59.999Z'),/INPUT_INVALID|WINDOW_CLOSED/);
 assert.throws(()=>discoverPrototype(f.input,'2026-10-16T16:15:00.000Z'),/WINDOW_CLOSED/);
 const root=await rootFor(t);await assert.rejects(run(root,f.input,{simulationClock:()=> '2026-10-16T12:49:00.000Z'}),/CLOCK_ROLLBACK/);
 assert.deepEqual(await fs.readdir(root),[]);
});
test('M3-B: full registered search ceiling truncates at 20000 terminal subsets and stays below 100000 nodes',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture({activeFixtures:10});
 const r=await run(root,f.input);assert.equal(r.decision.state,'ANALYSIS_INCOMPLETE');
 assert.ok(r.decision.reasons.includes('SEARCH_TRUNCATED'));assert.equal(r.decision.counts.examinedCombinations,20000);
 assert.ok(r.decision.counts.visitedNodes<=100000);assert.ok(r.decision.counts.reviewSlots<=10);assert.equal(r.decision.selected,null);
 t.diagnostic(JSON.stringify({examined:r.decision.counts.examinedCombinations,nodes:r.decision.counts.visitedNodes,reviewSlots:r.decision.counts.reviewSlots}));
});
test('M3-B: exact zero Frechet lower envelope stays zero, yields lower net -1 and never passes combined threshold',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture();
 for(const e of f.source.journal.entries)for(const m of Object.values(e.forecasts)){
  m.grid=[[.51,0,0],[0,0,0],[0,0,.49]];m.bootstrapGrids=Array.from({length:40},()=>[[.51,0,0],[0,0,0],[0,0,.49]]);}
 for(const event of f.source.raw)for(const [id,market] of Object.entries(event.bookmakerOdds['bet365.it'].markets)){
  if(['104','1010'].includes(id))market.outcomes[id].players[0].price=3;
 }
 f.rebuild();const r=await run(root,f.input);assert.equal(r.decision.state,'NO_COMBINATION_IN_REVIEWED_SYNTHETIC_SCOPE');
 assert.equal(r.decision.selected,null);assert.equal(r.decision.globalNoBet,false);assert.equal(r.decision.verifiedRanking.length,4);
 for(const x of r.decision.verifiedRanking){assert.equal(x.jointSensitivityEnvelope[0],0);assert.equal(x.conditionalSyntheticNetPerUnitBounds[0],-1);assert.equal(x.jointProbability,null);}
});
test('M3-B: denied decision publication preserves prepared state and allows an explicit same-input recovery',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture(),where=prototypeAuthorityPath(root,f.input),link=fs.link;
 try{
  fs.link=async(from,to)=>{if(to===path.join(where.directory,'decision.json'))throw Object.assign(Error('SYNTHETIC_PUBLICATION_DENIED'),{code:'EPERM'});return link(from,to);};
  await assert.rejects(run(root,f.input),{code:'EPERM'});
 }finally{fs.link=link;}
 await assert.rejects(fs.stat(path.join(where.directory,'decision.json')),{code:'ENOENT'});const prepared=await fs.readFile(path.join(where.directory,'prepared.json'));
 const r=await run(root,f.input);assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED');assert.ok(prepared.equals(await fs.readFile(path.join(where.directory,'prepared.json'))));
});
test('M3-B: cleanup failure after receipt is not success; inspect effects before explicit recovery',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture(),file=await savedInput(root,f.input),actor=spawn(root,file,{stop:'CLEANUP_FAILURE'});
 const result=await actor.done;assert.equal(result.code,1);assert.ok(result.messages.some(m=>m.errorName==='AggregateError'));
 const where=prototypeAuthorityPath(root,f.input),decision=await fs.readFile(path.join(where.directory,'decision.json')),receipt=await fs.readFile(path.join(where.directory,'receipt.json'));
 const r=await run(root,f.input);assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED');assert.equal(r.replayed,true);
 assert.ok(decision.equals(await fs.readFile(path.join(where.directory,'decision.json'))));assert.ok(receipt.equals(await fs.readFile(path.join(where.directory,'receipt.json'))));
});
test('M3-B: namespace junction is refused before creating anything in a foreign directory',async t=>{
 const root=await rootFor(t),foreign=await rootFor(t),f=await syntheticPrototypeFixture();await fs.symlink(foreign,path.join(root,'.local'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(run(root,f.input),/UNSAFE_NAMESPACE/);assert.deepEqual(await fs.readdir(foreign),[]);
});
test('M3-B: known closed complete boards permit a scoped absence, while extra review slots block recovery',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture({activeFixtures:0});const r=await run(root,f.input);
 assert.equal(r.decision.state,'NO_SYNTHETIC_COMBINATION_AVAILABLE');assert.equal(r.decision.counts.reviewSlots,0);assert.equal(r.decision.globalNoBet,false);
 const g=await syntheticPrototypeFixture(),groot=await rootFor(t),gr=await run(groot,g.input);
 const extra=path.join(gr.directory,'review-10-claim.json');await fs.writeFile(extra,JSON.stringify(envelope({synthetic:true,slot:10})),{flag:'wx'});
 await assert.rejects(run(groot,g.input),/REVIEW_LAYOUT_INVALID/);assert.equal((await readSnapshot(extra)).slot,10);
});
test('M3-B: finalized replay performs no filesystem mutations, including lock files and directory timestamps',async t=>{
 const root=await rootFor(t),f=await syntheticPrototypeFixture(),r=await run(root,f.input),before=await inventory(root);
 const dirs=[r.directory,path.join(r.directory,'locks')],mtimes=await Promise.all(dirs.map(d=>fs.stat(d).then(s=>s.mtimeMs)));
 const methods=['writeFile','open','mkdir','link','unlink','rename','rm'],saved=Object.fromEntries(methods.map(k=>[k,fs[k]]));
 try{for(const k of methods)fs[k]=()=>{throw Error('REPLAY_MUTATION:'+k);};const replay=await run(root,f.input);assert.equal(replay.replayed,true);}
 finally{for(const k of methods)fs[k]=saved[k];}
 assert.deepEqual(await inventory(root),before);assert.deepEqual(await Promise.all(dirs.map(d=>fs.stat(d).then(s=>s.mtimeMs))),mtimes);
});
