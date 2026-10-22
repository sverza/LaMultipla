import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {digest,readSnapshot,writeExclusive} from './prospective/store.mjs';
import {PITCH_HISTORY_SEASONS,selectPitchHistorySamples} from './pitchapi-history-plan.mjs';
import {summarizePitchTeamSeason} from './pitchapi-history-quality.mjs';
import {PITCH_TEAM_METRICS} from './pitchapi-history-quality.mjs';
import {pitchTeamField} from './pitchapi-inventory.mjs';
import {reviewPitchAdvanced,summarizePitchAdvanced} from './pitchapi-advanced.mjs';

export const ARCHIVE_VERSION='pitchapi-historical-team-v1';
export const pitchBytesHash=raw=>createHash('sha256').update(raw).digest('hex');
const fail=code=>new Error('PITCH_ARCHIVE_'+code);
const compare=(a,b)=>Date.parse(a.fixture.time_utc)-Date.parse(b.fixture.time_utc)||(a.fixture.id<b.fixture.id?-1:a.fixture.id>b.fixture.id?1:0);
const urlFor=(id,kind)=>'https://api.pitchapi.dev/v1/matches/'+id+'/'+kind;
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export const pitchArchiveKind=url=>/^https:\/\/api\.pitchapi\.dev\/v1\/matches\/m_[A-Za-z0-9]{6}\/(stats|advanced)$/.exec(url)?.[1]??null;
export async function archivePut(file,payload){
 try{await writeExclusive(file,payload);}catch(e){if(e.code!=='EEXIST')throw e;if(digest(await readSnapshot(file))!==digest(payload))throw fail('IMMUTABLE_CONFLICT');}
 return digest(payload);
}

// Ingest only previously receipted bytes. No fetch, credentials or clock rewriting.
export async function importPitchArchiveResponse({directory,receipt,raw,source}){
 const catalog=/^https:\/\/api\.pitchapi\.dev\/v1\/leagues\/l_0ALvwF\/matches\?season=\d{4}%2F\d{4}&status=(all|played)$/.test(receipt.url);
 if(!catalog&&!pitchArchiveKind(receipt.url))throw fail('ENDPOINT_REFUSED');
 if(!time(receipt.acquiredAtUtc)||receipt.rawSha256!==pitchBytesHash(raw)||receipt.bytes!==raw.length)throw fail('SOURCE_HASH_OR_TIME');
 let body;try{body=JSON.parse(raw.toString('utf8'));}catch{throw fail('SOURCE_JSON');}
 if(receipt.status!==200&&!(receipt.status===404&&pitchArchiveKind(receipt.url)==='advanced'&&body?.error?.code==='ANALYTICS_UNAVAILABLE'))throw fail('SOURCE_UNAVAILABLE');
 if(!/^application\/json(?:\s*;|$)/i.test(receipt.contentType??''))throw fail('SOURCE_CONTENT_TYPE');
 const objectFile=path.join(directory,'objects',receipt.rawSha256+'.json');
 await fs.mkdir(path.dirname(objectFile),{recursive:true,mode:0o700});
 let handle;
 try{handle=await fs.open(objectFile,'wx',0o600);await handle.writeFile(raw);await handle.sync();}
 catch(e){if(e.code!=='EEXIST')throw e;}
 finally{if(handle)await handle.close();}
 if(pitchBytesHash(await fs.readFile(objectFile))!==receipt.rawSha256)throw fail('OBJECT_CHANGED');
 const observation={schema:ARCHIVE_VERSION+'-observation',url:receipt.url,acquiredAtUtc:receipt.acquiredAtUtc,rawSha256:receipt.rawSha256,
  receipt,source,providerPublishedAtUtc:null,providerRevision:null,trainingEligible:false};
 const key=digest({url:receipt.url,acquiredAtUtc:receipt.acquiredAtUtc,rawSha256:receipt.rawSha256});
 await archivePut(path.join(directory,'observations',key+'.json'),observation);return key;
}

