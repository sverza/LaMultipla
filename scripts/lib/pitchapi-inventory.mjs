// Diagnostic only. No network, training adapter, settlement or model input.
const valueState=v=>v===null?'PRESENT_NULL':v===undefined?'ABSENT':'PRESENT_VALUE';
const withoutPath=entry=>Object.fromEntries(Object.entries(entry).filter(([key])=>key!=='path'));
export function pitchValue(value){return {state:valueState(value),...(value===undefined?{}:{raw:value})};}
export function parsePitchTeamValue(value,format){
 const result=pitchValue(value);if(result.state!=='PRESENT_VALUE')return result;
 if(typeof value!=='string')return {...result,state:'SEMANTICS_UNCLEAR'};
 const pattern=format==='integerWithPercentage'?/^(\d+) \((\d+(?:\.\d+)?)%\)$/:format==='double'?/^(\d+(?:\.\d+)?)$/:['integer',''].includes(format)?/^(\d+)$/:null;
 const found=pattern&&value.match(pattern);
 if(!found)return {...result,state:'SEMANTICS_UNCLEAR',format};
 return {...result,value:Number(found[1]),...(found[2]===undefined?{}:{percentage:Number(found[2])}),format};
}
export function pitchTeamField(stats,key,side,period='All'){
 const found=[];
 for(const [pi,p] of (stats.periods??[]).entries())if(p.period===period)
  for(const [gi,g] of (p.groups??[]).entries())for(const [ii,item] of (g.items??[]).entries())if(item.key===key)
   found.push({...parsePitchTeamValue(item[side],item.format_type),path:`periods[${pi}].groups[${gi}].items[${ii}].${side}`});
 if(!found.length)return {state:'ABSENT',paths:[]};
 const signatures=found.map(entry=>JSON.stringify(withoutPath(entry)));
 if(new Set(signatures).size!==1)return {state:'SEMANTICS_UNCLEAR',reason:'CONTRADICTORY_DUPLICATE_KEY',observations:found};
 return {...withoutPath(found[0]),paths:found.map(x=>x.path),repeatedEquivalent:found.length>1};
}
export function pitchPlayerField(player,key){
 const values=[];
 for(const [gi,g] of (player.stats??[]).entries())for(const [label,s] of Object.entries(g.stats??{}))if(s.key===key)
  values.push({...pitchValue(s.stat?.value),type:s.stat?.type??null,...(Object.hasOwn(s.stat??{},'total')?{total:s.stat.total}:{}),path:`stats[${gi}].stats[${JSON.stringify(label)}].stat`});
 if(!values.length)return {state:'ABSENT',paths:[]};
 const signatures=values.map(entry=>JSON.stringify(withoutPath(entry)));
 if(new Set(signatures).size!==1)return {state:'SEMANTICS_UNCLEAR',reason:'CONTRADICTORY_DUPLICATE_KEY',observations:values};
 return {...withoutPath(values[0]),paths:values.map(x=>x.path)};
}
const counts=items=>Object.fromEntries(['PRESENT_VALUE','PRESENT_NULL','ABSENT','SEMANTICS_UNCLEAR'].map(state=>[state,items.filter(x=>x.state===state).length]));
const teamKeys=['corners','total_shots','ShotsOnTarget','ShotsOffTarget','blocked_shots','BallPossesion','fouls','Offsides','yellow_cards','red_cards','keeper_saves','passes','accurate_passes','expected_goals'];
const playerKeys=['minutes_played','goals','assists','total_shots','ShotsOnTarget','ShotsOffTarget','fouls','was_fouled','yellow_cards','red_cards','saves','expected_goals','accurate_passes','owngoal'];

