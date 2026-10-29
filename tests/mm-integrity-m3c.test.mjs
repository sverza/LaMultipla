import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {syntheticPrototypeFixture} from './fixtures/mm-prototype.mjs';
import {hashValue,hashBytes} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
import {diagnoseProbabilityBoards} from '../scripts/lib/mm-simulator-v1/probabilities.mjs';
import {runSyntheticPrototype,verifySyntheticPrototype,prototypeAuthorityPath} from '../scripts/lib/mm-simulator-v1/prototype-store.mjs';
import {discoverPrototype} from '../scripts/lib/mm-simulator-v1/prototype-analysis.mjs';

const at='2026-10-16T12:50:00.000Z';
const run=(root,input,extra={})=>runSyntheticPrototype({root,input,simulationClock:()=>at,...extra});
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-m3c-'));t.after(async()=>{
 const real=await fs.realpath(root),base=await fs.realpath(os.tmpdir());assert.ok(real.startsWith(base+path.sep));await fs.rm(real,{recursive:true,force:true});});return root;}
async function files(root){const out={};async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else out[path.relative(root,f)]=hashBytes(await fs.readFile(f));}}await walk(root);return out;}
function rebind(f){const d=f.input.data,{canonicalSha256,...body}=d.boards;void canonicalSha256;d.boards.canonicalSha256=hashValue(body);
 d.diagnostic=diagnoseProbabilityBoards({boards:d.boards,journal:d.journal,study:d.study,freezeCompletedAtUtc:d.diagnostic.provenance.freezeCompletedAtUtc});
 d.calendar.diagnosticSha256=d.diagnostic.canonicalSha256;d.calendar.eventsSha256=hashValue(d.diagnostic.boardStates.filter((b,i,a)=>a.findIndex(x=>x.event.id===b.event.id)===i).map(b=>b.event));
 for(const r of d.selectionReviews){r.diagnosticSha256=d.diagnostic.canonicalSha256;const record=d.diagnostic.records.find(x=>x.quoteId===r.quoteId);if(record)r.recordSha256=hashValue(record);}
 for(const r of d.ticketReviews){r.diagnosticSha256=d.diagnostic.canonicalSha256;r.selectionReviewSha256=r.quoteIds.map(id=>hashValue(d.selectionReviews.find(x=>x.quoteId===id)));}
}
test('M3-C F1: ten expected fixtures, nine received and eighteen valid boards cannot disappear from coverage',async t=>{
 const f=await syntheticPrototypeFixture();f.input.data.boards.boards=f.input.data.boards.boards.filter(b=>b.event.id!=='synthetic-event-9');rebind(f);
 const r=await run(await temporary(t),f.input);t.diagnostic(JSON.stringify({state:r.decision.state,gaps:r.decision.counts.coverageGaps}));
 assert.equal(r.decision.state,'ANALYSIS_INCOMPLETE');assert.ok(r.decision.counts.coverageGaps>0);assert.equal(r.decision.universeCoverage.complete,false);
 assert.deepEqual(r.decision.universeCoverage.missingFixtureIds,['id9009']);assert.equal(r.decision.universeCoverage.expectedFixtures,10);assert.equal(r.decision.universeCoverage.receivedFixtures,9);
});
test('M3-C F1: complete universe separates closed boards from completeness and future admission',async t=>{
 const f=await syntheticPrototypeFixture(),r=await run(await temporary(t),f.input),u=r.decision.universeCoverage;
 assert.equal(u.complete,true);assert.equal(u.expectedFixtures,10);assert.equal(u.receivedFixtures,10);assert.equal(u.expectedBoards,20);
 assert.equal(r.decision.boardCoverage.completeBoards,20);assert.equal(r.decision.boardAvailability.closedBoards,16);assert.equal(r.decision.operationallyApproved,false);
});
test('M3-C F1: missing one family, unexpected fixture, declared reduced scope and changed home/away are detected',async t=>{
 for(const edit of [d=>{d.boards.boards=d.boards.boards.filter((_,i)=>i!==19);},
  d=>{for(const b of d.boards.boards.filter(b=>b.event.sourceEventId==='id9009')){b.event.sourceEventId='unexpected-fixture';b.provenance.sourceEventId='unexpected-fixture';}},
  d=>{d.boards.scope.eventCount=9;},d=>{const b=d.boards.boards[18];[b.event.home,b.event.away]=[b.event.away,b.event.home];}]){
  const f=await syntheticPrototypeFixture();edit(f.input.data);rebind(f);const r=await run(await temporary(t),f.input);
  assert.equal(r.decision.state,'ANALYSIS_INCOMPLETE');assert.equal(r.decision.universeCoverage.complete,false);assert.ok(r.decision.counts.coverageGaps>0);
 }
});
test('M3-C F1: duplicate fixture/family with distinct board id does not replace the expected board',async t=>{
 const f=await syntheticPrototypeFixture(),d=f.input.data;d.boards.boards[19]=structuredClone(d.boards.boards[18]);d.boards.boards[19].id='SYNTHETIC-duplicate-board';rebind(f);
 const r=await run(await temporary(t),f.input);assert.equal(r.decision.state,'ANALYSIS_INCOMPLETE');assert.equal(r.decision.universeCoverage.complete,false);
 assert.ok(r.decision.universeCoverage.duplicateBoardKeys.length>0);
});
test('M3-C F2: runner and standalone verifier reject a namespace junction identically',async t=>{
 const a=await temporary(t),b=await temporary(t),f=await syntheticPrototypeFixture();await run(a,f.input);await fs.mkdir(path.join(b,'.local'));
 await fs.symlink(path.join(a,'.local','mm-simulator-synthetic-v1'),path.join(b,'.local','mm-simulator-synthetic-v1'),process.platform==='win32'?'junction':'dir');
 const before=await files(a);await assert.rejects(verifySyntheticPrototype({root:b,input:f.input}),/UNSAFE_NAMESPACE/);await assert.rejects(run(b,f.input),/UNSAFE_NAMESPACE/);assert.deepEqual(await files(a),before);
});
test('M3-C F3: pending intent plus backward clock creates no new files, including input or preview',async t=>{
 const root=await temporary(t),f=await syntheticPrototypeFixture();await assert.rejects(run(root,f.input,{onCheckpoint:s=>{if(s==='after:intent.json')throw Error('SYNTHETIC_CRASH');}}),/SYNTHETIC_CRASH/);
 const before=await files(root);await assert.rejects(run(root,f.input,{simulationClock:()=> '2026-10-16T12:49:00.000Z'}),/CLOCK_ROLLBACK/);assert.deepEqual(await files(root),before);
});
test('M3-C F3: invalid initial clock or closed future window creates no policy, intent, input or lock',async t=>{
 const f=await syntheticPrototypeFixture();for(const now of ['invalid','2026-10-16T12:49:00.000Z','2026-10-16T16:15:00.000Z']){
  const root=await temporary(t);await assert.rejects(run(root,f.input,{simulationClock:()=>now}),/CLOCK|WINDOW/);assert.deepEqual(await fs.readdir(root),[]);
 }
});
test('M3-C F4: actual context reasons arrive at final quote diagnostics in stable order',async t=>{
 const f=await syntheticPrototypeFixture();f.input.data.context=null;const r=await run(await temporary(t),f.input);
 assert.equal(r.decision.state,'ANALYSIS_INCOMPLETE');assert.ok(r.decision.selectionDiagnostics.some(d=>d.reasons.includes('CONTEXT_REVIEW_REQUIRED')));
 for(const d of r.decision.selectionDiagnostics)assert.deepEqual(d.reasons,[...new Set(d.reasons)].sort());
});
test('M3-C F4: complete closed boards have no spurious incomplete-or-invalid reason',async()=>{
 const f=await syntheticPrototypeFixture(),a=discoverPrototype(f.input,at);
 const closed=f.input.data.boards.boards.filter(b=>b.availability.state==='CLOSED');assert.ok(closed.length);
 for(const b of closed)for(const e of a.discovery.exclusions.filter(e=>e.boardId===b.id)){
  assert.ok(e.reasons.includes('SOURCE_UNAVAILABLE'));assert.ok(!e.reasons.includes('BOARD_INCOMPLETE_OR_INVALID'));
 }
});
test('M3-C F4: comparator AVAILABLE, ABSENT and INVALID are explicit, without primary fallback',async t=>{
 for(const mode of ['AVAILABLE','ABSENT','INVALID']){
  const f=await syntheticPrototypeFixture();if(mode==='ABSENT')for(const e of f.source.journal.entries)delete e.forecasts.bivariate;
  if(mode==='INVALID')for(const e of f.source.journal.entries)e.forecasts.bivariate.grid=[[.2]];
  f.rebuild();const r=await run(await temporary(t),f.input);assert.ok(r.decision.comparatorDiagnostics.every(d=>d.state===mode));
  assert.equal(r.decision.state,'SYNTHETIC_EXPLORATORY_SIMULATION_RECORDED');assert.equal(r.decision.source.provenance.modelVersion,'goals-engine-v2');
 }
});
test('M3-C F1: inconsistent authoritative manifest cannot authorize a reduced universe',async()=>{
 const f=await syntheticPrototypeFixture();f.input.data.journal.manifest.events.pop();
 assert.throws(()=>diagnoseProbabilityBoards({boards:f.input.data.boards,journal:f.input.data.journal,study:f.input.data.study}),/journal\/study mismatch|schedule|manifest/i);
 const g=await syntheticPrototypeFixture();g.input.data.journal.manifest.events[1].fixtureId=g.input.data.journal.manifest.events[0].fixtureId;
 g.input.data.journal.manifestSha256=hashValue(g.input.data.journal.manifest);
 assert.throws(()=>diagnoseProbabilityBoards({boards:g.input.data.boards,journal:g.input.data.journal,study:g.input.data.study}),/schedule|fixture|manifest/i);
});
test('M3-C F2: multiple junctions at parent or authority level never grant a foreign namespace',async t=>{
 const target=await temporary(t),f=await syntheticPrototypeFixture(),r=await run(target,f.input),before=await files(target);
 for(const level of ['parent','authority','chain']){
  const root=await temporary(t),where=prototypeAuthorityPath(root,f.input);
  if(level==='parent')await fs.symlink(path.join(target,'.local'),path.join(root,'.local'),process.platform==='win32'?'junction':'dir');
  else if(level==='authority'){
   await fs.mkdir(path.dirname(where.directory),{recursive:true});await fs.symlink(r.directory,where.directory,process.platform==='win32'?'junction':'dir');
  }else{
   const middle=await temporary(t);await fs.symlink(path.join(target,'.local'),path.join(middle,'linked'),process.platform==='win32'?'junction':'dir');
   await fs.symlink(path.join(middle,'linked'),path.join(root,'.local'),process.platform==='win32'?'junction':'dir');
  }
  await assert.rejects(run(root,f.input),/UNSAFE_NAMESPACE/);await assert.rejects(verifySyntheticPrototype({root,input:f.input}),/UNSAFE_NAMESPACE/);
 }
 assert.deepEqual(await files(target),before);
});
test('M3-C F2: ordinary canonical namespace and finalized replay remain valid',async t=>{
 const root=await temporary(t),f=await syntheticPrototypeFixture(),r=await run(root,f.input),before=await files(root);
 const canonical=path.resolve(root,'placeholder','..');const v=await verifySyntheticPrototype({root:canonical,input:f.input});
 assert.equal(v.state,'SYNTHETIC_FINAL_VERIFIED');assert.deepEqual(v.decision,r.decision);assert.equal((await run(canonical,f.input)).replayed,true);assert.deepEqual(await files(root),before);
});
test('M3-C F3: recovery at input, preview and review claim stops before any new files on backward or expired clock',async t=>{
 const f=await syntheticPrototypeFixture();
 for(const stage of ['input.json','preview.json','review-01-claim.json'])for(const now of ['2026-10-16T12:49:00.000Z','2026-10-16T16:15:00.000Z']){
  const root=await temporary(t);await assert.rejects(run(root,f.input,{onCheckpoint:s=>{if(s==='after:'+stage)throw Error('SYNTHETIC_CRASH');}}),/SYNTHETIC_CRASH/);
  const before=await files(root);await assert.rejects(run(root,f.input,{simulationClock:()=>now}),/CLOCK|WINDOW/);assert.deepEqual(await files(root),before);
 }
});
test('M3-C F3: future evidence, stale quotes and a backward clock introduced by a pre-publication hook have no new artifacts',async t=>{
 const f=await syntheticPrototypeFixture();
 const root=await temporary(t);await assert.rejects(run(root,f.input,{simulationClock:()=> '2026-10-16T13:19:00.000Z'}),/QUOTES_EXPIRED/);assert.deepEqual(await fs.readdir(root),[]);
 const g=await syntheticPrototypeFixture();g.input.data.atUtc='2026-10-16T12:48:00.000Z';const futureRoot=await temporary(t);
 await assert.rejects(run(futureRoot,g.input,{simulationClock:()=> '2026-10-16T12:49:00.000Z'}),/EVIDENCE_AFTER_CLOCK/);assert.deepEqual(await fs.readdir(futureRoot),[]);
 let now=at;const hookRoot=await temporary(t);
 await assert.rejects(run(hookRoot,f.input,{simulationClock:()=>now,onCheckpoint:s=>{if(s==='before:input.json')now='2026-10-16T12:49:00.000Z';}}),/CLOCK_ROLLBACK/);
 const authority=prototypeAuthorityPath(hookRoot,f.input).directory;assert.deepEqual((await fs.readdir(authority)).filter(n=>n!=='locks').sort(),['intent.json','policy.json']);
});
test('M3-C F3: legitimate forward-time recovery reuses prior claims without modifying immutable files',async t=>{
 const root=await temporary(t),f=await syntheticPrototypeFixture();await assert.rejects(run(root,f.input,{onCheckpoint:s=>{if(s==='after:review-01-result.json')throw Error('SYNTHETIC_CRASH');}}),/SYNTHETIC_CRASH/);
 const before=await files(root),r=await run(root,f.input,{simulationClock:()=> '2026-10-16T12:51:00.000Z'});assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED');
 const after=await files(root);for(const [file,sha]of Object.entries(before))assert.equal(after[file],sha);
 assert.equal(r.decision.counts.reviewSlots,4);assert.equal((await run(root,f.input,{simulationClock:()=> '2026-10-16T16:15:00.000Z'})).replayed,true);
});
test('M3-C F4: v2 result preserves individual exclusions, keeps economic rejection distinct and is deterministic',async t=>{
 const root=await temporary(t),f=await syntheticPrototypeFixture();f.input.data.context=null;const r=await run(root,f.input);
 assert.equal(r.decision.schema,'lamultipla-mm-synthetic-prototype-decision-v2');assert.ok(r.decision.exclusions.some(e=>e.reasons.includes('CONTEXT_REVIEW_REQUIRED')));
 const before=await files(root);assert.deepEqual((await run(root,f.input)).decision,r.decision);assert.deepEqual(await files(root),before);
 assert.equal(r.decision.futureAdmission.state,'NOT_AUTHORIZED');
 const g=await syntheticPrototypeFixture(),a=discoverPrototype(g.input,at);assert.ok(a.discovery.selectionDiagnostics.some(d=>d.gateState==='CRITERIA_NOT_MET'));
});
test('M3-C F3: receipt-only recovery allows expired window but never an invalid or backward clock',async t=>{
 const root=await temporary(t),f=await syntheticPrototypeFixture();await assert.rejects(run(root,f.input,{onCheckpoint:s=>{if(s==='after:commit-proof.json')throw Error('SYNTHETIC_CRASH');}}),/SYNTHETIC_CRASH/);
 const before=await files(root);
 for(const now of ['invalid','2026-10-16T12:49:00.000Z']){
  await assert.rejects(run(root,f.input,{simulationClock:()=>now}),/CLOCK_ROLLBACK/);assert.deepEqual(await files(root),before);
 }
 const r=await run(root,f.input,{simulationClock:()=> '2026-10-16T16:15:00.000Z'});assert.equal(r.state,'SYNTHETIC_FINAL_VERIFIED');assert.equal(r.recovered,true);
 const after=await files(root);for(const [name,sha]of Object.entries(before))assert.equal(after[name],sha);
});