export function buildPitchArchiveUniverse(catalogs){
 const fixtures=new Map(),seasons=new Set(),names=new Map();
 for(const c of catalogs){
  const season=c.body?.data?.league?.season;
  selectPitchHistorySamples(c.body?.data,{season,observedAtUtc:c.observation.acquiredAtUtc});seasons.add(season);
  const url=new URL(c.observation.url);
  if(url.searchParams.get('season')!==season)throw fail('CATALOG_SEASON_CONFLICT');
  for(const fixture of c.body.data.matches){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(fixture.date??''))throw fail('FIXTURE_DATE_INVALID');
   if(!['finished','not_started','postponed','cancelled','suspended','live'].includes(fixture.status))throw fail('STATUS_UNVERIFIED');
   if(fixture.status==='finished'&&![fixture.score_home,fixture.score_away].every(n=>Number.isSafeInteger(n)&&n>=0))throw fail('FINISHED_SCORE_INVALID');
   for(const t of [fixture.home_team,fixture.away_team]){if(names.has(t.id)&&names.get(t.id)!==t.name)throw fail('TEAM_ID_NAME_CONFLICT');names.set(t.id,t.name);}
   const old=fixtures.get(fixture.id);
   if(old&&(old.season!==season||digest(old.fixture)!==digest(fixture)))throw fail('CATALOG_REVISION_REQUIRES_REVIEW');
   if(old){old.catalogObservations.push(c.key);continue;}
   const playoff=fixture.id==='m_3ir3kE';
   if(playoff&&(season!=='2022/2023'||fixture.home_team.id!=='t_2QVYlo'||fixture.away_team.id!=='t_0YcbNh'||fixture.date!=='2023-06-11'))throw fail('PLAYOFF_IDENTITY');
   fixtures.set(fixture.id,{season,fixture,catalogObservations:[c.key],candidate:fixture.status==='finished',
    scope:playoff?'POSTSEASON_NEUTRAL_PLAYOFF':'REGULAR_LEAGUE',neutralVenue:playoff?true:null,
    homeAdvantageAssumed:false,result:{scoreHome:fixture.score_home??null,scoreAway:fixture.score_away??null,status:fixture.status,
     regulationDurationVerified:false,administrativeDecision:null,halfTime:null}});
  }
 }
 if(PITCH_HISTORY_SEASONS.some(s=>!seasons.has(s)))throw fail('SIX_CATALOGS_REQUIRED');
 return [...fixtures.values()].sort((a,b)=>PITCH_HISTORY_SEASONS.indexOf(a.season)-PITCH_HISTORY_SEASONS.indexOf(b.season)||compare(a,b));
}

