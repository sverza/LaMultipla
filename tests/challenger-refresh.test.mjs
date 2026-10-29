import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../scripts/lib/prospective/store.mjs';
import {REFRESH_POLICY,buildRefreshDataset,challengerDraft,runSyntheticRefresh} from '../scripts/lib/challenger-refresh/index.mjs';

function synthetic(){
 const teams=Array.from({length:20},(_,i)=>`Synthetic ${i}`),rows=[];
 for(let home=0;home<20;home++)for(let away=0;away<20;away++)if(home!==away){const i=rows.length;
  rows.push({key:`2025-26:${teams[home]}:${teams[away]}`,season:'2025-26',date:new Date(Date.UTC(2025,6,1)+Math.floor(i/10)*7*86400000).toISOString().slice(0,10),
   availableAtUtc:new Date(Date.UTC(2025,6,3)+Math.floor(i/10)*7*86400000).toISOString(),home:teams[home],away:teams[away],goals:[i%4,(i*7)%3]});}
 const records=[],events=[];
 for(const day of [6,7])for(let i=0;i<10;i++){
  const home=teams[i],away=teams[10+(i+day)%10],fixtureId=`synthetic-${day}-${i}`,kickoffUtc=`2026-10-${day===6?'04':'17'}T13:00:00.000Z`;
  const e={fixtureId,season:'2026-27',matchday:day,home,away,kickoffUtc};events.push(e);
  records.push({...e,goals:[i%3,(i+1)%3],status:'FINISHED',duration:'REGULAR',awarded:false,revisionConflict:false,
   observedAtUtc:'2026-10-20T10:00:00.000Z',verifiedAtUtc:'2026-10-20T11:00:00.000Z'});
 }
 return {base:{schema:'lamultipla-refresh-base-v1',sourceId:'openfootball',license:'CC0-1.0',synthetic:true,acquiredAtUtc:'2026-10-20T10:00:00.000Z',snapshotSha256:digest(rows),rowsSha256:digest(rows),rows},
  supplement:{schema:'lamultipla-refresh-supplement-v1',sourceId:'synthetic-approved-source',synthetic:true,snapshotSha256:digest(records),recordsSha256:digest(records),acquiredAtUtc:'2026-10-20T10:00:00.000Z',records,
   reconciliation:{status:'VERIFIED',recordsSha256:digest(records),manifestSha256:digest(events),events}},
  approval:{schema:'lamultipla-source-training-approval-v1',status:'APPROVED',sourceId:'synthetic-approved-source',privateTrainingPermitted:true,privateSnapshotRetentionPermitted:true,
   termsEvidenceSha256:digest('synthetic-terms-not-real-rights'),userApprovalEvidenceSha256:digest('synthetic-approval-not-real-authorization'),approvedAtUtc:'2026-10-20T09:00:00.000Z'},
  plan:{schema:'lamultipla-refresh-plan-draft-v1',registrationStatus:'DRAFT_REQUIRES_APPROVAL',realForecastAuthorized:false,createdAtUtc:'2026-10-21T09:00:00.000Z',cutoffUtc:'2026-10-21T00:00:00.000Z',season:'2026-27',targetMatchday:8,
   targetEvents:Array.from({length:10},(_,i)=>({fixtureId:`synthetic-target-${i}`,home:teams[i],away:teams[10+(i+8)%10],kickoffUtc:'2026-10-23T18:45:00.000Z'}))}};
}
function sealSupplement(s){s.supplement.recordsSha256=digest(s.supplement.records);s.supplement.reconciliation.recordsSha256=s.supplement.recordsSha256;}

test('refresh dataset is separate, deterministic, exactly twenty source results and never modifies inputs',async()=>{
 const s=synthetic(),before=digest(s),a=buildRefreshDataset(s),b=buildRefreshDataset(s);
 assert.deepEqual(a,b);assert.equal(digest(s),before);assert.equal(a.rows.length,400);assert.equal(a.verifiedSupplementaryResults,20);
 assert.equal(a.sourceClass,'MIXED_ORIGINAL_AND_APPROVED_SUPPLEMENT_NEVER_ORIGINAL_CC0');assert.notEqual(a.datasetSha256,s.base.rowsSha256);
 const d=await challengerDraft(s.plan);assert.equal(d.status,'DRAFT_REQUIRES_APPROVAL');assert.equal(d.policy.realForecastEnabled,false);
 assert.ok(d.code.files.some(f=>f.path==='lib/goals/model.mjs'));assert.equal(d.code.sha256,digest(d.code.files));
});

test('unapproved source, missing training rights, unsigned evidence and late source observations block before fit',()=>{
 for(const change of [s=>s.approval.status='PENDING',s=>s.approval.privateTrainingPermitted=false,s=>delete s.approval.userApprovalEvidenceSha256,
  s=>s.approval.privateSnapshotRetentionPermitted=false,s=>s.supplement.acquiredAtUtc='2026-10-22T00:00:00.000Z',
  s=>s.base.acquiredAtUtc='2026-10-22T00:00:00.000Z',s=>s.approval.approvedAtUtc='2026-10-22T00:00:00.000Z']){
  const s=synthetic();change(s);assert.throws(()=>buildRefreshDataset(s));
 }
});

