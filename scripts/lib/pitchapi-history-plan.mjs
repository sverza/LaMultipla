import {createHash} from 'node:crypto';
const base='https://api.pitchapi.dev',leagueId='l_0ALvwF';
export const PITCH_HISTORY_SEASONS=['2021/2022','2022/2023','2023/2024','2024/2025','2025/2026','2026/2027'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>new Error('PITCH_HISTORY_'+code);
const compare=(a,b)=>Date.parse(a.time_utc)-Date.parse(b.time_utc)||(a.id<b.id?-1:a.id>b.id?1:0);

// Freeze the selection rule before observing any new statistical response.
// Exactly first, lower midpoint and last of the chronologically ordered
// completed fixtures. No replacements based on missingness or values.
export function selectPitchHistorySamples(data,{season,observedAtUtc}){
 const at=Date.parse(observedAtUtc);
 if(!PITCH_HISTORY_SEASONS.includes(season)||!Number.isFinite(at)||data?.league?.id!==leagueId||data.league.season!==season||!Array.isArray(data.matches))throw fail('SEASON_OR_OBSERVATION_INVALID');
 const seen=new Set(),pairs=new Set(),teamNames=new Map(),issues=[];
 for(const m of data.matches){
  if(!/^m_[A-Za-z0-9]{6}$/.test(m.id)||seen.has(m.id))throw fail('DUPLICATE_OR_INVALID_FIXTURE_ID');seen.add(m.id);
  if(!Number.isFinite(Date.parse(m.time_utc)))throw fail('KICKOFF_INVALID');
  for(const team of [m.home_team,m.away_team]){
   if(!/^t_[A-Za-z0-9]{6}$/.test(team?.id)||typeof team.name!=='string'||!team.name)throw fail('TEAM_INVALID');
   if(teamNames.has(team.id)&&teamNames.get(team.id)!==team.name)throw fail('TEAM_ID_NAME_CONFLICT');teamNames.set(team.id,team.name);
  }
  if(m.home_team.id===m.away_team.id)throw fail('HOME_AWAY_CONFLICT');
  const pair=m.home_team.id+':'+m.away_team.id;
  if(pairs.has(pair))issues.push({fixtureId:m.id,reason:'REPEATED_ORDERED_TEAM_PAIR_REQUIRES_RECONCILIATION'});pairs.add(pair);
  if(m.status==='finished'&&Date.parse(m.time_utc)>=at)throw fail('FINISHED_IN_FUTURE');
 }
 const ordered=data.matches.filter(m=>m.status==='finished'&&Date.parse(m.time_utc)<at).sort(compare);
 if(ordered.length<3)throw fail('INSUFFICIENT_COMPLETED_FIXTURES');
 const ranks=[0,Math.floor((ordered.length-1)/2),ordered.length-1];
 const samples=ranks.map(index=>{
  const m=ordered[index];
  if(![m.score_home,m.score_away].every(n=>Number.isInteger(n)&&n>=0))throw fail('SELECTED_SCORE_INVALID_NO_REPLACEMENT');
  return {rank:index+1,fixtureId:m.id,home:m.home_team,away:m.away_team,kickoffUtc:m.time_utc,endpoint:base+'/v1/matches/'+m.id+'/stats'};
 });
 return {schema:'lamultipla-pitchapi-history-sampling-v1',season,observedAtUtc,inputSha256:digest(data),policy:'CHRONOLOGICAL_FIRST_LOWER_MIDPOINT_LAST_V1',
  listed:data.matches.length,completed:ordered.length,teamCount:teamNames.size,statusCounts:Object.fromEntries([...new Set(data.matches.map(m=>m.status))].map(status=>[status,data.matches.filter(m=>m.status===status).length])),issues,samples,
  statisticsCoverageNotInferred:true,trainingEligible:false};
}

export function pitchHistoryDiscoveryPlan(){
 const request=season=>({method:'GET',url:base+'/v1/leagues/'+leagueId+'/matches?season='+encodeURIComponent(season)+'&status=all',season});
 return {schema:'lamultipla-pitchapi-history-discovery-plan-v1',authorized:false,maxTotalNewRequests:30,discoveryRequests:5,
  requests:[...PITCH_HISTORY_SEASONS.slice(0,4).map(request),{...request('2026/2027'),reservePurpose:'ONE_RESERVE_REQUEST_TO_IDENTIFY_G8_PREMATCH_LINEUP_TARGET_AND_NONFINISHED_STATUSES'}],
  reusedSeasons:['2025/2026','2026/2027'],statsSampleCount:18,expectedNewStatsRequests:17,lineupRequests:2,
  plannedNewTotal:24,reserveUnallocated:6,detailGate:'SHOW_EXACT_FIXTURE_IDS_AND_OBTAIN_SEPARATE_CONFIRMATION_AFTER_DISCOVERY',
  lineupTargets:['EXISTING_G6_SAMPLE','ONE_G8_PREMATCH_FIXTURE_IDENTIFIED_FROM_OFFICIAL_MANIFEST_AND_DISCOVERY'],
  automaticRetries:false,pagination:false,trainingEligible:false};
}