export function reviewPitchArchiveResponse({request,status,body,observedAtUtc}){
 const {fixture,kind,season}=request;
 if(!PITCH_HISTORY_SEASONS.includes(season)||!time(observedAtUtc)||!time(fixture?.time_utc)||Date.parse(fixture.time_utc)>=Date.parse(observedAtUtc)||fixture.status!=='finished')throw fail('NOT_COMPLETED');
 if(kind==='advanced')return reviewPitchAdvanced({fixture,status,body,observedAtUtc});
 if(kind!=='stats')throw fail('ENDPOINT_REFUSED');
 const base={fixtureId:fixture.id,observedAtUtc,teams:[],issues:[],trainingEligible:false};
 if(status!==200||!body?.data||Object.hasOwn(body,'error'))return {...base,classification:'HTTP_OR_APPLICATION_ERROR',canContinue:false};
 const data=body.data;
 if(data.match_id!==fixture.id||['home','away'].some(side=>data[side+'_team']?.id!==fixture[side+'_team'].id||data[side+'_team']?.name!==fixture[side+'_team'].name))return {...base,classification:'IDENTITY_ERROR',canContinue:false};
 // These fields are not required by the provider contract; when present they
 // must agree. Missing season/date/status are inherited, never reconfirmed.
 for(const [key,expected] of [['season',season],['time_utc',fixture.time_utc],['date',fixture.date],['status',fixture.status],['score_home',fixture.score_home],['score_away',fixture.score_away]]){
  if(Object.hasOwn(data,key)&&data[key]!==expected)return {...base,classification:'IDENTITY_ERROR',canContinue:false};
 }
 if(!Array.isArray(data.periods)||new Set(data.periods.map(p=>p?.period)).size!==data.periods.length||data.periods.some(p=>!['All','FirstHalf','SecondHalf'].includes(p?.period)||!Array.isArray(p.groups)||p.groups.some(g=>!Array.isArray(g?.items)||g.items.some(i=>!i||typeof i.key!=='string'))))return {...base,classification:'SCHEMA_ERROR',canContinue:false};
 const quality=summarizePitchTeamSeason([{season,scope:request.scope,fixture,stats:data}],{season});
 for(const c of quality.cells){if(!['VALUE','ZERO'].includes(c.state))continue;
  const n=c.measurement.value,pct=c.measurement.percentage;
  if(!Number.isFinite(n)||n<0||c.metric==='BallPossesion'&&n>100||pct!==undefined&&(pct<0||pct>100)||!['BallPossesion','expected_goals','expected_goals_non_penalty','expected_goals_on_target','expected_goals_open_play','expected_goals_set_play'].includes(c.metric)&&!Number.isSafeInteger(n)){
   c.state='AMBIGUOUS';quality.issues.push({fixtureId:fixture.id,side:c.side,metric:c.metric,code:'NUMERIC_DOMAIN_UNVERIFIED'});
  }
 }
 // Aggregate counts were produced before the additional domain checks.
 for(const row of quality.matrix){const cells=quality.cells.filter(c=>c.period===row.period&&c.metric===row.metric);for(const state of Object.keys(row.counts))row.counts[state]=cells.filter(c=>c.state===state).length;row.valuedPercent=100*cells.filter(c=>['VALUE','ZERO'].includes(c.state)).length/row.denominator;}
 const known=new Set(PITCH_TEAM_METRICS),unmapped=[];
 for(const p of data.periods)for(const g of p.groups)for(const item of g.items)if(!known.has(item.key)&&!unmapped.includes(item.key))unmapped.push(item.key);
 const complete=quality.cells.filter(c=>c.period==='All'&&!['direct_red_cards','second_yellow_cards','goals'].includes(c.metric)).every(c=>['VALUE','ZERO'].includes(c.state));
 const incoherent=quality.issues.some(i=>['NUMERIC_DOMAIN_UNVERIFIED','PERIOD_TOTAL_MISMATCH','POSSESSION_SUM_OUTSIDE_ROUNDING_TOLERANCE'].includes(i.code));
 return {...base,classification:incoherent?'SEMANTIC_ERROR':complete?'VALID_COMPLETE':'VALID_PARTIAL',canContinue:!incoherent,quality,unmappedKeys:unmapped,
  issues:quality.issues,sourceSeasonReconfirmed:Object.hasOwn(data,'season'),sourceKickoffReconfirmed:Object.hasOwn(data,'time_utc')};
}

