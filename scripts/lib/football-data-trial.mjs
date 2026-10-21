import fs from 'node:fs/promises';
import path from 'node:path';
import {writeExclusive,readSnapshot,digest} from './prospective/store.mjs';
import {sha256,canonicalTeam} from './goals/data.mjs';
import {privateLock} from './private/process-lock.mjs';
export const FOOTBALL_TRIAL_URL='https://api.football-data.org/v4/competitions/SA/matches?season=2026';
// Pure quarantine review, not an adapter to Openfootball or the original evaluator.
export function reviewFootballResponse(raw,manifests,{acquiredAtUtc,now=new Date(),aliases={}}){
 const at=new Date(now).getTime();if(!Number.isFinite(Date.parse(acquiredAtUtc))||Date.parse(acquiredAtUtc)>at||!Number.isFinite(at)||!Array.isArray(manifests))throw Error('FOOTBALL_TRIAL_TIME_INVALID');
 const data=JSON.parse(Buffer.from(raw).toString('utf8'));
 if(data.competition?.code!=='SA'||data.competition?.type!=='LEAGUE'||!Array.isArray(data.matches))throw Error('FOOTBALL_TRIAL_SCHEMA_OR_COMPETITION');
 const ids=data.matches.map(m=>m.id);if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)throw Error('FOOTBALL_TRIAL_DUPLICATE_IDS');
 const name=n=>Object.hasOwn(aliases,n)?aliases[n]:canonicalTeam(n);
 const rows=manifests.flatMap(manifest=>{
  if(manifest.season!=='2026/27'||![6,7].includes(manifest.matchday)||manifest.events?.length!==10||new Set(manifest.events.map(e=>e.fixtureId)).size!==10)throw Error('FOOTBALL_TRIAL_MANIFEST_INVALID');
  return manifest.events.map(e=>{
   const found=data.matches.filter(m=>m.matchday===manifest.matchday&&name(m.homeTeam?.name)===e.home&&name(m.awayTeam?.name)===e.away),m=found[0],reasons=[];
   if(found.length!==1)reasons.push(found.length?'AMBIGUOUS_FIXTURE':'FIXTURE_MISSING');
   if(m){if(!/^2026-/.test(m.season?.startDate??'')||!/^2027-/.test(m.season?.endDate??'')||m.competition&&m.competition.code!=='SA')reasons.push('SEASON_OR_COMPETITION_UNVERIFIED');
    if(!Number.isSafeInteger(m.homeTeam?.id)||!Number.isSafeInteger(m.awayTeam?.id)||m.homeTeam.id===m.awayTeam.id)reasons.push('TEAM_IDS_INVALID');
    if(!Number.isFinite(Date.parse(m.utcDate))||new Date(m.utcDate).toISOString()!==new Date(e.kickoffUtc).toISOString())reasons.push('KICKOFF_CONFLICT_REQUIRES_EVIDENCE');
    if(m.status!=='FINISHED')reasons.push('STATUS_'+String(m.status));if(m.score?.duration!=='REGULAR')reasons.push('REGULATION_SCORE_NOT_PROVEN');
    if(![m.score?.fullTime?.home,m.score?.fullTime?.away].every(n=>Number.isInteger(n)&&n>=0&&n<=30))reasons.push('FT_SCORE_MISSING_OR_INVALID');
    if(Date.parse(m.utcDate)>=Date.parse(acquiredAtUtc)||!Number.isFinite(Date.parse(m.lastUpdated))||Date.parse(m.lastUpdated)>Date.parse(acquiredAtUtc))reasons.push('OBSERVATION_TIME_UNVERIFIED');
    if(!reasons.length&&m.score.winner!=null&&m.score.winner!==(m.score.fullTime.home>m.score.fullTime.away?'HOME_TEAM':m.score.fullTime.home===m.score.fullTime.away?'DRAW':'AWAY_TEAM'))reasons.push('WINNER_SCORE_CONFLICT');
   }
   return {fixtureId:e.fixtureId,season:manifest.season,matchday:manifest.matchday,sourceFixtureId:m?.id??null,home:e.home,away:e.away,kickoffUtc:e.kickoffUtc,
    state:reasons.length?'PENDING_OR_WITHHELD':'FT_SOURCE_MATCHED_NOT_OFFICIALLY_CORROBORATED',reasons,goals:reasons.length?null:[m.score.fullTime.home,m.score.fullTime.away],lastUpdated:m?.lastUpdated??null};
  });
 });
 return {schema:'lamultipla-football-data-trial-review-v1',acquiredAtUtc,rawSha256:sha256(raw),manifestHashes:manifests.map(digest),aliasesSha256:digest(aliases),rows,
  counts:{planned:rows.length,sourceMatched:rows.filter(r=>!r.reasons.length).length,pendingOrWithheld:rows.filter(r=>r.reasons.length).length},
  originalSourceReplaced:false,cohortEligible:false,trainingEligible:false,officialCorroborationPending:true};
}
export async function acquireFootballTrial({directory,grant,keyLoader,fetchImpl=fetch,clock=()=>new Date()}){
 const now=clock();if(grant?.schema!=='lamultipla-football-data-single-trial-grant-v1'||grant.authorized!==true||grant.endpoint!==FOOTBALL_TRIAL_URL
  ||!grant.reviewer?.trim()||!Number.isFinite(Date.parse(grant.approvedAtUtc))||Date.parse(grant.approvedAtUtc)>now.getTime()
  ||now-Date.parse(grant.approvedAtUtc)>86400000||grant.maxRequests!==1||grant.termsAcceptedByUser!==true||grant.privateSnapshotTrialAuthorized!==true)throw Error('FOOTBALL_TRIAL_EXPLICIT_GRANT_REQUIRED');
 return privateLock(directory,async()=>{
  const receiptFile=path.join(directory,'receipt.json'),intentFile=path.join(directory,'intent.json');
  let old;try{old=await readSnapshot(receiptFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old){if(old.grantSha256!==digest(grant))throw Error('FOOTBALL_TRIAL_GRANT_CHANGED');
   const raw=await fs.readFile(path.join(directory,'response.private.json'));if(sha256(raw)!==old.rawSha256)throw Error('FOOTBALL_TRIAL_SNAPSHOT_CHANGED');
   return {...old,reused:true};}
  try{await fs.access(intentFile);throw Error('FOOTBALL_TRIAL_AMBIGUOUS_NO_RETRY');}catch(e){if(e.code!=='ENOENT')throw e;}
  const key=await keyLoader();if(typeof key!=='string'||!key||/[\s\u0000-\u001f]/.test(key))throw Error('FOOTBALL_TRIAL_KEY_INVALID');
  await writeExclusive(intentFile,{schema:'lamultipla-football-data-trial-intent-v1',startedAtUtc:now.toISOString(),url:FOOTBALL_TRIAL_URL,grantSha256:digest(grant),requestLimit:1});
  try{
   const response=await fetchImpl(FOOTBALL_TRIAL_URL,{redirect:'error',headers:{'X-Auth-Token':key,'User-Agent':'LaMultipla-private-trial/1.0'},signal:AbortSignal.timeout(25000)});
   const raw=Buffer.from(await response.arrayBuffer());if(raw.length>4*1024*1024||raw.includes(Buffer.from(key)))throw Error('FOOTBALL_TRIAL_UNSAFE_RESPONSE');
   const acquiredAtUtc=clock().toISOString();await fs.writeFile(path.join(directory,'response.private.json'),raw,{flag:'wx',mode:0o600});
   const result={schema:'lamultipla-football-data-trial-receipt-v1',url:FOOTBALL_TRIAL_URL,status:response.status,contentType:response.headers.get('content-type'),rawSha256:sha256(raw),acquiredAtUtc,grantSha256:digest(grant),requests:1,trainingEligible:false};
   await writeExclusive(receiptFile,result);return result;
  }catch{throw Error('FOOTBALL_TRIAL_STOPPED_NO_AUTOMATIC_RETRY');}
 });
}
