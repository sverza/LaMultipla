import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRoundDraft,romeInstant,draftReferenceCohort,assessReferenceData} from '../scripts/lib/g8-preparation.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
function input(){const publicData={name:'Italian Serie A 2026/27',matches:Array.from({length:10},(_,i)=>({round:'Matchday 8',date:i?'2026-10-25':'2026-10-23',time:'20:45',team1:'Home '+i,team2:'Away '+i}))};return {publicData,source:{rawSha256:'a'.repeat(64),parsedSha256:digest(publicData),acquiredAtUtc:'2026-10-21T10:00:00Z'},season:'2026/27',matchday:8,now:'2026-10-21T12:00:00Z'};}
test('G8 preparation retains missing IDs as null, never manufactures a usable schedule or freshness',()=>{
 const v=input(),before=digest(v),d=prepareRoundDraft(v);assert.equal(digest(v),before);assert.equal(d.providerIdsPresent,0);assert.ok(d.events.every(e=>e.fixtureId===null));assert.equal(d.executableSchedule,false);
 assert.equal(d.originalWindow.opensAtUtc,'2026-10-23T12:45:00.000Z');assert.equal(d.originalWindow.closesAtUtc,'2026-10-23T16:15:00.000Z');assert.equal(d.officialConfirmation,null);
});
test('Rome DST, ambiguous and nonexistent local times are handled explicitly',()=>{
 assert.equal(romeInstant('2026-10-23','20:45'),'2026-10-23T18:45:00.000Z');assert.equal(romeInstant('2026-10-25','20:45'),'2026-10-25T19:45:00.000Z');
 assert.throws(()=>romeInstant('2026-10-25','02:30'),/AMBIGUOUS/);assert.throws(()=>romeInstant('2026-03-29','02:30'),/NONEXISTENT/);
});
test('ambiguous fixture mapping, incomplete calendar and altered source are rejected or withheld',()=>{
 const s=input();s.publicData.matches.pop();s.source.parsedSha256=digest(s.publicData);assert.throws(()=>prepareRoundDraft(s),/TEN_DISTINCT/);
 const v=input();v.source.parsedSha256='b'.repeat(64);assert.throws(()=>prepareRoundDraft(v),/SOURCE_INVALID/);
 const f=input(),q={fixtureId:'id123',sportId:10,tournamentId:23,statusId:0,participant1Name:'Home 0',participant2Name:'Away 0',startTime:'2026-10-23T18:45:00Z'};
 assert.equal(prepareRoundDraft({...f,providerFixtures:[q,q]}).providerIdsPresent,0);
});
test('proposed reference frame has explicit 60 rounds/600 events and never activates or repairs G7',()=>{
 const d=prepareRoundDraft(input()),c=draftReferenceCohort(d,{studyV1Sha256:'a'.repeat(64),studyV2Sha256:'b'.repeat(64),now:'2026-10-21T12:00:00Z'});
 assert.equal(c.plannedRounds.length,60);assert.deepEqual(c.plannedRounds.at(-1),{season:'2027/28',matchday:29,expectedEvents:10});assert.equal(c.active,false);assert.equal(c.originalCohortChanged,false);assert.equal(c.supplementalResultsAllowed,false);
});
test('reference readiness excludes post-cutoff target results and reports stale observation/history gaps',()=>{
 const draft=prepareRoundDraft(input()),dataset={schema:'lamultipla-results-dataset-v1',source:'openfootball/football.json',license:'CC0-1.0',licenseSha256:'36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673',commit:'a'.repeat(40),acquiredAtUtc:'2026-10-10T00:00:00Z',cutoffUtc:'2026-10-09T00:00:00Z',files:[{path:'2026-27/it.1.json',sha256:'a'.repeat(64)}],rows:[]};
 const q=assessReferenceData(dataset,draft,{now:'2026-10-21T12:00:00Z'});assert.equal(q.historySufficient,false);assert.equal(q.datasetObservationFresh,false);assert.equal(q.fitExecuted,false);
});
