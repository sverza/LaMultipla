// Synthetic journals with the schema actually emitted by the freeze, never G8 originals.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {referenceScreenFixture,screenNow} from './fixtures/reference-screen.mjs';
import {PROGRESSIVE_POLICY,validateAttemptMetadata,validateRoundIdentity} from '../scripts/lib/orchestration/progressive-policy.mjs';
import {digest,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {createDecision} from '../scripts/lib/shadow/pipeline.mjs';
import {governance} from '../scripts/lib/decision/governance.mjs';
import {journalIssues} from '../scripts/lib/shadow/opportunities.mjs';
import {runReferenceScreen} from '../scripts/lib/reference-screen.mjs';

function fixture(kind='simulation'){
 const f=referenceScreenFixture(kind);
 f.bundle.journal.manifest={...f.bundle.journal.manifest,schema:'lamultipla-round-manifest-v1',scheduleSource:'SYNTHETIC_CONFIRMED_SCHEDULE',identityBasis:'confirmed_schedule_pending_quote_report_check'};
 f.bundle.journal.manifestSha256=digest(f.bundle.journal.manifest);
 return f;
}
function metadata(f){return {schema:'lamultipla-progressive-attempt-v1',attemptId:'0001',revision:1,protocolSha256:digest(PROGRESSIVE_POLICY),
 roundIdentitySha256:digest(validateRoundIdentity(f.reference.input.schedule)),scheduleSha256:digest(f.reference.input.schedule),
 scientificJournalSha256:digest(f.bundle.journal),inputSha256:'a'.repeat(64),protocolDocumentSha256:'b'.repeat(64),plannedAtUtc:screenNow,
 eligibleFixtureIds:f.bundle.journal.entries.map(e=>e.fixtureId)};}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}

test('old spread demonstrably replaces schedule schema with the authentic journal schema',()=>{
 const f=fixture(),old={schema:'lamultipla-prospective-schedule-v1',...f.bundle.journal.manifest};
 assert.equal(old.schema,'lamultipla-round-manifest-v1');assert.throws(()=>validateRoundIdentity(old),/PROGRESSIVE_ROUND_IDENTITY_INVALID/);
});
test('real validator accepts a deeply frozen authentic-shape journal without changing identity/hash or input',()=>{
 const f=fixture(),j=freeze(f.bundle.journal),m=freeze(metadata(f)),before=digest(j);
 assert.equal(validateAttemptMetadata(m,j,screenNow),m);assert.equal(digest(j),before);
 assert.equal(m.roundIdentitySha256,digest(validateRoundIdentity(f.reference.input.schedule)));
 assert.equal(validateAttemptMetadata(m,j,screenNow),m);
});
test('altered identity, missing/duplicate fixtures, unknown schema and invalid kickoff remain refused',()=>{
 const f=fixture(),m=metadata(f);
 const changes=[j=>{j.manifest.events[0].fixtureId='different-id';},j=>{[j.manifest.events[0].home,j.manifest.events[0].away]=[j.manifest.events[0].away,j.manifest.events[0].home];},
  j=>{j.manifest.season='2027/28';},j=>{j.manifest.matchday=9;},j=>{j.manifest.events.pop();},j=>{j.manifest.events[0].fixtureId=j.manifest.events[1].fixtureId;},
  j=>{j.manifest.events[0].kickoffUtc='invalid';},j=>{j.manifest.events[0].kickoffUtc='2026-01-01T00:00:00Z';},j=>{j.manifest.schema='unknown';}];
 for(const change of changes){const j=structuredClone(f.bundle.journal);change(j);assert.throws(()=>validateAttemptMetadata(m,j,screenNow),/PROGRESSIVE_/);}
 assert.throws(()=>validateAttemptMetadata({...m,roundIdentitySha256:'0'.repeat(64)},f.bundle.journal,screenNow),/ROUND_MISMATCH/);
});
test('valid kickoff edits still invalidate the immutable journal hash; identity digest semantics stay unchanged',()=>{
 const f=fixture(),j=structuredClone(f.bundle.journal);j.manifest.events[0].kickoffUtc='2026-10-24T18:45:00.000Z';
 assert.ok(journalIssues(j,f.bundle.study,Date.parse(screenNow)).includes('forecast_manifest_hash_mismatch'));
 assert.notEqual(digest(j),digest(f.bundle.journal));
});
for(const [kind,state]of [['simulation','MULTIPLA_SIMULATA'],['no_value','NO_BET'],['missing_rules','ANALYSIS_INCOMPLETE']]){
 test('authentic-shape '+state+' recovers intent 0001, preserves prior bytes and replays without changes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-manifest-bridge-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('lamultipla-manifest-bridge-'));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'docs'));await fs.copyFile(PROGRESSIVE_POLICY.protocolPath,path.join(root,PROGRESSIVE_POLICY.protocolPath));
  const f=fixture(kind),files=Object.fromEntries(['report','assessment','context','combinedPrices'].map(k=>[k,{file:path.join(root,k+'.json'),value:f.bundle[k]}]));
  let calls=0;const runShadow=async({metadata:m})=>{calls++;const d=createDecision({...f.bundle,progressive:m});d.final=false;d.governance=governance(d);return d;};
  const args={root,reference:f.reference,files,attemptId:'0001',clock:()=>new Date(screenNow),runShadow};
  const originalJournal=digest(f.bundle.journal);
  await assert.rejects(runReferenceScreen({...args,afterStage:stage=>{if(stage==='intent')throw Error('SYNTHETIC_CRASH');}}),/SYNTHETIC_CRASH/);
  const dir=path.join(root,'.local/research-review/cohorts/reference-g8-20261023-v1/screening/0001'),intent=path.join(dir,'intent.json'),bytes=await fs.readFile(intent),mtime=(await fs.stat(intent)).mtimeMs;
  const r=await runReferenceScreen(args);assert.equal(r.state,state);assert.equal(calls,1);assert.deepEqual(await fs.readFile(intent),bytes);assert.equal((await fs.stat(intent)).mtimeMs,mtime);
  assert.deepEqual(await runReferenceScreen(args),r);assert.equal(calls,1);assert.equal(digest(f.bundle.journal),originalJournal);
  const decision=await readSnapshot(path.join(dir,'decision.json'));assert.equal(decision.progressive.roundIdentitySha256,metadata(f).roundIdentitySha256);
  const payload=await readSnapshot(r.packageFile);assert.equal(digest(payload),r.packageSha256);
  if(state==='MULTIPLA_SIMULATA')assert.equal(payload.source.decisionSha256,digest(await readSnapshot(r.decisionFile)));
 });
}
