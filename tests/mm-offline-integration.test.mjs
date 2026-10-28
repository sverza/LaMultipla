import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {syntheticIntegratedFixture} from './fixtures/mm-integration.mjs';
import {loadSyntheticIntegration,runSyntheticIntegration,verifySyntheticIntegration,syntheticIntegrationAuthority} from '../scripts/lib/mm-simulator-v1/synthetic-integration.mjs';
import {prototypeAuthorityPath} from '../scripts/lib/mm-simulator-v1/prototype-store.mjs';
import {discoverPrototype} from '../scripts/lib/mm-simulator-v1/prototype-analysis.mjs';
import {hashValue,hashBytes} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
import {INTEGRATION_CONTRACT_SCHEMA,INTEGRATION_ROLES,INTEGRATION_TIMES,validateFutureIntegrationContract,inspectFutureIntegrationContract} from '../scripts/lib/mm-simulator-v1/integration-contract.mjs';

async function setup(t,options){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lm-mm4b-'));t.after(async()=>{
  const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(resolved,{recursive:true,force:true});
 });return syntheticIntegratedFixture(root,options);
}
async function snapshot(root,{directories=false}={}){
 const result={};async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,e.name);if(e.isDirectory()){
   if(directories){const s=await fs.stat(file);result[path.relative(root,file)+path.sep]={mtime:s.mtimeMs,ino:s.ino};}await walk(file);
  }else if(e.isFile()){const s=await fs.stat(file);result[path.relative(root,file)]={sha256:hashBytes(await fs.readFile(file)),size:s.size,mtime:s.mtimeMs};}
 }}await walk(root);return result;
}
const run=f=>runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>f.readAtUtc});
const verify=f=>verifySyntheticIntegration({root:f.root,filename:f.filename});
const paths=f=>syntheticIntegrationAuthority(f.root,f.scope);

test('M4-B synthetic G9: real reader/M1/M2/composer/store/verifier, exact replay and immutable inputs',async t=>{
 const f=await setup(t),before=await snapshot(f.root),loaded=await loadSyntheticIntegration(f.root,f.filename);
 assert.equal(loaded.linkage.scope.round,9);assert.equal(loaded.report.content.scientificCoverage.expectedFixtures,10);
 const result=await run(f);assert.equal(result.status,'SYNTHETIC_INTEGRATION_VERIFIED');
 assert.equal(result.prototype.decision.state,'SYNTHETIC_EXPLORATORY_SIMULATION_RECORDED');
 assert.equal(result.operationallyApproved,false);assert.equal(result.actualStakeEUR,0);assert.equal(result.scientificallyValidated,false);
 const after=await snapshot(f.root);for(const [file,pin]of Object.entries(before))assert.deepEqual(after[file],pin,file);
 const allPins=await snapshot(f.root,{directories:true});
 const checked=await verify(f);assert.equal(checked.decisionSha256,result.decisionSha256);assert.deepEqual(checked.receipt,result.receipt);
 const replay=await run(f);assert.equal(replay.replayed,true);assert.equal(replay.decisionSha256,result.decisionSha256);
 assert.deepEqual(await snapshot(f.root),after);assert.deepEqual(await snapshot(f.root,{directories:true}),allPins);assert.equal(result.prototype.decision.selected.jointProbability,null);
});

test('M4-B expected 10 / received 9: missing fixture stays in denominator through persisted decision',async t=>{
 const f=await setup(t,{missingFixture:true}),loaded=await loadSyntheticIntegration(f.root,f.filename);
 assert.equal(loaded.linkage.priceUniverseCoverage.expectedFixtures,10);assert.equal(loaded.linkage.priceUniverseCoverage.receivedFixtures,9);
 assert.equal(loaded.linkage.priceUniverseCoverage.complete,false);
 const result=await run(f);assert.equal(result.prototype.decision.state,'ANALYSIS_INCOMPLETE');assert.equal(result.prototype.decision.globalNoBet,false);
 assert.ok(result.prototype.decision.universeCoverage.gapCount>0);
});

test('M4-B complete but closed boards retain accurate availability and comparator diagnostics',async t=>{
 const f=await setup(t),r=await run(f),d=r.prototype.decision;
 assert.equal(d.boardCoverage.completeBoards,20);assert.equal(d.boardCoverage.incompleteBoards,0);assert.equal(d.boardAvailability.closedBoards,16);
 assert.ok(d.comparatorDiagnostics.every(c=>c.state==='AVAILABLE'));
 assert.ok(!d.exclusions.filter(e=>e.reasons.some(r=>/BOARD_INCOMPLETE/.test(r))).length);
 assert.equal(d.jointProbability,null);assert.equal(d.marginalIntervalsSimultaneous,false);
});