test('missing, duplicate, revised, ambiguous and non-regulation supplementary results fail closed',()=>{
 for(const change of [s=>s.supplement.records.pop(),s=>s.supplement.records[1]={...s.supplement.records[0]},
  s=>s.supplement.records[0].home=s.supplement.records[0].away,s=>s.supplement.records[0].revisionConflict=true,
  s=>s.supplement.records[0].awarded=true,s=>s.supplement.records[0].duration='EXTRA_TIME',s=>s.supplement.records[0].status='IN_PLAY',
  s=>s.supplement.records[0].verifiedAtUtc='2026-10-21T00:00:00.000Z',s=>s.supplement.records[0].goals=[null,0],
  s=>s.supplement.reconciliation.status='PENDING',s=>s.supplement.records[0].kickoffUtc='2026-10-03T13:00:00.000Z']){
  const s=synthetic();change(s);sealSupplement(s);assert.throws(()=>buildRefreshDataset(s));
 }
});

test('future rows, target-event leakage, original/source overlap, bookmaker inputs and hash mismatch are rejected',()=>{
 for(const change of [s=>s.base.rows[0].availableAtUtc=s.plan.cutoffUtc,
  s=>Object.assign(s.base.rows[0],{season:s.plan.season,home:s.plan.targetEvents[0].home,away:s.plan.targetEvents[0].away}),
  s=>s.base.rows.push({...s.base.rows[0],key:'duplicate'}),s=>s.base.rows[0].price=2,
  s=>s.plan.targetEvents[0].kickoffUtc=s.plan.cutoffUtc]){
  const s=synthetic();change(s);s.base.rowsSha256=digest(s.base.rows);assert.throws(()=>buildRefreshDataset(s));
 }
 const broken=synthetic();broken.supplement.records[0].goals=[9,9];assert.throws(()=>buildRefreshDataset(broken));
});

test('observed data cannot run forecast; fixed configuration and identity cannot claim improvement',async()=>{
 const s=synthetic();s.base.synthetic=false;await assert.rejects(runSyntheticRefresh(s),/REAL_FORECAST_NOT_AUTHORIZED/);
 assert.ok(Object.isFrozen(REFRESH_POLICY));assert.equal(REFRESH_POLICY.rho,-.1);assert.equal(REFRESH_POLICY.bootstrapReplicates,40);
 const a=await challengerDraft(s.plan);s.plan.cutoffUtc='2026-10-20T23:00:00.000Z';const b=await challengerDraft(s.plan);assert.notEqual(a.id,b.id);
});

test('synthetic challenger runs forty weekly bootstrap fits with deterministic intervals and retained null improvement',async()=>{
 const s=synthetic(),before=digest(s),a=await runSyntheticRefresh(s),b=await runSyntheticRefresh(s);
 assert.deepEqual(a,b);assert.equal(digest(s),before);assert.equal(a.entries.length,10);assert.equal(a.fit.converged,true);
 assert.equal(a.fit.config.rho,-.1);assert.equal(a.bootstrap.replicates,40);assert.equal(a.eligibleForSelector,false);
 assert.equal(a.modelIdentity.datasetSha256,a.datasetSha256);assert.equal(a.modelId,`${REFRESH_POLICY.version}-${digest(a.modelIdentity).slice(0,24)}`);
 assert.equal(a.comparisonConclusion,'NOT_EVALUATED_NO_CLAIM_OF_IMPROVEMENT');assert.equal(a.retainRegardlessOfOutcome,true);
 assert.equal(a.entries.filter(e=>e.status==='synthetic_research_only').length,10);
 for(const e of a.entries){assert.equal(e.uncertainty.sufficient,true);assert.ok(e.bootstrapGrids.length>=36&&e.bootstrapGrids.length<=40);
  assert.equal(e.uncertainty.failures,40-e.bootstrapGrids.length);
  assert.ok(Math.abs(e.probabilities.oneXTwo.reduce((x,y)=>x+y,0)-1)<1e-10);
  assert.ok(e.intervals.btts.every(p=>p>=0&&p<=1));assert.ok(e.intervals.btts[0]<=e.intervals.btts[1]);}
});

test('insufficient team history and excessive bootstrap exclusions do not produce usable target entries',async()=>{
 const s=synthetic();s.base.rows=s.base.rows.filter(r=>!r.home.endsWith(' 0')&&!r.away.endsWith(' 0'));
 s.base.rowsSha256=digest(s.base.rows);s.base.snapshotSha256=s.base.rowsSha256;
 const out=await runSyntheticRefresh(s),entry=out.entries.find(e=>e.home==='Synthetic 0');
 assert.equal(entry.status,'excluded');assert.equal(entry.grid,null);assert.equal(entry.intervals,null);
 assert.ok(entry.reasons.includes('FIT_HISTORY_OR_GRID_INSUFFICIENT'));assert.equal(entry.uncertainty.sufficient,false);
 assert.equal(entry.uncertainty.failures,40);assert.equal(out.retainRegardlessOfOutcome,true);
});
