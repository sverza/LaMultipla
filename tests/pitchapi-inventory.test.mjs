import test from 'node:test';
import assert from 'node:assert/strict';
import {pitchValue,parsePitchTeamValue,pitchTeamField,pitchPlayerField,inventoryPitchSample} from '../scripts/lib/pitchapi-inventory.mjs';
test('Pitch inventory preserves null, absence and actual zero without permissive numeric coercion',()=>{
 assert.equal(pitchValue(null).state,'PRESENT_NULL');assert.equal(pitchValue(undefined).state,'ABSENT');
 assert.equal(parsePitchTeamValue('0','integer').value,0);assert.equal(parsePitchTeamValue(null,'integer').state,'PRESENT_NULL');
 assert.equal(parsePitchTeamValue('','integer').state,'SEMANTICS_UNCLEAR');assert.equal(parsePitchTeamValue('3 corners','integer').state,'SEMANTICS_UNCLEAR');
 assert.deepEqual(parsePitchTeamValue('209 (76%)','integerWithPercentage'),{state:'PRESENT_VALUE',raw:'209 (76%)',value:209,percentage:76,format:'integerWithPercentage'});
});
test('Pitch inventory scopes team measurements by period, side and exact key; conflicting duplicate values remain withheld',()=>{
 const stats={periods:[{period:'All',groups:[{items:[{key:'corners',home:'0',away:'4',format_type:'integer'},{key:'corners',home:'0',away:'4',format_type:'integer'}]}]},{period:'FirstHalf',groups:[{items:[{key:'corners',home:'0',away:'1',format_type:'integer'}]}]}]};
 assert.equal(pitchTeamField(stats,'corners','away').value,4);assert.equal(pitchTeamField(stats,'corners','away','FirstHalf').value,1);
 assert.equal(pitchTeamField(stats,'corners','away').paths.length,2);assert.equal(pitchTeamField(stats,'Corners','away').state,'ABSENT');
 stats.periods[0].groups[0].items[1].away='5';assert.equal(pitchTeamField(stats,'corners','away').state,'SEMANTICS_UNCLEAR');
});
test('Pitch player inventory reads stable keys, preserves null exposure and fractions, and refuses conflicting duplicates',()=>{
 const player={stats:[{stats:{'Display changed':{key:'minutes_played',stat:{type:'integer',value:null}},'Passes':{key:'accurate_passes',stat:{type:'fractionWithPercentage',value:0,total:0}}}}]};
 assert.equal(pitchPlayerField(player,'minutes_played').state,'PRESENT_NULL');assert.equal(pitchPlayerField(player,'accurate_passes').total,0);
 assert.equal(pitchPlayerField(player,'yellow_cards').state,'ABSENT');
 player.stats.push({stats:{Other:{key:'minutes_played',stat:{type:'integer',value:0}}}});assert.equal(pitchPlayerField(player,'minutes_played').state,'SEMANTICS_UNCLEAR');
});
test('Pitch sample review never infers role, starters, direct red subtype, half-time score or absent event types as zero',()=>{
 const fixture={id:'m_000001',home_team:{id:'t_000001'},away_team:{id:'t_000002'},score_home:0,score_away:0};
 const input={fixture,stats:{match_id:fixture.id,home_team:fixture.home_team,away_team:fixture.away_team,periods:[]},events:{match_id:fixture.id,events:[]},players:[{player:{id:'p_000001',position_id:null},team_id:'t_000001',stats:[]}]};
 const r=inventoryPitchSample(input);assert.equal(r.roles.PRESENT_NULL,1);assert.equal(r.fixture.ht.state,'ABSENT');assert.equal(r.playerSummary.minutes_played.ABSENT,1);
 assert.equal(r.trainingEligible,false);assert.equal(r.selectorEligible,false);assert.deepEqual(r.eventTypes,{});assert.ok(r.issues.includes('RED_CARD_SUBTYPE_UNVERIFIED'));
 input.players[0].team_id='t_000003';assert.throws(()=>inventoryPitchSample(input),/IDENTITY_CONFLICT/);
});
