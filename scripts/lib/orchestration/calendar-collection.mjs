import path from 'node:path';
import {ApiClient} from '../api-client.mjs';
import {withLock,optionalJson,saveJson} from '../private-store.mjs';
import {digest,readSnapshot,writeExclusive} from '../prospective/store.mjs';
import {loadOddsKey} from '../private/odds-key.mjs';
import {sha256} from '../goals/data.mjs';
import {calendarSeason,discoverCalendar,CALENDAR_LICENSE_SHA256} from './calendar-discovery.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fixtureFields=['fixtureId','sportId','tournamentId','seasonId','statusId','participant1Name','participant2Name','startTime','updatedAt'];

export async function fetchPublicCalendar({fetchImpl=fetch,clock=()=>new Date()}={}){
  const season=calendarSeason(clock()),relative=season.replace('/','-')+'/it.1.json';
  const get=async(url,limit)=>{
    try{const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'LaMultipla-private-calendar'}});
      if(!response.ok)fail('CALENDAR_PUBLIC_NETWORK_FAILED');const body=await response.text();
      if(body.length>limit)fail('CALENDAR_PUBLIC_RESPONSE_TOO_LARGE');return body;
    }catch(error){if(/^CALENDAR_[A-Z_]+$/.test(error.code??''))throw error;fail('CALENDAR_PUBLIC_NETWORK_FAILED');}
  };
  let metadata;try{metadata=JSON.parse(await get('https://api.github.com/repos/openfootball/football.json/commits/master',65536));}
  catch(error){if(error.code)throw error;fail('CALENDAR_PUBLIC_METADATA_INVALID');}
  if(!/^[a-f0-9]{40}$/.test(metadata?.sha))fail('CALENDAR_PUBLIC_METADATA_INVALID');
  const base=`https://raw.githubusercontent.com/openfootball/football.json/${metadata.sha}/`;
  const license=await get(base+'LICENSE.md',32768);
  if(!license.startsWith('CC0 1.0 Universal')||sha256(license)!==CALENDAR_LICENSE_SHA256)fail('CALENDAR_LICENSE_REVIEW_REQUIRED');
  const body=await get(base+relative,1024*1024);
  return {schema:'lamultipla-calendar-public-source-v1',source:'openfootball/football.json',path:relative,commit:metadata.sha,
    license:'CC0-1.0',licenseSha256:sha256(license),body,bodySha256:sha256(body),fetchedAtUtc:new Date(clock()).toISOString()};
}
function snapshotPath(directory,id){if(!hex(id))fail('CALENDAR_STATE_INVALID');return path.join(directory,'calendar-acquisitions',id,'snapshot.json');}
function validateSnapshot(snapshot,now){
  if(snapshot?.schema!=='lamultipla-private-calendar-snapshot-v1'||!Number.isFinite(Date.parse(snapshot.observedAtUtc))
    ||Date.parse(snapshot.observedAtUtc)>new Date(now).getTime()||!Array.isArray(snapshot.fixtures)
    ||snapshot.acquisition?.billableAttempts!==1)fail('CALENDAR_SNAPSHOT_INVALID');
  // Original observation is immutable. Current eligibility is recomputed later.
  discoverCalendar(snapshot.source,snapshot.fixtures,{now:snapshot.observedAtUtc});
  if(snapshot.fixtures.some(f=>Object.keys(f).some(k=>!fixtureFields.includes(k))))fail('CALENDAR_SNAPSHOT_INVALID');
}
const summary=(snapshot,filename,discovery,reused)=>({purpose:'PRIVATE_CALENDAR_DISCOVERY',file:filename,season:discovery.season,
  observedAtUtc:snapshot.observedAtUtc,reused,billableAttemptsThisRun:reused?0:1,
  quotaObservedAtUtc:snapshot.acquisition.accountBefore.checkedAtUtc,providerRequestCountBefore:snapshot.acquisition.accountBefore.requestCount,
  remainingLowerBoundAtObservation:snapshot.acquisition.accountBefore.remaining-snapshot.acquisition.billableAttempts,remainingIsEstimate:true,
  publicLastScoredDate:discovery.publicLastScoredDate,publicMissingAvailableResults:discovery.publicMissingAvailableResults,
  roundsMissingPublicResults:discovery.roundsMissingPublicResults,
  quoteRequests:0,forecastProduced:false,actualStakeEUR:0,tasksRegistered:false,
  rounds:discovery.rounds.map(r=>({season:r.season,matchday:r.matchday,events:r.events.length,firstKickoffUtc:r.firstKickoffUtc})),
  excluded:Object.entries(discovery.excluded.reduce((counts,item)=>{counts[item.reason]=(counts[item.reason]??0)+1;return counts;},{})).map(([reason,count])=>({reason,count})),
  verification:'CC0_PROVIDER_CROSS_CHECK_NOT_NEW_OFFICIAL_LEGA_VERIFICATION'});

