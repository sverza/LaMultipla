import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {syntheticReaderArchive} from './fixtures/mm-reader.mjs';
import {hashValue,hashBytes} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
import {loadProspectiveDiagnostic,loadSyntheticReaderDiagnostic,verifyProspectiveDiagnostic} from '../scripts/lib/mm-simulator-v1/prospective-reader.mjs';
import {createReadSession,assertReadNamespace} from '../scripts/lib/mm-simulator-v1/read-session.mjs';
import {verifyScientificDistributions} from '../scripts/lib/mm-simulator-v1/prospective-archive.mjs';
import {ROOT} from '../scripts/lib/private-store.mjs';

async function temp(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-mm4a-'));t.after(async()=>{
 const resolved=await fs.realpath(root),allowed=await fs.realpath(os.tmpdir());assert.ok(resolved.startsWith(allowed+path.sep));await fs.rm(resolved,{recursive:true,force:true});});return root;}
async function snapshot(root){const out={};async function walk(d){for(const e of await fs.readdir(d,{withFileTypes:true})){
 const p=path.join(d,e.name),s=await fs.lstat(p),r=path.relative(root,p);out[r]={mtimeMs:s.mtimeMs,size:s.size,ino:s.ino};
 if(s.isSymbolicLink())out[r].link=await fs.readlink(p);else if(e.isDirectory())await walk(p);else out[r].sha256=hashBytes(await fs.readFile(p));
 }}await walk(root);return out;}
async function read(f,at=f.readAtUtc){const before=await snapshot(f.root);try{return await loadSyntheticReaderDiagnostic(f.root,f.cfg,at);}finally{assert.deepEqual(await snapshot(f.root),before);}}
async function reject(f,pattern=/MM4_|Experimental journal|future fixtures|Current results|Invalid frozen/){await assert.rejects(read(f),pattern);}
function resealEntries(j){for(const e of j.entries){const{entrySha256,...body}=e;void entrySha256;e.entrySha256=hashValue(body);}j.manifestSha256=hashValue(j.manifest);}
async function editArtifact(f,key,edit){
 const input=JSON.parse(await fs.readFile(f.cfg,'utf8')),index=JSON.parse(await fs.readFile(input.archive.reference.ref,'utf8'));
 const ref=index.artifacts[key],envelope=JSON.parse(await fs.readFile(ref.ref,'utf8'));edit(envelope.payload);
 index.artifacts[key]=await f.write(ref.ref,envelope.payload,true);input.archive.reference=await f.write(input.archive.reference.ref,index);
 await f.write(f.cfg,input);
}