export async function rebuildPitchArchive(directory){
 const entries=[];
 for(const file of (await fs.readdir(path.join(directory,'observations'))).sort()){
  if(!/^[a-f0-9]{64}\.json$/.test(file))throw fail('UNKNOWN_OBSERVATION');
  const observation=await readSnapshot(path.join(directory,'observations',file));
  const raw=await fs.readFile(path.join(directory,'objects',observation.rawSha256+'.json'));
  if(pitchBytesHash(raw)!==observation.rawSha256||observation.receipt.rawSha256!==observation.rawSha256||observation.receipt.url!==observation.url||observation.receipt.acquiredAtUtc!==observation.acquiredAtUtc)throw fail('OBJECT_CHANGED');
  if(digest({url:observation.url,acquiredAtUtc:observation.acquiredAtUtc,rawSha256:observation.rawSha256})!==file.slice(0,64))throw fail('OBSERVATION_ID_CHANGED');
  entries.push({key:file.slice(0,64),observation,body:JSON.parse(raw.toString('utf8'))});
 }
 const universe=buildPitchArchiveUniverse(entries.filter(e=>e.observation.url.includes('/leagues/'))),byId=new Map(universe.map(f=>[f.fixture.id,f]));
 const observations=[],urlVersions=new Map();
 for(const e of entries.filter(e=>pitchArchiveKind(e.observation.url))){
  const fixtureId=e.observation.url.split('/').at(-2),f=byId.get(fixtureId);
  if(!f||!f.candidate)throw fail('STATISTICS_OUTSIDE_COMPLETED_UNIVERSE');
  const request={...f,kind:pitchArchiveKind(e.observation.url)},review=reviewPitchArchiveResponse({request,status:e.observation.receipt.status,body:e.body,observedAtUtc:e.observation.acquiredAtUtc});
  const traditionalFieldInventory=request.kind==='stats'&&Array.isArray(e.body.data?.periods)?e.body.data.periods.flatMap(p=>
   [...new Set(p.groups.flatMap(g=>g.items.map(i=>i.key)))].flatMap(metric=>['home','away'].map(side=>({period:p.period,side,metric,
    definitionStatus:PITCH_TEAM_METRICS.includes(metric)?'EXISTING_TRADITIONAL_DICTIONARY':'UNMAPPED_SEMANTICS_NOT_ADMITTED',
    measurement:pitchTeamField(e.body.data,metric,side,p.period)})))):[];
  const item={key:e.key,url:e.observation.url,kind:request.kind,fixtureId,season:f.season,scope:f.scope,observedAtUtc:e.observation.acquiredAtUtc,rawSha256:e.observation.rawSha256,review,traditionalFieldInventory};
  observations.push(item);const versions=urlVersions.get(item.url)??[];versions.push(item);urlVersions.set(item.url,versions);
 }
 const revisions=[...urlVersions].filter(([,v])=>v.length>1).map(([url,v])=>({url,observations:v.map(x=>x.key),rawHashes:[...new Set(v.map(x=>x.rawSha256))],resolution:'EXPLICIT_REVIEW_REQUIRED_NO_LATEST_WINS'}));
 const availability=universe.filter(f=>f.candidate).flatMap(f=>['stats','advanced'].map(kind=>{
  const url=urlFor(f.fixture.id,kind),versions=urlVersions.get(url)??[];
  return {fixtureId:f.fixture.id,season:f.season,scope:f.scope,kind,state:versions.length>1?'REVISION_REQUIRES_REVIEW':versions[0]?.review.classification??'NOT_OBSERVED',
   observationKeys:versions.map(o=>o.key),plannedForHistoricalAcquisition:kind==='stats'||Number(f.season.slice(0,4))>=2024};
 }));
 const coverage=PITCH_HISTORY_SEASONS.map(season=>{
  const candidates=universe.filter(f=>f.season===season&&f.candidate),selected=observations.filter(o=>o.season===season);
  const stats=selected.filter(o=>o.kind==='stats'),advanced=selected.filter(o=>o.kind==='advanced');
  const mergeMatrix=(kind)=>{const maps=new Map();for(const o of kind==='stats'?stats:advanced){const rows=kind==='stats'?o.review.quality?.matrix??[]:summarizePitchAdvanced([{season,scope:o.scope,fixture:byId.get(o.fixtureId).fixture,review:o.review}],{season}).matrix;
   for(const row of rows){const key=(row.period??'All')+':'+(row.metric??row.path),old=maps.get(key)??{key,denominator:0,counts:{}};old.denominator+=row.denominator;for(const [k,v] of Object.entries(row.counts))old.counts[k]=(old.counts[k]??0)+v;maps.set(key,old);}}
   return [...maps.values()];};
  return {season,listed:universe.filter(f=>f.season===season).length,candidates:candidates.length,regularCandidates:candidates.filter(f=>f.scope==='REGULAR_LEAGUE').length,
   statsFixtures:new Set(stats.map(o=>o.fixtureId)).size,advancedResponses:advanced.length,advancedAvailable:advanced.filter(o=>o.review.classification.startsWith('VALID_')).length,
   advancedUnavailable:advanced.filter(o=>o.review.classification==='ANALYTICS_UNAVAILABLE').length,
   statsMatrix:mergeMatrix('stats'),advancedMatrix:mergeMatrix('advanced'),populationCompletenessInferred:false};
 });
 const dependencies=['pitchapi-team-archive.mjs','pitchapi-history-quality.mjs','pitchapi-history-plan.mjs','pitchapi-inventory.mjs','pitchapi-advanced.mjs'];
 const normalizerHashes={};for(const name of dependencies)normalizerHashes[name]=pitchBytesHash(await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),name)));
 const view={schema:ARCHIVE_VERSION,normalizerVersion:1,normalizerHashes,sourceObservationKeys:entries.map(e=>e.key),universe,observations,availability,revisions,coverage,
  retention:'PRIVATE_USER_CONFIRMED',sourceModelVersion:null,
  trainingEligible:false,featurePolicy:'PRIOR_FIXTURE_AND_OBSERVATION_BEFORE_CUTOFF_ONLY_NO_IMPUTATION'};
 const sha=digest(view);await archivePut(path.join(directory,'views',sha+'.json'),view);return {sha,view};
}

