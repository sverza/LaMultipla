import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {ROOT} from '../scripts/lib/private-store.mjs';
import {digest,writeExclusive} from '../scripts/lib/prospective/store.mjs';
import {auditOriginalAvailability,auditRoundContinuity} from '../scripts/lib/results-lab/quality.mjs';
import {evaluateSyntheticPairs} from '../scripts/lib/results-lab/prototype.mjs';
import {syntheticResultsLab} from './fixtures/results-lab.mjs';
const audit=s=>auditOriginalAvailability(s.manifest,s.observation,{now:s.now});
test('original source QA reports availability without scoring or changing any input',()=>{
 const s=syntheticResultsLab(),before=digest(s),q=audit(s);assert.equal(q.counts.available,10);assert.equal(q.evaluationExecuted,false);assert.equal(digest(s),before);
});
test('missing, duplicate, reversed and rescheduled original results remain pending or withheld',()=>{
 const s=syntheticResultsLab();s.observation.rows.pop();s.observation.rows.push({...s.observation.rows[0]});s.observation.rows[2].date='2026-10-24';s.observation.rows[2].availableAtUtc='2026-10-26T00:00:00Z';
 [s.observation.rows[4].home,s.observation.rows[4].away]=[s.observation.rows[4].away,s.observation.rows[4].home];const r=audit(s);
 assert.equal(r.counts.pendingOrWithheld,4);assert.ok(r.rows[0].reasons.includes('DUPLICATE_OR_CONFLICTING_RESULT'));assert.ok(r.rows[2].reasons.includes('DATE_MISMATCH_RESCHEDULE_EVIDENCE_REQUIRED'));
});
test('source changes, reversions and removal never silently select the latest result',()=>{
 const s=syntheticResultsLab(),previous=structuredClone(s.observation);previous.acquiredAtUtc='2026-10-25T12:00:00Z';previous.rows[0].goals=[0,0];
 s.observation.rows.pop();const q=auditOriginalAvailability(s.manifest,s.observation,{previous:[previous],now:s.now});
 assert.ok(q.rows[0].reasons.includes('SOURCE_REVISION_REQUIRES_REVIEW'));assert.ok(q.rows[9].reasons.includes('PREVIOUS_RESULT_REMOVED'));
});
test('unobserved date+48h, invalid scores, future timestamps and alternate source are rejected appropriately',()=>{
 const s=syntheticResultsLab();s.observation.acquiredAtUtc='2026-10-24T12:00:00Z';assert.equal(audit(s).counts.available,0);
 for(const change of [s=>s.observation.source='cornerflick',s=>s.observation.rows[0].goals=[null,0],s=>s.observation.acquiredAtUtc='2026-11-01T00:00:00Z',s=>s.observation.rows[0].availableAtUtc='2026-10-24T00:00:00Z']){const v=syntheticResultsLab();change(v);assert.throws(()=>audit(v));}
});
test('explicit round frame retains a missed round and cannot silently reanchor or bridge it',()=>{
 const planned=[6,7,8].map((matchday,i)=>({season:'2026/27',matchday,freezeDeadlineUtc:`2026-10-${10+7*i}T16:15:00Z`}));
 const journals=[{season:'2026/27',matchday:6,generatedAtUtc:'2026-10-10T06:00:00Z',journalSha256:'a'.repeat(64),prospectiveOriginal:true}];
 const q=auditRoundContinuity(planned,journals,{now:'2026-10-21T12:00:00Z'});assert.equal(q.missed,1);assert.equal(q.rounds[1].state,'MISSED_ORIGINAL_WINDOW');assert.equal(q.confirmationBlocked,true);assert.equal(q.frameReanchored,false);
 assert.throws(()=>auditRoundContinuity([planned[0],planned[2]],journals),/NONCONSECUTIVE/);
});
test('late, nonoriginal and duplicate journal metadata cannot satisfy continuity; season rollover is explicit',()=>{
 const p=[{season:'2026/27',matchday:38,freezeDeadlineUtc:'2027-05-23T12:00:00Z'},{season:'2027/28',matchday:1,freezeDeadlineUtc:'2027-08-22T12:00:00Z'}],j={...p[0],generatedAtUtc:'2027-05-23T12:01:00Z',prospectiveOriginal:true,journalSha256:'a'.repeat(64)};
 assert.equal(auditRoundContinuity(p,[j],{now:'2027-06-01T00:00:00Z'}).rounds[0].state,'LATE_OR_NONORIGINAL_JOURNAL');
 assert.equal(auditRoundContinuity(p,[j,j],{now:'2027-06-01T00:00:00Z'}).rounds[0].state,'AMBIGUOUS_JOURNALS');
});
test('synthetic paired review preserves poor challengers and exact proper scores on the same events',()=>{
 const s=syntheticResultsLab(),before=digest(s),q=evaluateSyntheticPairs(s);assert.equal(digest(s),before);
 assert.equal(q.markets.oneXTwo.n,10);assert.ok(Math.abs(q.markets.oneXTwo.scores.reference.logLoss+Math.log(.6))<1e-12);
 assert.ok(Math.abs(q.markets.oneXTwo.scores.reference.brier-.24)<1e-12);assert.ok(Math.abs(q.markets.btts.scores.reference.brier-.09)<1e-12);
 assert.ok(q.markets.oneXTwo.differencesFromReference.challenger.logLoss>0);assert.equal(q.models.length,3);assert.equal(q.cohortEligible,false);assert.equal(q.modelUpdated,false);
});
test('market-specific common event set excludes missing probabilities without hiding coverage',()=>{
 const s=syntheticResultsLab();delete s.forecasts.entries[0].probabilities.challenger.over;const q=evaluateSyntheticPairs(s);
 assert.equal(q.markets.over.n,9);assert.equal(q.markets.oneXTwo.n,10);assert.equal(q.markets.over.missing.length,1);assert.equal(q.markets.over.scores.reference.n,q.markets.over.scores.challenger.n);
});
test('conflicting, non-FT and unauthorized evidence is withheld with null metrics, never recoded as loss',()=>{
 for(const change of [e=>e.source.rights.status='unverified',e=>e.entries.forEach(r=>{r.status='awarded';r.goals=null;})]){
  const s=syntheticResultsLab();change(s.observations[0].evidence);const q=evaluateSyntheticPairs(s);assert.equal(q.markets.oneXTwo.n,0);assert.equal(q.markets.oneXTwo.scores.reference,null);assert.equal(q.excluded.length,10);
 }
 const s=syntheticResultsLab(),other=structuredClone(s.observations[0].evidence);other.entries[0].goals=[0,0];s.observations.push({evidence:other,raw:s.observations[0].raw});assert.equal(evaluateSyntheticPairs(s).markets.oneXTwo.n,9);
});
test('prototype refuses real journals, tampered raw bytes, retrospective forecasts and unregistered challengers',()=>{
 for(const change of [s=>s.forecasts.sourceData='observed_original_results',s=>s.manifest.synthetic=false,s=>s.observations[0].raw=Buffer.from('wrong'),s=>s.forecasts.entries[0].generatedAtUtc='2026-10-24T00:00:00Z',s=>s.forecasts.models[1].registeredAtUtc='2026-10-24T00:00:00Z',s=>s.forecasts.entries[0].probabilities.reference.btts=2]){
  const s=syntheticResultsLab();change(s);assert.throws(()=>evaluateSyntheticPairs(s));
 }
});
test('readonly CLI verifies private envelopes and refuses alternate sources without producing evaluations',async()=>{
 const s=syntheticResultsLab(),dir=path.join(ROOT,'.local/tests/results-lab-'+crypto.randomUUID()),manifest=dir+'/manifest.json',observation=dir+'/observation.json';
 const kickoff=new Date(Date.now()-5*86400000).toISOString(),date=kickoff.slice(0,10);s.manifest.events.forEach(e=>e.kickoffUtc=kickoff);
 s.observation.acquiredAtUtc=new Date(Date.now()-86400000).toISOString();s.observation.rows.forEach(r=>{r.date=date;r.availableAtUtc=new Date(Date.parse(date)+48*3600000).toISOString();});
 await writeExclusive(manifest,s.manifest);await writeExclusive(observation,s.observation);
 const run=promisify(execFile),r=await run(process.execPath,['scripts/results-lab.mjs','--audit-cc0','--manifest',manifest,'--observation',observation],{cwd:ROOT});
 const output=JSON.parse(r.stdout);assert.equal(output.evaluationExecuted,false);assert.equal(output.counts.available,10);
 const invalid=dir+'/invalid.json';await writeExclusive(invalid,{...s.observation,source:'cornerflick'});
 await assert.rejects(run(process.execPath,['scripts/results-lab.mjs','--audit-cc0','--manifest',manifest,'--observation',invalid],{cwd:ROOT}));
});
