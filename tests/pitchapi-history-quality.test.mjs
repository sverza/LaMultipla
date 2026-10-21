import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePitchTeamSeason,reviewPitchLineup} from '../scripts/lib/pitchapi-history-quality.mjs';
const fixture={id:'m_000001',time_utc:'2026-10-23T18:45:00Z',home_team:{id:'t_000001'},away_team:{id:'t_000002'},score_home:0,score_away:1};
const stats=()=>({match_id:fixture.id,home_team:fixture.home_team,away_team:fixture.away_team,periods:[{period:'All',groups:[{items:[{key:'corners',home:'0',away:null,format_type:'integer'}]}]}]});
test('team historical quality retains fixed denominators including unavailable responses, zero, null, omissions and ambiguity',()=>{
 const r=summarizePitchTeamSeason([{fixture,stats:stats(),scope:'REGULAR'},{fixture:{...fixture,id:'m_000002'},stats:null,scope:'REGULAR'}],{season:'2026/2027'});
 const row=(period,metric)=>r.matrix.find(x=>x.period===period&&x.metric===metric);
 assert.equal(row('All','corners').denominator,4);assert.deepEqual(row('All','corners').counts,{VALUE:0,ZERO:1,NULL:1,OMITTED:0,AMBIGUOUS:0,NOT_APPLICABLE:0,RESPONSE_UNAVAILABLE:2});
 assert.equal(row('FirstHalf','corners').counts.OMITTED,2);assert.equal(row('FirstHalf','corners').periodObservedCells,0);
 assert.equal(row('All','direct_red_cards').counts.AMBIGUOUS,2);assert.equal(row('All','goals').counts.ZERO,1);
 assert.equal(r.populationCompletenessEstimated,false);assert.equal(r.trainingEligible,false);
});
test('team historical quality separates neutral playoff scope without replacing the selected fixture',()=>{
 const samples=[{fixture,stats:stats(),scope:'REGULAR_LEAGUE_SAMPLE'},{fixture,stats:stats(),scope:'POSTSEASON_NEUTRAL_PLAYOFF'}];
 assert.equal(summarizePitchTeamSeason(samples,{season:'2022/2023'}).plannedMatches,2);
 assert.equal(summarizePitchTeamSeason(samples,{season:'2022/2023',scope:'REGULAR_LEAGUE_SAMPLE'}).matrix[0].denominator,2);
});
const lineup=()=>({match_id:fixture.id,home_team:fixture.home_team,away_team:fixture.away_team,home:{confirmed:true,lineup_type:'standard',formation:'4-3-3',starters:[],subs:[]},away:{confirmed:true,starters:[],subs:[]}});
test('historical confirmed lineups do not become evidence of availability before a past forecast',()=>{
 const r=reviewPitchLineup({fixture,lineup:lineup(),observedAtUtc:'2026-10-24T12:00:00Z',forecastCutoffUtc:'2026-10-23T12:45:00Z'});
 assert.equal(r.observedBeforeForecastCutoff,false);assert.equal(r.sides[0].classification,'POST_MATCH_CAPTURE');assert.equal(r.sourcePublishedAtUtc,null);
 assert.ok(r.issues.some(i=>i.code==='CONFIRMED_LINEUP_TYPE_PRESENT_DESPITE_DOCUMENTED_OMISSION'));
 assert.equal(r.featureAdmission,'NOT_AUTHORIZED_NO_APPROVED_FEATURE_POLICY');
});
test('prematch prediction and confirmation remain distinct and post-freeze official lineup is not available at freeze',()=>{
 const l=lineup();l.home.confirmed=false;l.home.lineup_type='lastStarting11';
 const r=reviewPitchLineup({fixture,lineup:l,observedAtUtc:'2026-10-23T17:30:00Z',forecastCutoffUtc:'2026-10-23T16:15:00Z'});
 assert.equal(r.observedBeforeKickoff,true);assert.equal(r.observedBeforeForecastCutoff,false);
 assert.equal(r.sides[0].classification,'PREMATCH_PREDICTED');assert.equal(r.sides[1].classification,'PREMATCH_CONFIRMED');
});
test('lineup review rejects fixture or player-side identity conflicts',()=>{
 const l=lineup();l.home.starters=[{player_id:'p_000001'}];
 assert.throws(()=>reviewPitchLineup({fixture,lineup:l,observedAtUtc:'bad'}),/TIME_INVALID/);
 assert.throws(()=>reviewPitchLineup({fixture,lineup:l,observedAtUtc:'2026-10-21T18:00:00Z',players:[{player:{id:'p_000001'},team_id:'t_000002'}]}),/PLAYER_TEAM_CONFLICT/);
 l.away.starters=[{player_id:'p_000001'}];assert.throws(()=>reviewPitchLineup({fixture,lineup:l,observedAtUtc:'2026-10-21T18:00:00Z'}),/BOTH_SIDES/);
});
