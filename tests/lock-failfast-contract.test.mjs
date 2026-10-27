import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {referenceScreenFixture} from './fixtures/reference-screen.mjs';
import {forceMutualWithdrawal} from './fixtures/lock-failfast-schedule.mjs';
import {verifyCompletedDecisionRace,isBusy} from './fixtures/decision-race-contract.mjs';
import {persistDecision,decisionPath} from '../scripts/lib/shadow/pipeline.mjs';
import {readSnapshot,digest} from '../scripts/lib/prospective/store.mjs';

async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-failfast-contract-'));t.after(async()=>{
 const resolved=await fs.realpath(dir),base=await fs.realpath(os.tmpdir());assert.ok(resolved.startsWith(base+path.sep));await fs.rm(resolved,{recursive:true,force:true});
});return dir;}

test('real filesystem mutual withdrawal has zero winners, then exactly one unchanged final after quiescence',async t=>{
 const dir=await setup(t),d=referenceScreenFixture('no_value').bundle.decision,filename=decisionPath(dir,d.round.season,d.round.matchday);
 await fs.mkdir(path.dirname(filename),{recursive:true});const before=digest(d);
 const run=await forceMutualWithdrawal(path.dirname(filename),()=>persistDecision(d,dir));
 assert.equal(run.results.filter(r=>r.status==='fulfilled').length,0);
 assert.ok(run.results.every(r=>r.status==='rejected'&&isBusy(r.reason)));
 assert.equal(run.trace.filter(e=>e.event==='other_owner_observed'&&e.choosing===true&&e.ticketExists===false).length,2);
 await assert.rejects(fs.stat(filename),{code:'ENOENT'});assert.deepEqual(await fs.readdir(path.join(path.dirname(filename),'locks')),[]);
 const race=await verifyCompletedDecisionRace(run.results,d,dir);assert.equal(race.initialWinners,0);assert.equal(race.recoveredAfterQuiescence,true);
 const persisted=await fs.readFile(filename),snapshot=await readSnapshot(filename);assert.equal(snapshot.final,true);
 await assert.rejects(persistDecision(d,dir),{code:'EEXIST'});assert.ok(persisted.equals(await fs.readFile(filename)));assert.equal(digest(d),before);
 const preview=await persistDecision(d,dir,{preview:true});assert.equal(preview.decision.governance.phases[10].state,'PREVIEW_NOT_FINAL');
 assert.ok(persisted.equals(await fs.readFile(filename)));t.diagnostic(JSON.stringify({controlledBusyRejections:2,finals:1,sourceUnchanged:true}));
});

test('race verification rejects two successes, permissions, cleanup errors, residual locks and partial effects',async t=>{
 const d=referenceScreenFixture('no_value').bundle.decision;
 const busy=()=>new Error('Produttore privato già in esecuzione'),rejected=reason=>({status:'rejected',reason});
 for(const results of [[{status:'fulfilled',value:{}},{status:'fulfilled',value:{}}],
  [rejected(Object.assign(Error('ACCESS_DENIED'),{code:'EPERM'})),rejected(busy())],
  [rejected(new AggregateError([busy()],'Rilascio lock non verificato')),rejected(busy())]]){
  const dir=await setup(t);await assert.rejects(verifyCompletedDecisionRace(results,d,dir));assert.deepEqual(await fs.readdir(dir),[]);
 }
 for(const effect of ['residual','partial']){const dir=await setup(t),filename=decisionPath(dir,d.round.season,d.round.matchday),locks=path.join(path.dirname(filename),'locks');await fs.mkdir(locks,{recursive:true});
  const file=path.join(effect==='residual'?locks:path.dirname(filename),effect==='residual'?'SYNTHETIC_OTHER_OWNER.json':'SYNTHETIC_PARTIAL.tmp');
  await fs.writeFile(file,'SYNTHETIC_PRESERVE');await assert.rejects(verifyCompletedDecisionRace([rejected(busy()),rejected(busy())],d,dir));
  assert.equal(await fs.readFile(file,'utf8'),'SYNTHETIC_PRESERVE');await assert.rejects(fs.stat(filename),{code:'ENOENT'});
 }
});