// Temporal strata on the remaining unseen fixtures, never on observed values.
const stratify=(rows,n)=>Array.from({length:n},(_,i)=>rows[Math.floor((i+.5)*rows.length/n)]);
export function planPitchArchivePilot({view,viewSha256,createdAtUtc,statsPerSeason=8,advancedPerRecentSeason=4}){
 if(digest(view)!==viewSha256||!time(createdAtUtc)||!Number.isSafeInteger(statsPerSeason)||statsPerSeason<1||!Number.isSafeInteger(advancedPerRecentSeason)||advancedPerRecentSeason<0||advancedPerRecentSeason>statsPerSeason)throw fail('PLAN_INPUT');
 if(view.revisions.length||view.observations.some(o=>!o.review.canContinue))throw fail('UNRESOLVED_SOURCE_CONFLICT');
 const known=new Set(view.observations.map(o=>o.url)),requests=[];
 for(const season of PITCH_HISTORY_SEASONS){
  const rows=view.universe.filter(f=>f.season===season&&f.candidate&&Date.parse(f.fixture.time_utc)<Date.parse(createdAtUtc)&&!known.has(urlFor(f.fixture.id,'stats'))).sort(compare);
  if(rows.length<statsPerSeason)throw fail('INSUFFICIENT_UNSEEN_FIXTURES');
  const selected=stratify(rows,statsPerSeason);
  const recent=Number(season.slice(0,4))>=2024;
  const advanced=new Set(recent?stratify(selected,advancedPerRecentSeason).map(f=>f.fixture.id):[]);
  for(const f of selected){requests.push({season,scope:f.scope,fixture:f.fixture,catalogObservations:f.catalogObservations,kind:'stats',url:urlFor(f.fixture.id,'stats')});
   if(advanced.has(f.fixture.id)&&!known.has(urlFor(f.fixture.id,'advanced')))requests.push({season,scope:f.scope,fixture:f.fixture,catalogObservations:f.catalogObservations,kind:'advanced',url:urlFor(f.fixture.id,'advanced')});}
 }
 if(requests.length>60)throw fail('PILOT_BUDGET');
 return {schema:ARCHIVE_VERSION+'-plan',createdAtUtc,sourceViewSha256:viewSha256,statsPerSeason,advancedPerRecentSeason,policy:'EQUAL_CHRONOLOGICAL_STRATA_MIDPOINT_OF_UNSEEN_V1',
  maxRequests:requests.length,ceiling:60,requests,retries:0,pagination:false,replacements:false,trainingEligible:false};
}