test('M4-A: round nine uses real validators, exact M1/M2 links and explicit synthetic provenance, with zero writes',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),r=await read(f);
 assert.equal(r.content.scope.round,9);assert.equal(r.content.verification.status,'SYNTHETIC_ARCHIVE_STRUCTURE_VERIFIED');
 assert.equal(r.content.scientificCoverage.complete,true);assert.equal(r.content.priceUniverseCoverage.complete,true);
 assert.equal(r.content.diagnostic.counts.boards,20);assert.equal(r.content.diagnostic.records.length,40);
 assert.equal(r.content.quoteForecastLinks.length,40);assert.equal(r.content.diagnosticSha256,r.content.diagnostic.canonicalSha256);
 for(const q of r.content.quoteForecastLinks){assert.ok(q.entrySha256);assert.ok(q.models.dc.gridSha256);assert.ok(q.models.bivariate.bootstrapGridsSha256);}
 assert.equal(r.operationallyApproved,false);assert.equal(r.policyActivated,false);assert.equal(r.actualStakeEUR,0);assert.equal(r.content.verification.externallyCertified,false);
});
test('M4-A: a second non-G8 round shares the same read contract without creating a forecast or authentic receipt',async t=>{
 const f=await syntheticReaderArchive(await temp(t),{round:10}),r=await read(f);assert.equal(r.content.scope.round,10);
 assert.equal(r.content.sourceKind,'SYNTHETIC_TEST_ONLY');assert.equal(r.forecastExecuted,false);assert.equal(r.decisionExecuted,false);
});
test('M4-A: synthetic journals cannot enter the authentic reader, even after relabelling scope',async t=>{
 const f=await syntheticReaderArchive(await temp(t));let before=await snapshot(f.root);
 await assert.rejects(loadProspectiveDiagnostic(f.root,f.cfg),/COHORT_NOT_RECOGNIZED/);assert.deepEqual(await snapshot(f.root),before);
 const c=JSON.parse(await fs.readFile(f.cfg,'utf8'));c.scope.cohortId='reference-g8-20261023-v1';await f.write(f.cfg,c);before=await snapshot(f.root);
 await assert.rejects(loadProspectiveDiagnostic(f.root,f.cfg),/ARCHIVE_INDEX_INVALID|COHORT_NOT_RECOGNIZED/);assert.deepEqual(await snapshot(f.root),before);
});
test('M4-A: unknown schemas and model versions are rejected without source mutations',async t=>{
 for(const edit of [b=>{b.journalV2.schema='unknown-journal';},b=>{b.journalV2.modelVersion='unknown-model';},b=>{b.manifest.schema='unknown-manifest';}]){
  const f=await syntheticReaderArchive(await temp(t));edit(f.b);await f.save();await reject(f);
 }
 const f=await syntheticReaderArchive(await temp(t)),before=await snapshot(f.root);f.b.journalV2.sourceData='unknown-source';
 assert.throws(()=>verifyScientificDistributions(f.b.journalV2,f.b.studyV2),/SCIENTIFIC_SOURCE_UNKNOWN/);assert.deepEqual(await snapshot(f.root),before);
});
test('M4-A: source-byte mismatches and a rehashed but inconsistent receipt are rejected',async t=>{
 const f=await syntheticReaderArchive(await temp(t));await fs.appendFile(path.join(f.base,'freeze-receipt.json'),' ');await reject(f,/SOURCE_BYTES_MISMATCH/);
 const g=await syntheticReaderArchive(await temp(t));await editArtifact(g,'receipt',r=>{r.journals.v2.sha256='0'.repeat(64);});await reject(g,/JOURNAL_RECEIPT_INVALID/);
});
test('M4-A: partial, duplicate or foreign scientific fixtures cannot disappear from the manifest denominator',async t=>{
 for(const edit of [j=>{j.entries.pop();},j=>{j.entries[1]=structuredClone(j.entries[0]);},j=>{j.entries[0].fixtureId='unplanned-fixture';}]){
  const f=await syntheticReaderArchive(await temp(t));edit(f.b.journalV2);resealEntries(f.b.journalV2);await f.save();await reject(f);
 }
});
test('M4-A: home/away, kickoff, season and round mismatches are rejected through exact bindings',async t=>{
 for(const edit of [j=>{[j.entries[0].home,j.entries[0].away]=[j.entries[0].away,j.entries[0].home];},
  j=>{j.entries[0].kickoffUtc='2026-10-30T18:46:00.000Z';},j=>{j.manifest.season='2027/28';},j=>{j.manifest.matchday=11;}]){
  const f=await syntheticReaderArchive(await temp(t));edit(f.b.journalV2);resealEntries(f.b.journalV2);await f.save();await reject(f);
 }
});
test('M4-A: invalid grids, insufficient bootstrap and an incorrect registered seed reject prospective rows',async t=>{
 for(const edit of [p=>{p.grid=[[.2]];},p=>{p.grid[0][0]=-1;},p=>{p.bootstrapGrids.pop();},p=>{p.uncertainty.sufficient=false;},p=>{p.uncertainty.seed=999;}]){
  const f=await syntheticReaderArchive(await temp(t));edit(f.b.journalV2.entries[0].forecasts.dc);resealEntries(f.b.journalV2);await f.save();await reject(f,/FORECAST_DISTRIBUTION_INVALID/);
 }
});
test('M4-A: absent comparator or parameters never fall back to the other model',async t=>{
 for(const edit of [j=>{delete j.entries[0].forecasts.bivariate;},j=>{j.models.dc.converged=false;},j=>{j.entries[0].forecasts.dc.temperature=1.2;},j=>{j.models.unknown={};}]){
  const f=await syntheticReaderArchive(await temp(t));edit(f.b.journalV2);resealEntries(f.b.journalV2);await f.save();await reject(f,/MODEL_OR_PARAMETERS_INVALID/);
 }
});
test('M4-A: missing price fixture is explicit while the scientific universe remains complete',async t=>{
 const f=await syntheticReaderArchive(await temp(t));f.raw.pop();f.bindings.events.pop();await f.save();const r=await read(f);
 assert.equal(r.content.scientificCoverage.expectedFixtures,10);assert.equal(r.content.scientificCoverage.presentFixtures,10);
 assert.equal(r.content.priceUniverseCoverage.complete,false);assert.equal(r.content.priceUniverseCoverage.receivedFixtures,9);
 assert.deepEqual(r.content.priceUniverseCoverage.missingFixtureIds,['id9009']);assert.equal(r.content.diagnostic.state,'PARTIAL_DIAGNOSTIC');
});
test('M4-A: complete closed price boards remain complete and retain their provider exclusions',async t=>{
 const f=await syntheticReaderArchive(await temp(t));f.raw[0].bookmakerOdds['bet365.it'].markets[104].marketActive=false;await f.save();const r=await read(f);
 assert.equal(r.content.prices.completeBoards,20);assert.equal(r.content.prices.availableBoards,19);
 assert.ok(r.content.diagnostic.records.filter(q=>q.event.sourceEventId==='id9000'&&q.family==='BTTS').every(q=>q.boardCompleteness==='COMPLETE'&&q.boardAvailability==='CLOSED'&&q.exclusions.length));
});
test('M4-A: quote fixture discordance is excluded rather than associated with another frozen forecast',async t=>{
 const f=await syntheticReaderArchive(await temp(t));f.bindings.events[0].home.name='SYNTHETIC wrong home';await f.save();const r=await read(f);
 assert.equal(r.content.priceUniverseCoverage.complete,false);assert.ok(r.content.priceUniverseCoverage.identityMismatches.length);
 assert.ok(r.content.diagnostic.records.filter(q=>q.event.sourceEventId==='id9000').every(q=>q.forecastLinkState==='EXCLUDED'&&q.models.dc.probability===null));
});
test('M4-A: chained junctions and links placed at an expected file are refused on the real filesystem',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),other=await temp(t),middle=await temp(t),type=process.platform==='win32'?'junction':'dir';
 await fs.symlink(path.join(f.root,'.local'),path.join(middle,'linked'),type);await fs.symlink(path.join(middle,'linked'),path.join(other,'.local'),type);
 const before=await snapshot(f.root);await assert.rejects(loadSyntheticReaderDiagnostic(other,path.join(other,'.local/reader-fixture/input.json'),f.readAtUtc),/UNSAFE_PATH/);assert.deepEqual(await snapshot(f.root),before);
 const source=path.join(f.root,'.local/reader-fixture/raw.json'),copy=path.join(f.root,'.local/reader-fixture/raw-copy.json');await fs.rename(source,copy);
 // Windows account cannot create file symlinks (EPERM). A real junction at the
 // exact file location exercises the same reparse-point refusal, without mock,
 // elevation, skipped assertion or security-setting changes. POSIX uses a file symlink.
 await fs.symlink(process.platform==='win32'?path.dirname(copy):copy,source,process.platform==='win32'?'junction':'file');await reject(f,/UNSAFE_PATH/);
});
test('M4-A: outside-namespace paths and linked registered code cannot be inspected',async t=>{
 const f=await syntheticReaderArchive(await temp(t));await assert.rejects(assertReadNamespace(f.root,path.join(f.root,'scripts/lib/engine/registry.mjs')),/OUTSIDE_NAMESPACE/);
 const target=path.join(f.root,'scripts/lib/engine/model.mjs'),moved=path.join(f.root,'scripts/lib/engine/model-copy.txt');await fs.rename(target,moved);
 await fs.symlink(process.platform==='win32'?path.dirname(moved):moved,target,process.platform==='win32'?'junction':'file');await reject(f,/UNSAFE_PATH/);
});
test('M4-A: relocated journal with identical bytes cannot bypass the declared immutable journal location',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),c=JSON.parse(await fs.readFile(f.cfg,'utf8')),index=JSON.parse(await fs.readFile(c.archive.reference.ref,'utf8'));
 const old=index.artifacts.journalV2.ref,next=path.join(f.base,'moved.json');await fs.rename(old,next);index.artifacts.journalV2.ref=next;
 c.archive.reference=await f.write(c.archive.reference.ref,index);await f.write(f.cfg,c);await reject(f,/JOURNAL_PATH_INVALID/);
});
test('M4-A: historic expiry is displayed without refreshing forecast, observation or last-change times',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),r=await read(f,'2026-11-02T12:51:00.000Z');
 assert.equal(r.inspection.referenceAgeState,'EXPIRED_FOR_OPERATIONAL_USE');assert.equal(r.inspection.forecastGeneratedAtUtc,'2026-10-30T12:46:00.000Z');
 assert.equal(r.inspection.quoteObservedAtUtc,f.observed);assert.equal(r.content.diagnostic.records[0].lastChangedAtUtc,'2026-10-30T12:49:00.000Z');
 assert.equal(r.inspection.newProspectiveDecisionAuthorized,false);assert.equal(r.inspection.currentPrice,null);
});
test('M4-A: reading before actual observations or with invalid reader time cannot attest a freeze',async t=>{
 const f=await syntheticReaderArchive(await temp(t));for(const at of ['invalid','2026-10-30T12:44:00.000Z'])await assert.rejects(read(f,at),/READER_CLOCK_INVALID|EVIDENCE_NOT_YET_OBSERVED/);
});
test('M4-A: deterministic content hash is separate from actual inspection time; synthetic report cannot pass authentic replay',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),a=await read(f),b=await read(f,'2026-10-30T13:01:00.000Z');
 assert.equal(a.contentSha256,b.contentSha256);assert.deepEqual(a.content.diagnostic,b.content.diagnostic);assert.notEqual(a.inspection.referenceAgeEvaluatedAtUtc,b.inspection.referenceAgeEvaluatedAtUtc);
 assert.equal(a.inspection.simulatedReadAtUtc,f.readAtUtc);assert.ok(Date.parse(a.inspection.readerExecutedAtUtc)<=Date.now());assert.notEqual(a.reportSha256,b.reportSha256);
 const before=await snapshot(f.root);await assert.rejects(verifyProspectiveDiagnostic(f.root,f.cfg,a),/REPORT_INVALID/);assert.deepEqual(await snapshot(f.root),before);
});
test('M4-A: replacement during a read session, even by equal bytes, is rejected',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),session=createReadSession(f.root);await session.json(f.cfg);
 const b=await fs.readFile(f.cfg),replacement=f.cfg+'.replacement';await fs.writeFile(replacement,b);await fs.rename(f.cfg,f.cfg+'.old');await fs.rename(replacement,f.cfg);
 const before=await snapshot(f.root);await assert.rejects(session.finish(),/FILE_CHANGED_DURING_READ|FILE_REPLACED/);assert.deepEqual(await snapshot(f.root),before);
});
test('M4-A: manual CLI cannot enable a simulated clock, synthetic authority, provider or output writer',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),run=promisify(execFile),cli=path.join(ROOT,'scripts/multimarket-read.mjs'),before=await snapshot(f.root);
 for(const args of [['--input',f.cfg,'--as-of',f.readAtUtc],['--input',f.cfg],['--freeze'],['--acquire']]){
  await assert.rejects(run(process.execPath,[cli,...args],{cwd:f.root,windowsHide:true,timeout:10000}),e=>/MM4_USAGE|MM4_COHORT_NOT_RECOGNIZED/.test(e.stderr));
 }
 assert.deepEqual(await snapshot(f.root),before);
});

