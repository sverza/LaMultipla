import {pitchTeamField} from './pitchapi-inventory.mjs';
export const PITCH_TEAM_METRICS=['goals','corners','total_shots','ShotsOnTarget','ShotsOffTarget','blocked_shots','BallPossesion','fouls','Offsides','yellow_cards','red_cards','direct_red_cards','second_yellow_cards','passes','accurate_passes','keeper_saves','expected_goals','expected_goals_non_penalty','expected_goals_on_target','expected_goals_open_play','expected_goals_set_play'];
const states=['VALUE','ZERO','NULL','OMITTED','AMBIGUOUS','NOT_APPLICABLE','RESPONSE_UNAVAILABLE'];
const label=m=>m.state==='PRESENT_VALUE'?(m.value===0?'ZERO':'VALUE'):({PRESENT_NULL:'NULL',ABSENT:'OMITTED',SEMANTICS_UNCLEAR:'AMBIGUOUS'}[m.state]??'AMBIGUOUS');
export function summarizePitchTeamSeason(samples,{season,scope='ALL_SAMPLED'}){
 const selected=samples.filter(s=>scope==='ALL_SAMPLED'||s.scope===scope),cells=[],issues=[];
 for(const s of selected){
  if(s.stats&&(s.stats.match_id!==s.fixture.id||s.stats.home_team?.id!==s.fixture.home_team.id||s.stats.away_team?.id!==s.fixture.away_team.id))throw Error('PITCH_QUALITY_IDENTITY_CONFLICT');
  for(const period of ['All','FirstHalf','SecondHalf'])for(const side of ['home','away'])for(const metric of PITCH_TEAM_METRICS){
   const periodObserved=s.stats?.periods?.some(p=>p.period===period)??false;
   let measurement;
   if(!s.stats)measurement={state:'RESPONSE_UNAVAILABLE'};
   else if(['direct_red_cards','second_yellow_cards'].includes(metric))measurement={state:'SEMANTICS_UNCLEAR',reason:'AGGREGATE_RED_IS_NOT_A_SUBTYPE'};
   else if(metric==='goals'&&period==='All'){
    const value=side==='home'?s.fixture.score_home:s.fixture.score_away;
    measurement=value===null?{state:'PRESENT_NULL'}:Number.isInteger(value)&&value>=0?{state:'PRESENT_VALUE',value,origin:'fixture_list',regulationExplicit:false}:{state:'SEMANTICS_UNCLEAR'};
   }else measurement=pitchTeamField(s.stats,metric,side,period);
   cells.push({fixtureId:s.fixture.id,scope:s.scope,period,side,metric,periodObserved,state:measurement.state==='RESPONSE_UNAVAILABLE'?'RESPONSE_UNAVAILABLE':label(measurement),measurement});
  }
  for(const side of ['home','away'])for(const metric of ['corners','total_shots','ShotsOnTarget','ShotsOffTarget','blocked_shots','fouls','Offsides','yellow_cards','red_cards','passes','keeper_saves']){
   if(!s.stats)continue;
   const a=pitchTeamField(s.stats,metric,side),h=pitchTeamField(s.stats,metric,side,'FirstHalf'),b=pitchTeamField(s.stats,metric,side,'SecondHalf');
   if([a,h,b].every(m=>m.state==='PRESENT_VALUE')&&h.value+b.value!==a.value)issues.push({fixtureId:s.fixture.id,side,metric,code:'PERIOD_TOTAL_MISMATCH'});
  }
  if(s.stats){
   const possession=['home','away'].map(side=>pitchTeamField(s.stats,'BallPossesion',side));
   if(possession.every(m=>m.state==='PRESENT_VALUE')&&Math.abs(possession[0].value+possession[1].value-100)>2)issues.push({fixtureId:s.fixture.id,code:'POSSESSION_SUM_OUTSIDE_ROUNDING_TOLERANCE'});
   for(const side of ['home','away']){const shot=['ShotsOnTarget','ShotsOffTarget','blocked_shots','total_shots'].map(k=>pitchTeamField(s.stats,k,side));
    if(shot.every(m=>m.state==='PRESENT_VALUE')&&shot[0].value+shot[1].value+shot[2].value!==shot[3].value)issues.push({fixtureId:s.fixture.id,side,code:'SHOT_PARTITION_REQUIRES_DEFINITION_REVIEW'});}
  }
 }
 const matrix=['All','FirstHalf','SecondHalf'].flatMap(period=>PITCH_TEAM_METRICS.map(metric=>{
  const values=cells.filter(c=>c.period===period&&c.metric===metric),denominator=selected.length*2;
  return {period,metric,denominator,counts:Object.fromEntries(states.map(state=>[state,values.filter(c=>c.state===state).length])),
   valuedPercent:denominator?100*values.filter(c=>['VALUE','ZERO'].includes(c.state)).length/denominator:null,
   periodObservedCells:values.filter(c=>c.periodObserved).length};
 }));
 return {schema:'lamultipla-pitchapi-team-quality-v1',season,scope,plannedMatches:selected.length,responses:selected.filter(s=>s.stats).length,matrix,cells,issues,
  populationCompletenessEstimated:false,sampling:'DETERMINISTIC_TEMPORAL_CHECKPOINTS_NOT_RANDOM',trainingEligible:false};
}