for(const kind of ['duplicate','unexpected','home-away','kickoff','comparator-absent','comparator-invalid','forecast-invalid'])
 test('M4-B rejects archive identity/distribution corruption: '+kind,async t=>{
  const f=await setup(t);
  if(kind==='duplicate')f.raw.push(structuredClone(f.raw[0]));
  if(kind==='unexpected')f.raw[0].fixtureId='unexpected-synthetic-id';
  if(kind==='home-away')[f.raw[0].participant1Name,f.raw[0].participant2Name]=[f.raw[0].participant2Name,f.raw[0].participant1Name];
  if(kind==='kickoff')f.raw[0].startTime='2026-10-30T19:45:00.000Z';
  if(kind.startsWith('comparator')||kind==='forecast-invalid'){
   const e=f.b.journalV2.entries[0];
   if(kind==='comparator-absent')delete e.forecasts.bivariate;
   if(kind==='comparator-invalid')e.forecasts.bivariate.grid=[[2]];
   if(kind==='forecast-invalid')e.forecasts.dc.bootstrapGrids=[];
   const {entrySha256,...v}=e;void entrySha256;e.entrySha256=hashValue(v);
  }
  await f.save();f.config.readerInput=await f.ref(f.cfg);await f.write(f.filename,f.config);
  const before=await snapshot(f.root);await assert.rejects(run(f));assert.deepEqual(await snapshot(f.root),before);
 });

test('M4-B incomplete board is preserved, never upgraded to global NO BET',async t=>{
 const f=await setup(t);delete f.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes[105];await f.save();await f.saveEvidence();
 const r=await run(f);assert.equal(r.prototype.decision.state,'ANALYSIS_INCOMPLETE');assert.equal(r.prototype.decision.globalNoBet,false);
 assert.ok(r.prototype.decision.boardCoverage.incompleteBoards>0);
});

for(const kind of ['context','selection-review','settlement','ticket'])test('M4-B missing synthetic evidence: '+kind,async t=>{
 const f=await setup(t);await f.saveEvidence(e=>{
  if(kind==='context')e.context=null;
  if(kind==='selection-review')e.selectionReviews=[];
  if(kind==='settlement')for(const r of e.selectionReviews)r.rules.voidAndPostponementReviewed=false;
  if(kind==='ticket')e.ticketReviews=[];
 });
 const r=await run(f);assert.equal(r.prototype.decision.state,'ANALYSIS_INCOMPLETE');assert.equal(r.prototype.decision.globalNoBet,false);assert.equal(r.prototype.decision.selected,null);
});

test('M4-B ticket budget and truncated search remain explicitly incomplete',async t=>{
 const f=await setup(t,{activeFixtures:10}),r=await run(f),d=r.prototype.decision;
 assert.equal(d.state,'ANALYSIS_INCOMPLETE');assert.ok(d.reasons.includes('SEARCH_TRUNCATED'));
 assert.ok(d.reasons.includes('REVIEW_BUDGET_EXHAUSTED'));assert.equal(d.counts.reviewSlots,10);
 assert.ok(d.counts.examinedCombinations<=20000);assert.ok(d.counts.visitedNodes<=100000);
 assert.equal(d.globalNoBet,false);const before=await snapshot(f.root);await verify(f);assert.deepEqual(await snapshot(f.root),before);
});

for(const kind of ['rollback','expired','future-review','unknown-policy','authentic-kind','wrong-cohort','evidence-hash'])
 test('M4-B fail closed before new files: '+kind,async t=>{
  const f=await setup(t);let now=f.readAtUtc;
  if(kind==='rollback')now='2026-10-30T12:49:00.000Z';
  if(kind==='expired')now='2026-10-30T13:21:00.000Z';
  if(kind==='future-review')await f.saveEvidence(e=>{e.selectionReviews[0].reviewedAtUtc='2026-10-30T12:52:00.000Z';});
  if(kind==='unknown-policy')f.config.policySha256='f'.repeat(64);
  if(kind==='authentic-kind')f.config.sourceKind='LOCAL_AUTHENTIC_ARCHIVE';
  if(kind==='wrong-cohort')f.config.scope.cohortId='reference-g8-20261023-v1';
  if(kind==='evidence-hash')f.config.evidence.sha256='f'.repeat(64);
  await f.write(f.filename,f.config);const before=await snapshot(f.root,{directories:true});
  await assert.rejects(runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>now}));assert.deepEqual(await snapshot(f.root,{directories:true}),before);
 });