// Subsequent batches can finish exhausted seasons and analytics-only backlogs.
// Planning remains offline; every resulting manifest needs its own consent.
export function planPitchArchiveIncremental({view,viewSha256,createdAtUtc,limit=60}){
 if(digest(view)!==viewSha256||!time(createdAtUtc)||!Number.isSafeInteger(limit)||limit<1||limit>60)throw fail('PLAN_INPUT');
 if(view.revisions.length||view.observations.some(o=>!o.review.canContinue))throw fail('UNRESOLVED_SOURCE_CONFLICT');
 const known=new Set(view.observations.map(o=>o.url));
 const queues=PITCH_HISTORY_SEASONS.map(season=>view.universe.filter(f=>f.season===season&&f.candidate&&Date.parse(f.fixture.time_utc)<Date.parse(createdAtUtc)).sort(compare).flatMap(f=>
  (Number(season.slice(0,4))>=2024?['stats','advanced']:['stats']).filter(kind=>!known.has(urlFor(f.fixture.id,kind))).map(kind=>({season,scope:f.scope,fixture:f.fixture,catalogObservations:f.catalogObservations,kind,url:urlFor(f.fixture.id,kind)}))));
 const counts=queues.map(()=>0);let count=0;
 while(count<limit){let added=false;for(let i=0;i<queues.length&&count<limit;i++)if(counts[i]<queues[i].length){counts[i]++;count++;added=true;}if(!added)break;}
 const requests=queues.flatMap((rows,i)=>stratify(rows,counts[i]));
 return {schema:ARCHIVE_VERSION+'-plan',createdAtUtc,sourceViewSha256:viewSha256,policy:'REMAINING_ENDPOINTS_BALANCED_TEMPORAL_STRATA_V1',limit,
  maxRequests:requests.length,ceiling:60,requests,retries:0,pagination:false,replacements:false,trainingEligible:false};
}

export function validatePitchArchiveGrant(grant){
 const p=grant?.plan;
 if(grant?.schema!==ARCHIVE_VERSION+'-grant'||grant.authorized!==true||grant.scope!=='PRIVATE_HISTORICAL_TEAM_PILOT_ONLY'||grant.retention!=='PRIVATE_USER_CONFIRMED'||!time(grant.approvedAtUtc)||!time(grant.recordedAtUtc)||Date.parse(grant.approvedAtUtc)>Date.parse(grant.recordedAtUtc)||grant.ceiling!==60||p?.schema!==ARCHIVE_VERSION+'-plan'||digest(p)!==grant.planSha256||p.maxRequests!==p.requests?.length||p.maxRequests<1||p.maxRequests>60||p.retries!==0||p.pagination!==false||p.replacements!==false||new Set(p.requests.map(r=>r.url)).size!==p.requests.length)throw fail('EXACT_GRANT_REQUIRED');
 for(const r of p.requests){if(!PITCH_HISTORY_SEASONS.includes(r.season)||r.url!==urlFor(r.fixture?.id,r.kind)||!pitchArchiveKind(r.url)||r.fixture.status!=='finished'||!time(r.fixture.time_utc)||r.kind==='advanced'&&Number(r.season.slice(0,4))<2024||!['home','away'].every(side=>/^t_[A-Za-z0-9]{6}$/.test(r.fixture[side+'_team']?.id)&&typeof r.fixture[side+'_team'].name==='string')||r.fixture.home_team.id===r.fixture.away_team.id)throw fail('REQUEST_SCOPE');}
}