export function reviewPitchLineup({fixture,lineup,players=[],observedAtUtc,forecastCutoffUtc=null}){
 if(lineup.match_id!==fixture.id||lineup.home_team?.id!==fixture.home_team.id||lineup.away_team?.id!==fixture.away_team.id)throw Error('PITCH_LINEUP_IDENTITY_CONFLICT');
 const at=Date.parse(observedAtUtc),kickoff=Date.parse(fixture.time_utc);
 if(!Number.isFinite(at)||!Number.isFinite(kickoff)||forecastCutoffUtc!==null&&!Number.isFinite(Date.parse(forecastCutoffUtc)))throw Error('PITCH_LINEUP_TIME_INVALID');
 const allIds=[],issues=[];
 const sides=['home','away'].map(side=>{
  const value=lineup[side],starters=value?.starters??[],subs=value?.subs??[],ids=starters.concat(subs).map(p=>p.player_id);
  if(ids.some(id=>!/^p_[A-Za-z0-9]{6}$/.test(id))||new Set(ids).size!==ids.length)throw Error('PITCH_LINEUP_PLAYER_ID_INVALID');
  allIds.push(...ids);if(starters.length!==11)issues.push({side,code:'STARTER_LIST_INCOMPLETE'});
  if(value.confirmed===true&&value.lineup_type!=null)issues.push({side,code:'CONFIRMED_LINEUP_TYPE_PRESENT_DESPITE_DOCUMENTED_OMISSION'});
  const classification=at>=kickoff?'POST_MATCH_CAPTURE':value.confirmed===false?'PREMATCH_PREDICTED':value.confirmed===true?'PREMATCH_CONFIRMED':'CONFIRMATION_UNVERIFIED';
  const teamId=side==='home'?fixture.home_team.id:fixture.away_team.id;
  const mismatched=ids.filter(id=>players.some(p=>p.player.id===id&&p.team_id!==teamId));
  if(mismatched.length)throw Error('PITCH_LINEUP_PLAYER_TEAM_CONFLICT');
  return {side,classification,confirmed:value.confirmed??null,lineupType:value.lineup_type??null,formation:value.formation??null,
   starters:starters.length,subs:subs.length,starterPositionSemantics:'FORMATION_SLOT_NOT_UNIVERSAL_ROLE',benchPositionSemantics:'DOCUMENTED_POSITION_CATEGORY',
   playerStatsJoin:players.length?{matched:ids.filter(id=>players.some(p=>p.player.id===id)).length,planned:ids.length}:null,
   playerIds:ids};
 });
 if(new Set(allIds).size!==allIds.length)throw Error('PITCH_LINEUP_PLAYER_ON_BOTH_SIDES');
 return {schema:'lamultipla-pitchapi-lineup-observation-review-v1',fixtureId:fixture.id,observedAtUtc,kickoffUtc:fixture.time_utc,
  sourcePublishedAtUtc:lineup.published_at??null,sourceUpdatedAtUtc:lineup.updated_at??null,
  observedBeforeKickoff:at<kickoff,observedBeforeForecastCutoff:forecastCutoffUtc===null?null:at<Date.parse(forecastCutoffUtc),sides,issues,
  injuryInformationObserved:Object.hasOwn(lineup,'injuries'),suspensionInformationObserved:Object.hasOwn(lineup,'suspensions'),
  featureAdmission:'NOT_AUTHORIZED_NO_APPROVED_FEATURE_POLICY',trainingEligible:false};
}