test('M4-B changed source/receipt/decision and input replacement cannot replay',async t=>{
 const f=await setup(t);await run(f);const receiptFile=path.join(paths(f).directory,'integration-receipt.json'),original=await fs.readFile(receiptFile);
 const value=JSON.parse(original);value.payload.linkageSha256='f'.repeat(64);value.sha256=hashValue(value.payload);await fs.writeFile(receiptFile,JSON.stringify(value));
 await assert.rejects(verify(f),/RECEIPT_ALTERED/);await fs.writeFile(receiptFile,original);
 const loaded=await loadSyntheticIntegration(f.root,f.filename),where=prototypeAuthorityPath(f.root,loaded.input),decisionFile=path.join(where.directory,'decision.json'),raw=await fs.readFile(decisionFile);
 const decision=JSON.parse(raw);decision.payload.actualStakeEUR=1;decision.sha256=hashValue(decision.payload);await fs.writeFile(decisionFile,JSON.stringify(decision));
 await assert.rejects(verify(f),/ALTERED/);await fs.writeFile(decisionFile,raw);
 await f.saveEvidence(e=>{e.ticketReviews[0].price=1.5;});const before=await snapshot(f.root);await assert.rejects(run(f),/INPUT_OR_CODE_CONFLICT/);assert.deepEqual(await snapshot(f.root),before);
});

test('M4-B source changed during composition cannot receive integration receipt',async t=>{
 const f=await setup(t);await assert.rejects(runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>f.readAtUtc,onCheckpoint:async stage=>{
  if(stage==='after:receipt.json')await fs.appendFile(path.join(f.root,'.local/reader-fixture/raw.json'),' ');
 }}));assert.equal(await fs.stat(path.join(paths(f).directory,'integration-receipt.json')).then(()=>true,()=>false),false);
});

test('M4-B real filesystem junctions cannot bypass source or persistence namespace',async t=>{
 const f=await setup(t),where=paths(f),namespace=path.dirname(where.directory),outside=path.join(f.root,'outside');
 await fs.mkdir(outside);await fs.symlink(outside,namespace,process.platform==='win32'?'junction':'dir');
 const before=await snapshot(f.root);await assert.rejects(run(f),/UNSAFE/);assert.deepEqual(await snapshot(f.root),before);
 await fs.unlink(namespace);
 const loaded=await loadSyntheticIntegration(f.root,f.filename),proto=prototypeAuthorityPath(f.root,loaded.input),pns=path.dirname(proto.directory);
 await fs.symlink(outside,pns,process.platform==='win32'?'junction':'dir');await assert.rejects(run(f),/UNSAFE/);
 await fs.unlink(pns);
 const inputs=path.join(f.root,'.local/reader-fixture'),target=path.join(f.root,'.local/relocated-reader-fixture');await fs.rename(inputs,target);
 await fs.symlink(target,inputs,process.platform==='win32'?'junction':'dir');await assert.rejects(run(f),/UNSAFE/);
});

test('M4-B bounded crash matrix: wrapper and M3 critical phases recover identical decision',async t=>{
 for(const stage of ['before:integration-intent.json','after:integration-intent.json','after:input.json','after:preview.json','after:review-01-claim.json',
  'after:prepared.json','after:decision.json','after:commit-proof.json','after:receipt.json','before:integration-receipt.json','after:integration-receipt.json']){
  const f=await setup(t);let seen=false;
  await assert.rejects(runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>f.readAtUtc,onCheckpoint:s=>{
   if(s===stage){seen=true;throw Error('SYNTHETIC_CRASH:'+stage);}
  }}),/SYNTHETIC_CRASH/);assert.equal(seen,true,stage);
  const interrupted=await snapshot(f.root),recovered=await run(f);assert.equal(recovered.status,'SYNTHETIC_INTEGRATION_VERIFIED');
  const after=await snapshot(f.root);for(const [name,pin]of Object.entries(interrupted))assert.deepEqual(after[name],pin,stage+':'+name);
  assert.equal((await verify(f)).decisionSha256,recovered.decisionSha256);
 }
});

