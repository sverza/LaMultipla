// Synthetic tests of preparation and isolation; not scientific validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateSupplementalEvidence,reconcileSupplementalResults} from '../scripts/lib/prospective/source-review.mjs';
import {captureOriginalResults,requireG6Due,recordOriginalG6,inspectOriginalG6,G6_PATHS} from '../scripts/lib/prospective/original-check.mjs';
import {sealJournal} from '../scripts/lib/prospective/freeze.mjs';
import {readSnapshot,writeExclusive} from '../scripts/lib/prospective/store.mjs';
import {sha256} from '../scripts/lib/goals/data.mjs';
import {CALENDAR_LICENSE_SHA256} from '../scripts/lib/orchestration/calendar-discovery.mjs';
import {evaluateJournal} from '../scripts/lib/prospective/evaluate.mjs';
const now='2026-10-15T08:00:00.000Z',raw=Buffer.from('synthetic source bytes'),manifest={season:'2026/27',matchday:6,events:Array.from({length:10},(_,i)=>({fixtureId:'synthetic-'+i,home:'H'+i,away:'A'+i,kickoffUtc:'2026-10-10T13:00:00.000Z',season:'2026/27',matchday:6}))};
function evidence(){return {schema:'lamultipla-supplemental-results-v1',season:'2026/27',matchday:6,
  source:{id:'lega-official',url:'https://www.legaseriea.it/synthetic.pdf',termsUrl:'https://www.legaseriea.it/terms-and-conditions',documentId:'synthetic',rawSha256:sha256(raw),
    acquiredAtUtc:'2026-10-13T20:00:00.000Z',publishedAtUtc:null,rights:{status:'authorized',evidence:'synthetic permission only'}},
  entries:manifest.events.map(e=>({...e,date:'2026-10-10',status:'finished',goals:[1,0],sourceLocator:'synthetic page1',reviewer:'synthetic',reviewedAtUtc:'2026-10-13T21:00:00.000Z'}))};}
