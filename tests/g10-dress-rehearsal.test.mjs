import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {makeG10Rehearsal,runG10Rehearsal} from './fixtures/g10-rehearsal.mjs';
test('G10 synthetic dress rehearsal: original 124 fit/bootstraps, safe stop, recovery, fresh synthetic quotes and identical replay',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'SYNTHETIC-G10-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const input=await makeG10Rehearsal(root);
 await assert.rejects(runG10Rehearsal(input,{stopAfterV1:true}),/SAFE_STOP/);
 const [name]=await fs.readdir(path.join(root,'.local/model/prospective/journals')),v1File=path.join(root,'.local/model/prospective/journals',name),before=await fs.readFile(v1File);
 const result=await runG10Rehearsal(input);assert.equal(result.receipt.authenticFreeze,false);assert.equal(result.receipt.expectedRegisteredFitComputations,124);
 assert.ok(result.receipt.timings.v2ms>0);assert.equal(result.report.scope.round,10);assert.equal(result.report.universe.expectedFixtures,10);
 assert.ok(result.report.combinations.length>0);assert.equal(result.report.wholeRoundEvaluated,false);assert.deepEqual(await fs.readFile(v1File),before);
 const receipt=await fs.readFile(path.join(root,'synthetic-receipt.json')),replay=await runG10Rehearsal(input);
 assert.equal(replay.reused,true);assert.deepEqual(replay.report,result.report);assert.deepEqual(await fs.readFile(path.join(root,'synthetic-receipt.json')),receipt);
 const changed=structuredClone(input);changed.dataset.rows[0].goals=[9,9];await assert.rejects(runG10Rehearsal(changed),/CHANGED_INPUT/);
 await assert.rejects(runG10Rehearsal(input,{simulatedNow:'2026-10-31T08:04:00.000Z'}),/BACKWARDS_CLOCK/);
});
test('G10 synthetic dress rehearsal: missing scope and outside-window runs stop before any persistent file',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'SYNTHETIC-G10-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const input=await makeG10Rehearsal(root);
 await assert.rejects(runG10Rehearsal(input,{simulatedNow:'2026-10-31T07:59:59.999Z'}),/OUTSIDE/);assert.deepEqual(await fs.readdir(root),[]);
 await assert.rejects(runG10Rehearsal(input,{simulatedNow:'2026-10-31T11:30:00.000Z'}),/OUTSIDE/);assert.deepEqual(await fs.readdir(root),[]);
 await assert.rejects(runG10Rehearsal({...input,sourceKind:'AUTHENTIC'}),/SANDBOX/);assert.deepEqual(await fs.readdir(root),[]);
});