test('M4-B recovery clock rollback has zero new file effects, including wrapper lock',async t=>{
 const f=await setup(t),later='2026-10-30T12:52:00.000Z';
 await assert.rejects(runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>later,onCheckpoint:s=>{if(s==='after:review-01-claim.json')throw Error('CRASH');}}),/CRASH/);
 const before=await snapshot(f.root,{directories:true});await assert.rejects(run(f),/CLOCK_ROLLBACK/);assert.deepEqual(await snapshot(f.root,{directories:true}),before);
 assert.equal((await runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>later})).status,'SYNTHETIC_INTEGRATION_VERIFIED');
});

test('M4-B committed proof permits receipt-only recovery after expiry without refreshing the decision',async t=>{
 const f=await setup(t);await assert.rejects(runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>f.readAtUtc,
  onCheckpoint:s=>{if(s==='after:commit-proof.json')throw Error('CRASH');}}),/CRASH/);
 const loaded=await loadSyntheticIntegration(f.root,f.filename),p=prototypeAuthorityPath(f.root,loaded.input),before=await fs.readFile(path.join(p.directory,'decision.json'));
 const result=await runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=> '2026-10-30T16:15:00.000Z'});
 assert.equal(result.status,'SYNTHETIC_INTEGRATION_VERIFIED');assert.equal(result.clock.simulatedDecisionAtUtc,f.readAtUtc);
 assert.ok(before.equals(await fs.readFile(path.join(p.directory,'decision.json'))));
 assert.equal((await verify(f)).decisionSha256,result.decisionSha256);
});

test('M4-B exact zero Frechet lower bound remains zero through integration and persistence',async t=>{
 const f=await setup(t);
 for(const e of f.b.journalV2.entries){for(const m of Object.values(e.forecasts)){
  m.grid=[[.51,0,0],[0,0,0],[0,0,.49]];m.bootstrapGrids=Array.from({length:40},()=>structuredClone(m.grid));
 }const {entrySha256,...rest}=e;void entrySha256;e.entrySha256=hashValue(rest);}
 for(const fixture of f.raw)for(const [id,market]of Object.entries(fixture.bookmakerOdds['bet365.it'].markets))market.outcomes[id].players[0].price=3;
 await f.save();await f.saveEvidence();const loaded=await loadSyntheticIntegration(f.root,f.filename),analysis=discoverPrototype(loaded.input,f.readAtUtc);
 assert.ok(analysis.candidates.length>0);assert.ok(analysis.candidates.every(c=>c.jointProbabilityBounds[0]===0));
 const d=(await run(f)).prototype.decision;assert.equal(d.state,'NO_COMBINATION_IN_REVIEWED_SYNTHETIC_SCOPE');assert.equal(d.globalNoBet,false);
 for(const r of d.verifiedRanking){assert.equal(r.jointSensitivityEnvelope[0],0);assert.equal(r.conditionalSyntheticNetPerUnitBounds[0],-1);assert.equal(r.jointProbability,null);}
});

function child(f,stage='',mode=''){
 const p=fork(new URL('./fixtures/mm-integration-child.mjs',import.meta.url),[f.root,f.filename,f.readAtUtc,stage,mode],
  {silent:true,windowsHide:true});let errors='';p.stderr.on('data',b=>{errors+=b;});
 const messages=[],waiters=[];p.on('message',m=>{if(waiters.length)waiters.shift()(m);else messages.push(m);});
 const done=new Promise(resolve=>p.once('exit',code=>resolve({code,errors})));
 return {p,done,next:()=>messages.length?Promise.resolve(messages.shift()):new Promise(resolve=>waiters.push(resolve))};
}
test('M4-B Windows multiprocess: two BUSY, no effects, one owner, serialized recovery after real crash', {timeout:60000},async t=>{
 const f=await setup(t),owner=child(f,'after:integration-intent.json');t.after(()=>{if(!owner.p.killed)owner.p.kill();});
 assert.equal((await owner.next()).stage,'after:integration-intent.json');const held=await snapshot(f.root);
 for(let i=0;i<2;i++){
  const contender=child(f);assert.match((await contender.next()).error,/già in esecuzione/);assert.equal((await contender.done).code,1);
  assert.deepEqual(await snapshot(f.root),held);
 }
 owner.p.send('continue');const success=await owner.next();assert.equal(success.status,'SYNTHETIC_INTEGRATION_VERIFIED');assert.equal((await owner.done).code,0);
 assert.equal((await verify(f)).decisionSha256,success.decisionSha256);
 const crashFixture=await setup(t),crashed=child(crashFixture,'after:decision.json','crash');assert.equal((await crashed.done).code,73);
 const before=await snapshot(crashFixture.root),recovered=await run(crashFixture);assert.equal(recovered.status,'SYNTHETIC_INTEGRATION_VERIFIED');
 const after=await snapshot(crashFixture.root);
 for(const [file,pin]of Object.entries(before))if(!file.includes(path.sep+'locks'+path.sep))assert.deepEqual(after[file],pin);
 assert.equal((await verify(crashFixture)).decisionSha256,recovered.decisionSha256);
});