test('M4-A: per-round consent is required independently of cohort registration and binds exact data',async t=>{
 for(const edit of [a=>{a.freezeAuthorized=false;},a=>{a.scope={...a.scope,round:8};},a=>{a.datasetSha256='0'.repeat(64);},a=>{a.reviewer='';},a=>{a.operationallyApproved=true;}]){
  const f=await syntheticReaderArchive(await temp(t));edit(f.b.roundApproval);await f.save();await reject(f,/ROUND_APPROVAL_REQUIRED|FREEZE_CONTRACT_INVALID/);
 }
});
test('M4-A: original source, registered code and historical freeze completion boundary cannot be replaced',async t=>{
 const source=await syntheticReaderArchive(await temp(t));source.b.dataset.source='pitchapi';source.b.roundApproval.datasetSha256=hashValue(source.b.dataset);await source.save();await reject(source,/Current results dataset/);
 const code=await syntheticReaderArchive(await temp(t));await fs.appendFile(path.join(code.root,'scripts/lib/engine/model.mjs'),'\n// SYNTHETIC_TEST_CHANGE\n');await reject(code,/REGISTERED_ENGINE_CODE_CHANGED/);
 const boundary=await syntheticReaderArchive(await temp(t));await editArtifact(boundary,'receipt',r=>{r.completedAtUtc='2026-10-30T16:15:00.000Z';});await reject(boundary,/FREEZE_CHAIN_INVALID|OUTSIDE_ORIGINAL_WINDOW/);
});
test('M4-A: the existing G8 adapter cannot be used for another round by relabelling its input',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),c=JSON.parse(await fs.readFile(f.cfg,'utf8'));c.scope.cohortId='reference-g8-20261023-v1';c.archive.kind='G8_REFERENCE_PLAN';await f.write(f.cfg,c);
 const before=await snapshot(f.root);await assert.rejects(loadProspectiveDiagnostic(f.root,f.cfg),/LEGACY_SCOPE_MISMATCH/);assert.deepEqual(await snapshot(f.root),before);
});
test('M4-A: reader uses only read handles and cannot write files, fetch, freeze or compose a decision',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),originals=new Map(),fetch=globalThis.fetch,before=await snapshot(f.root);
 try{
  for(const key of ['writeFile','appendFile','mkdir','rename','link','unlink','rm']){originals.set(key,fs[key]);fs[key]=async()=>{throw Error('FORBIDDEN_WRITE:'+key);};}
  const open=fs.open;originals.set('open',open);fs.open=async(file,flags,...args)=>{assert.equal(flags,'r');return open.call(fs,file,flags,...args);};
  globalThis.fetch=()=>{throw Error('FORBIDDEN_NETWORK');};
  const r=await loadSyntheticReaderDiagnostic(f.root,f.cfg,f.readAtUtc);assert.equal(r.decisionExecuted,false);assert.equal(r.forecastExecuted,false);assert.equal(r.refitExecuted,false);
 }finally{for(const [key,value]of originals)fs[key]=value;globalThis.fetch=fetch;}
 assert.deepEqual(await snapshot(f.root),before);
});
test('M4-A: forecast start cannot be later than generation or precede its authorized freeze intent',async t=>{
 for(const at of ['invalid','2026-10-30T12:44:00.000Z','2026-10-30T12:48:00.000Z']){
  const f=await syntheticReaderArchive(await temp(t));f.b.journalV2.startedAtUtc=at;await f.save();await reject(f,/JOURNAL_PROVENANCE_OR_IDENTITY_INVALID/);
 }
});
test('M4-A: a recorded frozen exclusion stays explicit and does not remove a scientific fixture',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),j=f.b.journalV2;j.entries[0].status='excluded';j.entries[0].exclusions=['dc:history_fit_or_uncertainty_insufficient'];
 j.entries[0].forecasts.dc.grid=null;j.counts.forecasted=9;j.counts.excluded=1;resealEntries(j);await f.save();const r=await read(f);
 assert.equal(r.content.scientificCoverage.complete,true);assert.equal(r.content.scientificCoverage.prospectiveFixtures,9);assert.deepEqual(r.content.scientificCoverage.frozenExcludedFixtureIds,['id9000']);
 assert.ok(r.content.diagnostic.records.filter(q=>q.event.sourceEventId==='id9000').every(q=>q.frozenEntryStatus==='excluded'&&q.models.dc.probability===null));
});
test('M4-A: the v1 companion cannot declare another fixture or contradictory dataset provenance',async t=>{
 for(const edit of [j=>{j.entries[0].fixtureId='foreign';},j=>{j.provenance.sourceCommit='b'.repeat(40);}]){
  const f=await syntheticReaderArchive(await temp(t));edit(f.b.journalV1);resealEntries(f.b.journalV1);await f.save();await reject(f,/JOURNAL_PROVENANCE_OR_IDENTITY_INVALID/);
 }
});
test('M4-A: G8 has only its original official freeze authority, never an alternative indexed archive',async t=>{
 const f=await syntheticReaderArchive(await temp(t)),c=JSON.parse(await fs.readFile(f.cfg,'utf8'));c.scope={cohortId:'reference-g8-20261023-v1',season:'2026/27',round:8};await f.write(f.cfg,c);
 const before=await snapshot(f.root);await assert.rejects(loadProspectiveDiagnostic(f.root,f.cfg),/G8_OFFICIAL_READER_REQUIRED/);assert.deepEqual(await snapshot(f.root),before);
});