// Daily cache and a durable acquisition intent share the original quota lock.
// A committed snapshot is recovered after crash; an unknown paid attempt never repeats.
export async function collectPrivateCalendar({root,fetchImpl=fetch,clock=()=>new Date(),keyLoader=()=>loadOddsKey(root),
  publicLoader=()=>fetchPublicCalendar({fetchImpl,clock}),maxAgeMs=86400000,pause,afterSnapshot=async()=>{}}){
  if(!Number.isInteger(maxAgeMs)||maxAgeMs<60000||maxAgeMs>86400000)fail('CALENDAR_CACHE_POLICY_INVALID');
  const directory=path.join(root,'.local/oddspapi'),stateFile=path.join(directory,'calendar-state.private.json');
  return withLock(directory,async()=>{
    const start=new Date(clock());if(!Number.isFinite(start.getTime()))fail('CALENDAR_CLOCK_INVALID');
    let state=await optionalJson(stateFile)??{schema:'lamultipla-private-calendar-state-v1',lastObservedAtUtc:null,pendingId:null,latestId:null};
    if(state.schema!=='lamultipla-private-calendar-state-v1'||Object.keys(state).sort().join(',')!=='lastObservedAtUtc,latestId,pendingId,schema'
      ||[state.latestId,state.pendingId].some(v=>v!==null&&!hex(v))
      ||state.lastObservedAtUtc!==null&&(!Number.isFinite(Date.parse(state.lastObservedAtUtc))||Date.parse(state.lastObservedAtUtc)>start.getTime()))fail('CALENDAR_STATE_INVALID');
    const recover=async id=>{
      const filename=snapshotPath(directory,id);let snapshot;
      try{snapshot=await readSnapshot(filename);}catch(e){if(e.code==='ENOENT')return null;throw e;}
      validateSnapshot(snapshot,start);
      return {filename,snapshot};
    };
    if(state.pendingId){
      const recovered=await recover(state.pendingId);if(!recovered)fail('CALENDAR_ATTEMPT_REVIEW_REQUIRED');
      state={...state,latestId:state.pendingId,pendingId:null,lastObservedAtUtc:start.toISOString()};await saveJson(stateFile,state);
      // Recovery closes the old intent without spending another request. A stale
      // observation requires a later fresh collection, never a retimed snapshot.
      if(start-Date.parse(recovered.snapshot.observedAtUtc)>=maxAgeMs
        ||start-Date.parse(recovered.snapshot.source.fetchedAtUtc)>86400000)fail('CALENDAR_RECOVERED_SNAPSHOT_STALE');
      return summary(recovered.snapshot,recovered.filename,discoverCalendar(recovered.snapshot.source,recovered.snapshot.fixtures,{now:start}),true);
    }
    if(state.latestId){
      const cached=await recover(state.latestId);if(!cached)fail('CALENDAR_SNAPSHOT_MISSING');
      const age=start-Date.parse(cached.snapshot.observedAtUtc);
      if(age>=0&&age<maxAgeMs&&start-Date.parse(cached.snapshot.source.fetchedAtUtc)<=86400000){
        await saveJson(stateFile,{...state,lastObservedAtUtc:start.toISOString()});
        return summary(cached.snapshot,cached.filename,discoverCalendar(cached.snapshot.source,cached.snapshot.fixtures,{now:start}),true);
      }
    }
    // Reject bad/unlicensed public input before any provider request.
    const source=await publicLoader();discoverCalendar(source,[],{now:clock()});
    const key=await keyLoader(),client=new ApiClient({key,directory,fetchImpl,clock,pause});
    try{await client.checkAccount();}catch{
      await saveJson(path.join(directory,'calendar-last-failure.private.json'),{schema:'lamultipla-calendar-failure-v1',atUtc:new Date(clock()).toISOString(),
        billableAttempts:0,reason:'CALENDAR_ACCOUNT_CHECK_FAILED',httpStatus:client.requests.at(-1)?.status??null});
      fail('CALENDAR_ACCOUNT_CHECK_FAILED');
    }
    const startedAtUtc=new Date(clock()).toISOString(),id=digest({sourceSha256:digest(source),startedAtUtc,latestId:state.latestId});
    const transaction=path.dirname(snapshotPath(directory,id));
    await writeExclusive(path.join(transaction,'intent.json'),{schema:'lamultipla-calendar-acquisition-intent-v1',startedAtUtc,sourceSha256:digest(source)});
    state={...state,pendingId:id,lastObservedAtUtc:startedAtUtc};await saveJson(stateFile,state);
    try{
      const raw=await client.get('/fixtures',{tournamentId:23,sportId:10,statusId:0,from:startedAtUtc,
        to:new Date(Date.parse(startedAtUtc)+28*86400000).toISOString(),language:'en'});
      // Check the original response for forbidden odds before whitelisting.
      discoverCalendar(source,raw,{now:clock()});
      const fixtures=raw.map(f=>Object.fromEntries(fixtureFields.filter(k=>f[k]!==undefined).map(k=>[k,f[k]])));
      if(JSON.stringify(fixtures).includes(key))fail('CALENDAR_CREDENTIAL_IN_RESPONSE_REFUSED');
      const observedAtUtc=new Date(clock()).toISOString(),discovery=discoverCalendar(source,fixtures,{now:observedAtUtc});
      const snapshot={schema:'lamultipla-private-calendar-snapshot-v1',source,fixtures,observedAtUtc,
        acquisition:{billableAttempts:client.used,accountBefore:client.account,requests:client.requests}};
      validateSnapshot(snapshot,clock());const filename=snapshotPath(directory,id);await writeExclusive(filename,snapshot);await afterSnapshot();
      await saveJson(stateFile,{...state,pendingId:null,latestId:id,lastObservedAtUtc:observedAtUtc});
      return summary(snapshot,filename,discovery,false);
    }catch(error){
      await saveJson(path.join(directory,'calendar-last-failure.private.json'),{schema:'lamultipla-calendar-failure-v1',atUtc:new Date(clock()).toISOString(),
        billableAttempts:client.used,reason:/^CALENDAR_[A-Z_]+$/.test(error.code??'')?error.code:'CALENDAR_ACQUISITION_FAILED'});
      throw Object.assign(new Error('CALENDAR_ATTEMPT_REVIEW_REQUIRED'),{code:'CALENDAR_ATTEMPT_REVIEW_REQUIRED'});
    }
  });
}
