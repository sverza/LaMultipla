import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { batchForecast, sealJournal } from '../scripts/lib/prospective/freeze.mjs';
import { writeExclusive, readSnapshot } from '../scripts/lib/prospective/store.mjs';
import { normalizeBoard } from '../scripts/lib/prospective/market.mjs';
import { score1X2, evaluateJournal, progressiveMetrics } from '../scripts/lib/prospective/evaluate.mjs';
const fixture={fixtureId:'synthetic-id',home:'A',away:'B',season:'2021/22',matchday:6,kickoffUtc:'2021-10-10T13:00:00.000Z'};
const manifest={season:'2021/22',matchday:6,events:[fixture]};
const forecasts=[{...fixture,central:[.6,.2,.2],intervals95:[[.5,.7],[.1,.3],[.1,.3]],uncertainty:{replicates:40,sufficient:true},baselines:{empirical:[.4,.3,.3],leaguePoisson:[.45,.3,.25]}}];
function journal(){return sealJournal({model:{converged:true,cutoffUtc:'2021-10-01T00:00:00Z'},forecasts},manifest,{},'2021-10-09T23:00:00.000Z');}
function results(){return {schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',sourceCommit:'a'.repeat(40),license:'CC0-1.0',acquiredAtUtc:'2021-10-12T01:00:00Z',rows:[{season:'2021-22',home:'A',away:'B',date:'2021-10-10',availableAtUtc:'2021-10-12T00:00:00Z',goals:[2,1]}]};}
function board(){return {fixtureId:fixture.fixtureId,home:'A',away:'B',domain:'bet365.it',origin:'manual_bet365_it',reviewer:'synthetic',evidence:'synthetic',
  period:'fulltime',marketName:'Full Time Result',marketType:'1x2',line:0,playerKey:'0',selections:['1','X','2'].map((outcome,i)=>({outcome,price:[2,3,4][i],availability:'available',verifiedAtUtc:'2021-10-09T23:01:00Z',providerFlags:{active:false}}))};}
test('immutable snapshots reject overwrite/concurrent writes and detect tampering',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-prospective-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const filename=path.join(dir,'snapshot.json');
  const attempts=await Promise.allSettled([writeExclusive(filename,{n:1}),writeExclusive(filename,{n:2})]);
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);const saved=await readSnapshot(filename);
  await assert.rejects(writeExclusive(filename,{n:3}),{code:'EEXIST'});assert.deepEqual(await readSnapshot(filename),saved);
  const raw=JSON.parse(await fs.readFile(filename,'utf8'));raw.payload.n=4;await fs.writeFile(filename,JSON.stringify(raw));await assert.rejects(readSnapshot(filename),/hash mismatch/);
});
test('sealing refuses retrospective claims and preserves each original frozen probability',()=>{
  const j=journal();assert.equal(j.counts.prospective,1);assert.equal(j.operationallyApproved,false);
  const copy=structuredClone(j);evaluateJournal(j,results(),{evaluatedAtUtc:'2021-10-12T02:00:00Z'});assert.deepEqual(j,copy);
  const late=sealJournal({model:{converged:true},forecasts},manifest,{},fixture.kickoffUtc);
  assert.equal(late.counts.prospective,0);assert.equal(late.entries[0].probabilities,null);assert.equal(late.entries[0].status,'excluded');
});
test('batch uncertainty uses a fixed monthly original fit, rejects target results and excludes unknown teams',()=>{
  const rows=Array.from({length:160},(_,i)=>({season:'2020-21',date:'2021-03-01',availableAtUtc:'2021-03-03T00:00:00Z',home:i%2?'A':'B',away:i%2?'B':'A',goals:[i%4,(i*7)%3]}));
  const m={...manifest,events:[fixture,{...fixture,fixtureId:'unknown',home:'UNKNOWN'}]};
  const before=structuredClone(rows),b=batchForecast(rows,'2021-10-01T00:00:00Z',m);
  assert.equal(b.model.cutoffUtc,'2021-10-01T00:00:00Z');assert.equal(b.forecasts[0].uncertainty.replicates,40);assert.equal(b.forecasts[1].central,null);assert.deepEqual(rows,before);
  const polluted=[...rows,{...rows[0],season:'2021-22',home:'A',away:'B'}];assert.throws(()=>batchForecast(polluted,'2021-10-01T00:00:00Z',manifest),/Target result/);
});
test('result scoring waits for observed final data, guards reschedules and missing/duplicate scores',()=>{
  const j=journal(),r=results(),e=evaluateJournal(j,r,{evaluatedAtUtc:'2021-10-12T02:00:00Z'});
  assert.ok(Math.abs(e.records[0].scores.model.logLoss+Math.log(.6))<1e-12);assert.ok(Math.abs(e.records[0].scores.model.brier-.24)<1e-12);
  assert.equal(e.records[0].scores.model.assignedProbability,.6);assert.equal(e.counts.settled,1);
  const missing=structuredClone(r);missing.rows=[];assert.equal(evaluateJournal(j,missing,{evaluatedAtUtc:'2021-10-12T02:00:00Z'}).counts.pending,1);
  const wrong=structuredClone(r);wrong.rows[0].date='2021-10-11';assert.equal(evaluateJournal(j,wrong,{evaluatedAtUtc:'2021-10-12T02:00:00Z'}).counts.pending,1);
  const duplicate=structuredClone(r);duplicate.rows.push(r.rows[0]);assert.throws(()=>evaluateJournal(j,duplicate,{evaluatedAtUtc:'2021-10-12T02:00:00Z'}));
  assert.throws(()=>score1X2([.9,.2,.1],0));
});
test('market baseline removes declared proportional margin on complete verified 1X2 only',()=>{
  const j=journal(),entry=j.entries[0],b=board(),before=structuredClone(b),m=normalizeBoard(b,entry,j.id,'2021-10-09T23:02:00Z');
  assert.ok(Math.abs(m.probabilities[0]-6/13)<1e-12);assert.ok(Math.abs(m.overround-1/12)<1e-12);assert.equal(m.compatible,true);assert.deepEqual(b,before);
  assert.equal(m.originalProviderFlagsPreserved[0].active,false);
  for(const change of [b=>{b.domain='bet365.com';},b=>{b.selections.pop();},b=>{b.selections[0].price=null;},
    b=>{b.selections[0].availability='unavailable';},b=>{b.period='firsthalf';},b=>{b.selections[0].verifiedAtUtc='2021-10-11T00:00:00Z';}]){
    const bad=board();change(bad);assert.throws(()=>normalizeBoard(bad,entry,j.id,'2021-10-09T23:02:00Z'));
  }
});
test('market comparisons use the exact paired subset and source corrections never silently replace scores',()=>{
  const j=journal(),r=results(),m=normalizeBoard(board(),j.entries[0],j.id,'2021-10-09T23:02:00Z');
  const e=evaluateJournal(j,r,{evaluatedAtUtc:'2021-10-12T02:00:00Z',markets:[m]});assert.equal(e.marketComparison.n,1);assert.equal(e.marketComparison.model.n,1);
  const copy=structuredClone(r);copy.rows[0].goals=[0,2];
  const revision=evaluateJournal(j,copy,{evaluatedAtUtc:'2021-10-13T02:00:00Z'}),progress=progressiveMetrics([j],[e,revision]);
  assert.equal(progress.conflicts.length,1);assert.equal(progress.rounds[0].scored,0);
});

test('invalid clocks and missing result provenance cannot silently pass comparisons',()=>{
  const j=journal(),r=results();r.acquiredAtUtc='invalid';assert.throws(()=>evaluateJournal(j,r));
  const missing=results();delete missing.sourceCommit;assert.throws(()=>evaluateJournal(j,missing));
  const badTime=results();badTime.rows[0].availableAtUtc='invalid';assert.equal(evaluateJournal(j,badTime,{evaluatedAtUtc:'2021-10-12T02:00:00Z'}).counts.settled,0);
  assert.throws(()=>normalizeBoard(board(),j.entries[0],j.id,'invalid'));
});