test('M4-B unpublished partial temporary is preserved; truncated published intent is never replaced',async t=>{
 const f=await setup(t);await assert.rejects(runSyntheticIntegration({root:f.root,filename:f.filename,simulationClock:()=>f.readAtUtc,
  onCheckpoint:s=>{if(s==='after:integration-intent.json')throw Error('CRASH');}}),/CRASH/);
 const dir=paths(f).directory,tmp=path.join(dir,'integration-receipt.json.00000000-0000-0000-0000-000000000000.tmp');
 await fs.writeFile(tmp,'{');await run(f);assert.equal(await fs.readFile(tmp,'utf8'),'{');await verify(f);
 const g=await setup(t);await assert.rejects(runSyntheticIntegration({root:g.root,filename:g.filename,simulationClock:()=>g.readAtUtc,
  onCheckpoint:s=>{if(s==='after:integration-intent.json')throw Error('CRASH');}}));
 await fs.writeFile(path.join(paths(g).directory,'integration-intent.json'),'{');const before=await snapshot(g.root);
 await assert.rejects(run(g));assert.deepEqual(await snapshot(g.root),before);
});

function futureDescriptor(){return {schema:INTEGRATION_CONTRACT_SCHEMA,scope:{cohortId:'reference-g8-20261023-v1',season:'2026/27',round:9},
 sourceKind:'LOCAL_ARCHIVE_REFERENCE_DESCRIPTOR',readerContentSha256:'a'.repeat(64),primaryModel:'dc-v2',comparatorModel:'bivariate-v2',
 references:Object.fromEntries(INTEGRATION_ROLES.map(k=>[k,null])),times:Object.fromEntries(INTEGRATION_TIMES.map(k=>[k,null])),
 activation:{state:'NOT_AUTHORIZED',operationallyApproved:false,scientificallyValidated:false,actualStakeEUR:0}};}
test('M4-B future descriptor checks exact references without asserting authorization or creating authentic artifacts',async t=>{
 const f=await setup(t),v=futureDescriptor();v.references.manifest=await f.ref(f.filename);
 const report=validateFutureIntegrationContract(v);assert.equal(report.status,'DESCRIPTOR_ONLY_NOT_AUTHORIZED');assert.equal(report.authorizationVerified,false);
 assert.ok(report.missingReferences.includes('prospectivePolicy'));const file=path.join(f.root,'.local/integration-fixture/future-descriptor.json');await f.write(file,v);
 const before=await snapshot(f.root),read=await inspectFutureIntegrationContract(f.root,file);assert.equal(read.referenceIntegrityVerified,true);
 assert.equal(read.semanticLinkageVerified,false);assert.deepEqual(await snapshot(f.root),before);
 for(const mutate of [x=>{x.activation.state='APPROVED';},x=>{x.references.prospectivePolicy={ref:'.local/mm-m3b-synthetic-v1.json',sha256:'b'.repeat(64)};},
  x=>{x.times.forecastGeneratedAtUtc=f.readAtUtc;x.times.freezeCompletedAtUtc='2026-10-30T12:45:00.000Z';},x=>{x.scope.cohortId='UNKNOWN';},x=>{x.primaryModel='bivariate-v2';}]){
  const copy=structuredClone(v);mutate(copy);assert.throws(()=>validateFutureIntegrationContract(copy));
 }
 v.references.manifest.sha256='f'.repeat(64);await f.write(file,v);await assert.rejects(inspectFutureIntegrationContract(f.root,file),/MISMATCH/);
 const claimed=futureDescriptor(),syntheticReportFile=path.join(f.root,'.local/integration-fixture/fake-authentic-report.json');
 await f.write(syntheticReportFile,f.reader);claimed.references.readerReport=await f.ref(syntheticReportFile);claimed.references.readerInput=await f.ref(f.cfg);
 await f.write(file,claimed);await assert.rejects(inspectFutureIntegrationContract(f.root,file),/REPORT_INVALID/);
});