export function inventoryPitchSample({fixture,stats,events,players}){
 const teams=[fixture.home_team.id,fixture.away_team.id];
 if(stats.match_id!==fixture.id||events.match_id!==fixture.id||stats.home_team?.id!==teams[0]||stats.away_team?.id!==teams[1]
  ||!Array.isArray(players)||!Array.isArray(events.events)||players.some(p=>!teams.includes(p.team_id))||events.events.some(e=>!teams.includes(e.team_id)))throw Error('PITCH_INVENTORY_IDENTITY_CONFLICT');
 const team={};for(const side of ['home','away'])team[side]=Object.fromEntries(teamKeys.map(key=>[key,pitchTeamField(stats,key,side)]));
 const playerSummary=Object.fromEntries(playerKeys.map(key=>[key,counts(players.map(p=>pitchPlayerField(p,key)))]));
 const roles=players.map(p=>pitchValue(p.player?.position_id));
 const roleStats=counts(roles),issues=[];
 const ids=players.map(p=>p.player?.id),validIds=ids.every(v=>/^p_[A-Za-z0-9]{6}$/.test(v));
 if(!validIds||new Set(ids).size!==ids.length)issues.push('PLAYER_ID_INVALID_OR_DUPLICATE');
 if(roleStats.PRESENT_VALUE!==players.length)issues.push('PLAYER_ROLES_INCOMPLETE');
 if(playerSummary.minutes_played.PRESENT_NULL||playerSummary.minutes_played.ABSENT)issues.push('PLAYER_EXPOSURE_INCOMPLETE_DO_NOT_TREAT_NULL_AS_DNP');
 if(!events.events.some(e=>Object.hasOwn(e,'assist')||Object.hasOwn(e,'assist_player')))issues.push('EVENT_ASSIST_ATTRIBUTION_NOT_OBSERVED');
 issues.push('STARTER_IDENTITY_NOT_VERIFIED_NO_LINEUPS_REQUEST','RED_CARD_SUBTYPE_UNVERIFIED','SOURCE_UPDATED_AT_NOT_OBSERVED','REGULATION_DURATION_ADMINISTRATIVE_STATUS_NOT_EXPLICIT');
 const teamChecks=[];
 for(const side of ['home','away']){
  const t=team[side],shotKeys=['ShotsOnTarget','ShotsOffTarget','blocked_shots','total_shots'];
  if(shotKeys.every(k=>t[k].state==='PRESENT_VALUE')&&t.ShotsOnTarget.value+t.ShotsOffTarget.value+t.blocked_shots.value!==t.total_shots.value)teamChecks.push({side,issue:'SHOT_PARTITION_DIFFERS_REQUIRES_DEFINITION'});
  for(const key of teamKeys){const a=t[key],h=pitchTeamField(stats,key,side,'FirstHalf'),s=pitchTeamField(stats,key,side,'SecondHalf');
   if(['BallPossesion','accurate_passes','expected_goals'].includes(key))continue;
   if([a,h,s].every(x=>x.state==='PRESENT_VALUE')&&h.value+s.value!==a.value)teamChecks.push({side,key,issue:'PERIOD_TOTAL_MISMATCH'});
  }
 }
 const eventTypes=Object.fromEntries([...new Set(events.events.map(e=>e.event_type))].map(type=>[type,events.events.filter(e=>e.event_type===type).length]));
 const eventFields=Object.fromEntries(['minute','minute_added','period','player','score_home','score_away','is_own_goal','is_penalty','sub_in_player','assist','assist_player'].map(key=>[key,counts(events.events.map(e=>pitchValue(e[key])))]));
 const eventPlayerIds=events.events.flatMap(e=>[e.player?.id,e.sub_in_player?.id].filter(Boolean));
 const unresolvedEventPlayers=[...new Set(eventPlayerIds.filter(id=>!ids.includes(id)))];
 if(unresolvedEventPlayers.length)issues.push('EVENT_PLAYER_ID_NOT_IN_STATS');
 return {schema:'lamultipla-pitchapi-sample-inventory-v1',fixtureId:fixture.id,
  fixture:{home:fixture.home_team,away:fixture.away_team,kickoffUtc:fixture.time_utc,status:fixture.status,ft:[pitchValue(fixture.score_home),pitchValue(fixture.score_away)],ht:{state:'ABSENT'},matchday:{state:valueState(fixture.matchday)},duration:{state:valueState(fixture.duration)},awarded:{state:valueState(fixture.awarded)}},
  team,playerRecords:players.length,playerIdsUnique:validIds&&new Set(ids).size===ids.length,roles:roleStats,playerSummary,
  playerDetails:players.map(p=>({id:p.player.id,teamId:p.team_id,role:pitchValue(p.player.position_id),fields:Object.fromEntries(playerKeys.map(k=>[k,pitchPlayerField(p,k)]))})),
  eventCount:events.events.length,eventTypes,eventFields,unresolvedEventPlayers,teamChecks,issues,
  trainingEligible:false,selectorEligible:false,coverageClaim:'THREE_SELECTED_MATCHES_NOT_SEASONAL_COMPLETENESS'};
}
