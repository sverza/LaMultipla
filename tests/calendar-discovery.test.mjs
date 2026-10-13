// SYNTHETIC ONLY: invented events and clocks; no real feed, key or provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {calendarSeason,discoverCalendar,CALENDAR_LICENSE_SHA256} from '../scripts/lib/orchestration/calendar-discovery.mjs';
import {collectPrivateCalendar,fetchPublicCalendar} from '../scripts/lib/orchestration/calendar-collection.mjs';
import {sha256} from '../scripts/lib/goals/data.mjs';
import {readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {loadJson,saveJson} from '../scripts/lib/private-store.mjs';
import {account} from './fixtures/oddspapi.mjs';

const now='2026-10-13T00:00:00.000Z',key='SYNTHETIC_PROVIDER_KEY_NEVER_PERSIST';
function fixtures({at=now,matchday=7,date='2026-10-17',utcTime='13:00',wallTime='15:00'}={}){
  const matches=Array.from({length:10},(_,i)=>({round:`Matchday ${matchday}`,date,time:wallTime,team1:`SYNTHETIC Home ${i}`,team2:`SYNTHETIC Away ${i}`}));
  const body=JSON.stringify({name:'Italian Serie A 2026/27',matches});
  const source={schema:'lamultipla-calendar-public-source-v1',source:'openfootball/football.json',path:'2026-27/it.1.json',commit:'a'.repeat(40),
    license:'CC0-1.0',licenseSha256:CALENDAR_LICENSE_SHA256,body,bodySha256:sha256(body),fetchedAtUtc:at};
  const provider=matches.map((m,i)=>({fixtureId:'id'+(1000+i),sportId:10,tournamentId:23,seasonId:123,statusId:0,
    participant1Name:m.team1,participant2Name:m.team2,startTime:`${date}T${utcTime}:00.000Z`,updatedAt:at}));
  return {source,provider,matches};
}
test('independent source assigns exact season/round and all twenty identities; provider supplies UTC without odds',()=>{
  const f=fixtures(),d=discoverCalendar(f.source,f.provider,{now});assert.equal(d.season,'2026/27');assert.equal(d.rounds.length,1);
  assert.equal(d.rounds[0].matchday,7);assert.equal(d.rounds[0].events.length,10);assert.equal(d.rounds[0].firstKickoffUtc,'2026-10-17T13:00:00.000Z');
  assert.equal(d.excluded.length,0);assert.equal('odds' in d,false);assert.equal('forecast' in d,false);
  f.provider[0].startTime='2026-10-17T13:00:00+00:00';
  assert.equal(discoverCalendar(f.source,f.provider,{now}).rounds[0].events[0].kickoffUtc,'2026-10-17T13:00:00.000Z');
  f.provider[0].startTime='2026-10-17';assert.throws(()=>discoverCalendar(f.source,f.provider,{now}),/FIXTURE_INVALID/);
  assert.equal(calendarSeason('2027-06-30T23:59:59Z'),'2026/27');assert.equal(calendarSeason('2027-07-01T00:00:00Z'),'2027/28');
});
test('Italian comparison handles DST change without inventing a missing or conflicting kickoff',()=>{
  const at='2026-10-25T00:00:00.000Z',f=fixtures({at,date:'2026-10-25',utcTime:'14:00',wallTime:'15:00',matchday:8});
  assert.equal(discoverCalendar(f.source,f.provider,{now:at}).rounds.length,1);
  f.provider[0].startTime='2026-10-25T13:00:00.000Z';const bad=discoverCalendar(f.source,f.provider,{now:at});
  assert.equal(bad.rounds.length,0);assert.ok(bad.excluded.some(r=>r.reason==='SOURCE_TIME_OR_RESULT_CONFLICT'));
  const summer=fixtures();summer.matches[0].time=undefined;summer.source.body=JSON.stringify({name:'Italian Serie A 2026/27',matches:summer.matches});summer.source.bodySha256=sha256(summer.source.body);
  assert.equal(discoverCalendar(summer.source,summer.provider,{now}).rounds.length,0);
});
test('protected pilot, incomplete round and already started events cannot produce a new eligible round',()=>{
  const old=fixtures({matchday:6});assert.equal(discoverCalendar(old.source,old.provider,{now}).rounds.length,0);
  const f=fixtures();assert.equal(discoverCalendar(f.source,f.provider.slice(1),{now}).rounds.length,0);
  const late=fixtures({at:'2026-10-17T12:56:00.000Z'});assert.equal(discoverCalendar(late.source,late.provider,{now:late.source.fetchedAtUtc}).rounds.length,0);
});
test('license/commit/clock/body, duplicate IDs, mixed league and any premature odds fail closed',()=>{
  const f=fixtures();
  for(const source of [{...f.source,license:'UNKNOWN'},{...f.source,body:f.source.body+' '},{...f.source,commit:'bad'},
    {...f.source,fetchedAtUtc:'2026-10-14T00:00:00Z'},{...f.source,fetchedAtUtc:'2026-10-11T00:00:00Z'}])assert.throws(()=>discoverCalendar(source,f.provider,{now}));
  assert.throws(()=>discoverCalendar(f.source,[...f.provider,f.provider[0]],{now}),/AMBIGUOUS/);
  assert.throws(()=>discoverCalendar(f.source,[{...f.provider[0],tournamentId:17}],{now}),/INVALID/);
  assert.throws(()=>discoverCalendar(f.source,[{...f.provider[0],bookmakerOdds:{SYNTHETIC_ONLY:true}}],{now}),/ODDS_BEFORE_FORECAST/);
});
async function setup(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-calendar-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let at=now;const calls=[],f=fixtures(),directory=path.join(root,'.local/oddspapi');
  const args={root,clock:()=>new Date(at),pause:async()=>{},keyLoader:async()=>key,
    publicLoader:async()=>({...f.source,fetchedAtUtc:at}),fetchImpl:async url=>{
      calls.push(url.pathname);if(url.pathname.endsWith('/account'))return new Response(JSON.stringify(account()));
      assert.equal(url.pathname,'/v4/fixtures');assert.equal(url.searchParams.get('hasOdds'),null);assert.equal(url.searchParams.get('bookmakers'),null);
      const ledger=await loadJson(path.join(directory,'quota.json'));assert.equal(ledger.attempts.at(-1).endpoint,'/fixtures');
      assert.equal(url.searchParams.get('apiKey'),key);return new Response(JSON.stringify(f.provider));}};
  return {root,args,calls,f,directory,setTime:value=>{at=value;}};
}
test('calendar collection uses one counted fixture request, pre-transmission ledger and daily immutable cache',async t=>{
  const s=await setup(t),first=await collectPrivateCalendar(s.args);assert.equal(first.billableAttemptsThisRun,1);assert.equal(first.quoteRequests,0);
  const bytes=await fs.readFile(first.file,'utf8');assert.doesNotMatch(bytes,/SYNTHETIC_PROVIDER_KEY|synthetic-secret-never-save/);
  assert.deepEqual(s.calls,['/v4/account','/v4/fixtures']);s.setTime('2026-10-13T01:00:00.000Z');
  const cached=await collectPrivateCalendar({...s.args,keyLoader:async()=>assert.fail('No credentials needed for fresh cache')});
  assert.equal(cached.reused,true);assert.equal(cached.billableAttemptsThisRun,0);assert.equal(cached.file,first.file);assert.equal(s.calls.length,2);
  assert.equal(await fs.readFile(first.file,'utf8'),bytes);assert.equal((await readSnapshot(first.file)).source.license,'CC0-1.0');
});
test('report committed before crash is recovered without a new provider call or retiming',async t=>{
  const s=await setup(t);await assert.rejects(collectPrivateCalendar({...s.args,afterSnapshot:async()=>{throw new Error('SYNTHETIC stop');}}),/REVIEW_REQUIRED/);
  const recovered=await collectPrivateCalendar({...s.args,keyLoader:async()=>assert.fail()});assert.equal(recovered.reused,true);assert.equal(s.calls.length,2);
  assert.equal(recovered.observedAtUtc,now);assert.equal((await loadJson(path.join(s.directory,'calendar-state.private.json'))).pendingId,null);
});
test('unknown counted attempt never retries across restart or a new day; diagnostics contain no raw error',async t=>{
  const s=await setup(t),fetchImpl=s.args.fetchImpl;
  s.args.fetchImpl=async url=>{if(url.pathname.endsWith('/account'))return fetchImpl(url);s.calls.push(url.pathname);throw new Error(key+' PRIVATE_URL');};
  await assert.rejects(collectPrivateCalendar(s.args),/REVIEW_REQUIRED/);s.setTime('2026-10-14T00:00:01.000Z');
  await assert.rejects(collectPrivateCalendar(s.args),/REVIEW_REQUIRED/);assert.equal(s.calls.length,2);
  const text=await fs.readFile(path.join(s.directory,'calendar-last-failure.private.json'),'utf8');assert.doesNotMatch(text,/SYNTHETIC_PROVIDER_KEY|PRIVATE_URL/);
  assert.equal((await loadJson(path.join(s.directory,'quota.json'))).attempts.length,1);
});
test('calendar and odds share protected 200-request budget; reserve blocks before fixture transmission',async t=>{
  const s=await setup(t);await saveJson(path.join(s.directory,'quota.json'),{schema:1,attempts:Array.from({length:200},()=>({atUtc:now,endpoint:'/markets'}))});
  await assert.rejects(collectPrivateCalendar(s.args));assert.deepEqual(s.calls,['/v4/account']);
  assert.equal((await loadJson(path.join(s.directory,'quota.json'))).attempts.length,200);
  assert.equal((await loadJson(path.join(s.directory,'calendar-last-failure.private.json'))).billableAttempts,0);
});
test('fresh acquisition after cache expiry preserves prior snapshot and rejects a rollback clock',async t=>{
  const s=await setup(t),first=await collectPrivateCalendar(s.args),bytes=await fs.readFile(first.file,'utf8');
  s.setTime('2026-10-14T00:00:01.000Z');const next=await collectPrivateCalendar(s.args);assert.notEqual(next.file,first.file);assert.equal(s.calls.length,4);
  assert.equal(await fs.readFile(first.file,'utf8'),bytes);s.setTime(now);await assert.rejects(collectPrivateCalendar(s.args),/STATE_INVALID/);assert.equal(s.calls.length,4);
});
test('public source pins exact license and commit; license change blocks before key loading or provider access',async t=>{
  // Git may check out the text fixture as CRLF on Windows; the HTTP fixture
  // must reproduce the original LF bytes whose license hash is pinned.
  const s=await setup(t),license=(await fs.readFile(new URL('./fixtures/openfootball-CC0.txt',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  const urls=[];const fetchImpl=async url=>{urls.push(url);return new Response(url.includes('commits/master')?JSON.stringify({sha:'a'.repeat(40)}):url.endsWith('LICENSE.md')?license:s.f.source.body);};
  const source=await fetchPublicCalendar({fetchImpl,clock:s.args.clock});assert.equal(source.bodySha256,s.f.source.bodySha256);assert.ok(urls.slice(1).every(u=>u.includes('/'+'a'.repeat(40)+'/')));
  const bad=async url=>new Response(url.includes('commits/master')?JSON.stringify({sha:'a'.repeat(40)}):'UNRECOGNIZED LICENSE');
  await assert.rejects(collectPrivateCalendar({...s.args,keyLoader:async()=>assert.fail('No provider credential access'),
    publicLoader:()=>fetchPublicCalendar({fetchImpl:bad,clock:s.args.clock})}),/LICENSE_REVIEW/);assert.equal(s.calls.length,0);
});
test('account error is diagnosed without a counted intent, key or raw response and can be checked again',async t=>{
  const s=await setup(t);s.args.fetchImpl=async()=>new Response(JSON.stringify({message:key}),{status:403});
  await assert.rejects(collectPrivateCalendar(s.args),/ACCOUNT_CHECK_FAILED/);
  const failure=await loadJson(path.join(s.directory,'calendar-last-failure.private.json'));
  assert.equal(failure.billableAttempts,0);assert.equal(failure.httpStatus,403);assert.doesNotMatch(JSON.stringify(failure),/SYNTHETIC_PROVIDER_KEY/);
  await assert.rejects(fs.stat(path.join(s.directory,'quota.json')),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(s.directory,'calendar-state.private.json')),{code:'ENOENT'});
  await assert.rejects(collectPrivateCalendar(s.args),/ACCOUNT_CHECK_FAILED/);
});
test('observing the calendar now does not certify missing past results or partial scores as current history',()=>{
  const f=fixtures(),past=f.matches.map((m,i)=>({...m,round:'Matchday 6',date:'2026-10-10',team1:m.team2,team2:m.team1,
    ...(i<5?{score:{ft:[1,0]}}:i===5?{score:{ht:[0,0]}}:{})}));
  f.source.body=JSON.stringify({name:'Italian Serie A 2026/27',matches:[...past,...f.matches]});f.source.bodySha256=sha256(f.source.body);
  const result=discoverCalendar(f.source,f.provider,{now});assert.equal(result.rounds.length,1);assert.equal(result.publicLastScoredDate,'2026-10-10');
  assert.equal(result.publicMissingAvailableResults,5);assert.deepEqual(result.roundsMissingPublicResults,[{matchday:6,events:5}]);
  assert.equal('historyComplete' in result,false);
  f.provider[0].participant1Name='__proto__';assert.throws(()=>discoverCalendar(f.source,f.provider,{now}),/TEAM_IDENTITY_INVALID/);
});

test('cancelled, postponed, unidentified and inconsistent-season fixtures block a complete round without official reconfirmation',()=>{
  for(const mutate of [f=>{f.provider[0].statusId=3;},f=>{f.provider[0].startTime='2026-10-18T13:00:00.000Z';},
    f=>{f.provider[0].participant1Name='SYNTHETIC Unknown';},f=>{f.provider[0].seasonId=456;},
    f=>{[f.provider[0].participant1Name,f.provider[0].participant2Name]=[f.provider[0].participant2Name,f.provider[0].participant1Name];}]){
    const f=fixtures();mutate(f);const result=discoverCalendar(f.source,f.provider,{now});
    assert.equal(result.rounds.length,0);assert.equal(result.officiallyReconfirmed,false);
    assert.equal(result.verification,'CC0_PROVIDER_CROSS_CHECK');assert.equal(result.providerFixtures.length,10);
  }
  const f=fixtures();f.provider[0].statusId=3;
  assert.ok(discoverCalendar(f.source,f.provider,{now}).excluded.some(r=>r.reason==='PROVIDER_CANCELLED'));
});
test('canonical team reconciliation preserves provider IDs and never guesses an unknown alias',()=>{
  const f=fixtures();f.matches[0].team1='FC Internazionale Milano';f.provider[0].participant1Name='Inter';
  f.source.body=JSON.stringify({name:'Italian Serie A 2026/27',matches:f.matches});f.source.bodySha256=sha256(f.source.body);
  const result=discoverCalendar(f.source,f.provider,{now});
  assert.equal(result.rounds[0].events[0].home,'FC Internazionale Milano');assert.equal(result.rounds[0].events[0].fixtureId,'id1000');
  f.provider[0].participant1Name='SYNTHETIC Unverified Alias';assert.equal(discoverCalendar(f.source,f.provider,{now}).rounds.length,0);
});
test('crash recovery respects a stricter freshness window without another request or snapshot retiming',async t=>{
  const s=await setup(t);await assert.rejects(collectPrivateCalendar({...s.args,afterSnapshot:async()=>{throw new Error('SYNTHETIC stop');}}),/REVIEW_REQUIRED/);
  s.setTime('2026-10-13T02:00:00.000Z');
  await assert.rejects(collectPrivateCalendar({...s.args,maxAgeMs:3600000,keyLoader:async()=>assert.fail('No credential access during recovery')}),/RECOVERED_SNAPSHOT_STALE/);
  assert.deepEqual(s.calls,['/v4/account','/v4/fixtures']);
  const state=await loadJson(path.join(s.directory,'calendar-state.private.json'));
  assert.equal(state.pendingId,null);assert.equal((await readSnapshot(path.join(s.directory,'calendar-acquisitions',state.latestId,'snapshot.json'))).observedAtUtc,now);
});