function journal(){return sealJournal({model:{converged:true,cutoffUtc:'2026-10-01T00:00:00Z'},forecasts:manifest.events.map(e=>({...e,central:[.5,.3,.2],intervals95:[[.4,.6],[.2,.4],[.1,.3]],uncertainty:{sufficient:true},baselines:{empirical:[.4,.3,.3],leaguePoisson:[.45,.3,.25]}}))},manifest,{},'2026-10-09T22:00:00.000Z');}
function results(){return {schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:'a'.repeat(40),acquiredAtUtc:now,rows:[]};}
test('official evidence stays quarantined, cannot masquerade as original CC0 or training',()=>{
  const e=evidence(),before=structuredClone(e),j=journal(),review=reconcileSupplementalResults(manifest,[{evidence:e,raw}],{originalResults:results(),now});
  assert.equal(review.counts.corroborated,10);assert.equal(review.cohortEligible,false);assert.equal(review.trainingEligible,false);
  assert.throws(()=>evaluateJournal(j,review,{evaluatedAtUtc:now}),/Invalid journal/);assert.deepEqual(e,before);
  assert.equal(evaluateJournal(j,results(),{evaluatedAtUtc:now}).counts.pending,10);
});
test('rights are independent of official authority and publication timestamps',()=>{
  const e=evidence();e.source.rights={status:'unverified'};
  const r=reconcileSupplementalResults(manifest,[{evidence:e,raw}],{now});assert.equal(r.counts.withheld,10);assert.equal(r.rows[0].goals,null);
  assert.deepEqual(r.rows[0].reasons,['rights_not_verified']);
  e.source.rights={status:'authorized'};assert.throws(()=>validateSupplementalEvidence(e,raw,{now}));
});
test('missing, postponed, awarded and rescheduled fixtures are never ordinary final scores',()=>{
  const e=evidence();e.entries=e.entries.slice(0,4);e.entries[0].status='postponed';e.entries[0].goals=null;e.entries[1].status='awarded';e.entries[1].goals=null;
  e.entries[2].kickoffUtc='2026-10-11T13:00:00.000Z';e.entries[2].date='2026-10-11';
  const r=reconcileSupplementalResults(manifest,[{evidence:e,raw}],{now});assert.deepEqual(r.counts,{planned:10,corroborated:1,withheld:3,pending:6});
  assert.ok(r.rows[2].reasons.includes('reschedule_evidence_required'));
});
test('revisions and conflicting original results withhold rather than choose a best source',()=>{
  const a=evidence(),b=evidence();b.entries[0].goals=[2,0];b.source.documentId='correction';
  const o=results();o.rows=[{season:'2026-27',home:'H1',away:'A1',date:'2026-10-10',goals:[0,0]}];
  const r=reconcileSupplementalResults(manifest,[{evidence:a,raw},{evidence:b,raw}],{originalResults:o,now});
  assert.ok(r.rows[0].reasons.includes('source_correction_or_conflict'));assert.ok(r.rows[1].reasons.includes('original_source_conflict'));assert.equal(r.counts.corroborated,8);
});
test('evidence requires raw bytes, exact fixture mapping and nonfuture observation/review',()=>{
  for(const mutate of [e=>e.entries.push(e.entries[0]),e=>e.entries[0].fixtureId='unknown',e=>e.entries[0].home='Wrong',
    e=>e.source.acquiredAtUtc='2026-10-16T00:00:00Z',e=>e.entries[0].reviewedAtUtc='2026-10-12T00:00:00Z',e=>e.source.url='https://evil.example/synthetic.pdf']){
    const e=evidence();mutate(e);let rejected=false;try{const r=reconcileSupplementalResults(manifest,[{evidence:e,raw}],{now});rejected=r.counts.withheld>0;}catch{rejected=true;}assert.equal(rejected,true);
  }
  assert.throws(()=>validateSupplementalEvidence(evidence(),Buffer.from('tampered'),{now}));
});
test('15 October Europe/Rome guard happens before any source request, read or write',async t=>{
  requireG6Due('2026-10-14T22:00:00Z');assert.throws(()=>requireG6Due('2026-10-14T21:59:59.999Z'),/NOT_DUE/);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-results-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let calls=0;
  await assert.rejects(recordOriginalG6(root,{clock:()=>new Date('2026-10-13T00:00:00Z'),capture:()=>{calls++;},inspect:()=>{calls++;}}),/NOT_DUE/);
  assert.equal(calls,0);assert.deepEqual(await fs.readdir(root),[]);
});
test('due check records ten pending and preserves originals, source outage is a dated incomplete check',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-results-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const j=journal(),b={fixtureId:j.entries[0].fixtureId,journalId:j.id,entrySha256:j.entries[0].entrySha256,compatible:true,probabilities:[.4,.3,.3]},original=structuredClone(j);
  const inspect=async()=>({journal:j,baseline:b,fileHashes:{journal:'synthetic-stable',baseline:'synthetic-stable'}}),clock=()=>new Date(now);
  const capture=async()=>({observation:results(),rawFiles:[{name:'it.1.json',bytes:Buffer.from('synthetic')}],requests:[]});
  const r=await recordOriginalG6(root,{clock,capture,inspect});assert.equal(r.record.status,'EVALUATED_WITH_PENDING');assert.equal(r.record.counts.pending,10);
  assert.equal((await readSnapshot(r.evaluationFile)).counts.settled,0);assert.deepEqual(j,original);assert.equal(r.record.supplementalSourceUsed,false);
  const failed=await recordOriginalG6(root,{clock,inspect,capture:()=>{throw new Error('private error must not escape');}});
  assert.equal(failed.record.status,'CHECK_RECORDED_SOURCE_UNAVAILABLE');assert.equal(failed.evaluationFile,null);assert.equal(failed.record.counts.pending,10);
  assert.ok(!(await fs.readFile(failed.recordFile,'utf8')).includes('private error'));
});
test('originals changed during acquisition block scoring and leave durable intent only',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-results-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let count=0;
  await assert.rejects(recordOriginalG6(root,{clock:()=>new Date(now),capture:async()=>({observation:results(),rawFiles:[],requests:[]}),
    inspect:async()=>({journal:journal(),baseline:{},fileHashes:{journal:String(count++)}})}),/ORIGINAL_CHANGED/);
  const base=path.join(root,'.local/model/prospective/checks',journal().id),dirs=await fs.readdir(base);assert.equal(dirs.length,1);
  assert.deepEqual(await fs.readdir(path.join(base,dirs[0])),['intent.json']);
});
test('public acquisition pins one commit and refuses changed license before normalization',async()=>{
  let calls=0;await assert.rejects(captureOriginalResults({season:'2026/27',clock:()=>new Date(now),fetchImpl:async url=>{
    calls++;return new Response(url.endsWith('master')?JSON.stringify({sha:'a'.repeat(40)}):'license changed');}}),/LICENSE/);assert.equal(calls,2);
  assert.equal(CALENDAR_LICENSE_SHA256.length,64);
});
test('source replay before check start cannot create a fresh scientific observation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-results-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const o=results();o.acquiredAtUtc='2026-10-14T00:00:00Z';
  await assert.rejects(recordOriginalG6(root,{clock:()=>new Date(now),inspect:async()=>({journal:journal(),baseline:{},fileHashes:{}}),capture:async()=>({observation:o})}),/STALE_CAPTURE/);
});
test('valid envelopes of a different forecast cannot impersonate the protected original',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-results-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await writeExclusive(path.join(root,G6_PATHS.journal),journal());await writeExclusive(path.join(root,G6_PATHS.baseline),{});
  await assert.rejects(inspectOriginalG6(root,{now}),/G6_ENTRY_INTEGRITY/);
});
