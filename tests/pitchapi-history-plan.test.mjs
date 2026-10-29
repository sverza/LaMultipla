import test from 'node:test';
import assert from 'node:assert/strict';
import {pitchHistoryDiscoveryPlan,selectPitchHistorySamples} from '../scripts/lib/pitchapi-history-plan.mjs';
const observedAtUtc='2026-10-21T18:00:00Z';
const fixture=(i,status='finished')=>({id:'m_'+String(i).padStart(6,'0'),time_utc:`2026-09-${String(i).padStart(2,'0')}T18:00:00Z`,home_team:{id:'t_000001',name:'Home'},away_team:{id:'t_'+String(i+1).padStart(6,'0'),name:'Away '+i},status,score_home:0,score_away:0});
const data=()=>({league:{id:'l_0ALvwF',season:'2026/2027'},matches:Array.from({length:6},(_,i)=>fixture(i+1))});
const select=d=>selectPitchHistorySamples(d,{season:'2026/2027',observedAtUtc});
test('history plan fixes five discovery requests, later approval gate and unused reserve within thirty',()=>{
 const p=pitchHistoryDiscoveryPlan();assert.equal(p.requests.length,5);assert.equal(p.plannedNewTotal+p.reserveUnallocated,30);assert.equal(p.plannedNewTotal,5+17+2);
 assert.equal(p.authorized,false);assert.equal(p.automaticRetries,false);assert.equal(p.pagination,false);assert.equal(p.trainingEligible,false);
 assert.ok(p.requests.every(r=>r.url.startsWith('https://api.pitchapi.dev/v1/leagues/l_0ALvwF/matches?season=')&&r.url.endsWith('&status=all')));
 assert.equal(p.requests.filter(r=>r.reservePurpose).length,1);
});
test('history sampling is deterministic, spread in time and independent of response ordering and statistical completeness',()=>{
 const d=data(),a=select(d);assert.deepEqual(a.samples.map(s=>s.rank),[1,3,6]);
 const b=select({...d,matches:[...d.matches].reverse()});assert.deepEqual(a.samples,b.samples);
 d.matches[2].statisticsAvailable=false;d.matches[2].score_home=5;assert.deepEqual(select(d).samples,a.samples);
 assert.equal(a.statisticsCoverageNotInferred,true);assert.equal(a.samples.length,3);
});
test('history sampling never chooses a future or nonfinished fixture',()=>{
 const d=data();d.matches.push({...fixture(7,'not_started'),time_utc:'2026-10-23T18:45:00Z',score_home:null,score_away:null});
 assert.equal(select(d).completed,6);assert.equal(select(d).listed,7);assert.ok(!select(d).samples.some(s=>s.fixtureId==='m_000007'));
 d.matches.at(-1).status='finished';assert.throws(()=>select(d),/FINISHED_IN_FUTURE/);
});
test('history sampling rejects duplicate IDs, invalid identities/times and selected missing scores without replacing them',()=>{
 for(const mutate of [d=>d.matches.push(d.matches[0]),d=>d.matches[0].home_team.id='bad',d=>d.matches[0].time_utc='bad',d=>d.matches[0].score_home=null,d=>d.league.season='2025/2026']){
  const d=data();mutate(d);assert.throws(()=>select(d),/PITCH_HISTORY_/);
 }
});
test('history sampling exposes repeated team pairs without silently collapsing postponed or duplicate fixtures',()=>{
 const d=data();d.matches[1].away_team=d.matches[0].away_team;
 assert.equal(select(d).listed,6);assert.equal(select(d).issues.length,1);
});
