import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ROOT} from '../scripts/lib/private-store.mjs';
import {digest,readSnapshot,writeExclusive} from '../scripts/lib/prospective/store.mjs';
import {freezeReferenceSeries,validateSeriesApproval,referenceWindow} from '../scripts/lib/reference-series.mjs';
const schedule={events:Array.from({length:10},(_,i)=>({fixtureId:'synthetic-'+i,home:'H'+i,away:'A'+i,kickoffUtc:'2026-10-23T18:45:00Z'}))};
test('reference freeze is blocked without both explicit approvals and outside original window',()=>{
 assert.throws(()=>validateSeriesApproval({},null,new Date()),/APPROVAL/);
 assert.throws(()=>referenceWindow(schedule,'2026-10-23T12:44:59Z'),/OUTSIDE/);assert.throws(()=>referenceWindow(schedule,'2026-10-23T16:15:00Z'),/OUTSIDE/);
 assert.equal(referenceWindow(schedule,'2026-10-23T12:45:00Z').closesAtUtc,'2026-10-23T16:15:00.000Z');
});
test('isolated reference transaction reuses completed journals after crash without rewriting old cohorts',async()=>{
 const root=path.join(ROOT,'.local/tests/reference-series-'+crypto.randomUUID()),proposal={id:'reference-g8-20261023-v1'},input={root,proposal,schedule,registry:{},dataset:{synthetic:true},study:{synthetic:true},calendar:{synthetic:true}};
 let v1=0,v2=0;const clock=()=>new Date('2026-10-23T13:00:00Z'),preflight=async()=>({synthetic:true});
 const freezeV1=async({root})=>{v1++;assert.ok(root.includes('research-review'));const filename=path.join(root,'synthetic-v1.json'),journal={synthetic:true,kind:'v1'};await writeExclusive(filename,journal);return {filename,journal};};
 const freezeV2=async({root})=>{v2++;const filename=path.join(root,'synthetic-v2.json'),journal={synthetic:true,kind:'v2'};await writeExclusive(filename,journal);return {filename,journal};};
 const first=await freezeReferenceSeries(input,{clock,preflight,freezeV1,freezeV2});const second=await freezeReferenceSeries(input,{clock,preflight,freezeV1,freezeV2});
 assert.equal(v1,1);assert.equal(v2,1);assert.equal(second.reused,true);assert.equal(first.oldCohortChanged,false);assert.equal(first.deliveryExecuted,false);
 const receipt=await readSnapshot(path.join(root,'.local/research-review/cohorts/reference-g8-20261023-v1/freeze-receipt.json'));assert.equal(receipt.v1.sha256,digest({synthetic:true,kind:'v1'}));
});
