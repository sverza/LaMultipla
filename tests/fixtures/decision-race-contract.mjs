// Test-only: classify a finished race, then verify bounded progress AFTER quiescence.
// This is not a production retry API and must never be imported by scripts/.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {persistDecision,decisionPath,assertNoDecision} from '../../scripts/lib/shadow/pipeline.mjs';
import {readSnapshot,digest} from '../../scripts/lib/prospective/store.mjs';
import {governance} from '../../scripts/lib/decision/governance.mjs';

export const isBusy=e=>e?.constructor===Error&&e.message==='Produttore privato già in esecuzione';
const finalGuard=e=>e?.constructor===Error&&e.code==='EEXIST'
 &&['Final decision already frozen or freeze in progress: no new acquisition or replacement','Final decision already frozen under another policy'].includes(e.message);
export async function verifyCompletedDecisionRace(results,decision,directory){
 assert.equal(results.length,2);
 const winners=results.filter(r=>r.status==='fulfilled'),losers=results.filter(r=>r.status==='rejected');
 const diagnostics=JSON.stringify(losers.map(r=>({name:r.reason?.name,message:r.reason?.message,code:r.reason?.code})));
 assert.ok(winners.length<=1,'Two writers reported success');
 assert.ok(losers.every(r=>isBusy(r.reason)||finalGuard(r.reason)),'Unexpected persistence error: '+diagnostics);
 const before=digest(decision),filename=decisionPath(directory,decision.round.season,decision.round.matchday);
 let saved=winners[0]?.value;
 if(!saved){
  assert.ok(losers.every(r=>isBusy(r.reason)),'No winner without two explicit BUSY rejections');
  await assertNoDecision(filename);
  assert.deepEqual(await fs.readdir(path.join(path.dirname(filename),'locks')),[],'Recovery before lock withdrawal');
  assert.deepEqual((await fs.readdir(path.dirname(filename))).filter(name=>name!=='locks'),[],'Unexpected partial persistence');
  // Exactly ONE fresh, serialized attempt; failure is propagated, never looped.
  saved=await persistDecision(decision,directory);
 }
 assert.equal(saved.filename,filename);
 const persisted=await readSnapshot(filename),expected={...decision,final:true};expected.governance=governance(expected);
 // The public store contract is JSON: undefined object properties are omitted.
 // Compare the entire expected JSON payload, never a permissive subset.
 assert.deepEqual(persisted,JSON.parse(JSON.stringify(expected)));assert.equal(digest(persisted),digest(expected));
 assert.equal(saved.sha256,digest(persisted));assert.equal(digest(decision),before);
 assert.deepEqual(await fs.readdir(path.join(path.dirname(filename),'locks')),[]);
 return {saved,initialWinners:winners.length,recoveredAfterQuiescence:winners.length===0};
}
