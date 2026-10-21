import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {acquirePitchTrial,readPitchResponse,selectPitchLeague,matchPitchFixture,pitchRequestKind,PITCH_BASE} from '../scripts/lib/pitchapi-trial.mjs';
const at=new Date('2026-10-21T18:00:00Z'),secret='SYNTHETIC_PITCH_PRIVATE_ONLY';
const grant=()=>({schema:'lamultipla-pitchapi-trial-grant-v1',authorized:true,maxRequests:12,scope:'PRIVATE_DIAGNOSTIC_ONLY',retention:'TEMPORARY_REVIEW_ONLY',approvedAtUtc:at.toISOString()});
async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-pitch-trial-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
const options=directory=>({directory,grant:grant(),clock:()=>at,keyLoader:async()=>secret,url:PITCH_BASE+'/v1/leagues'});
const reply=(body={data:{}},status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('Pitch trial refuses unapproved grants and URLs before credential access or transport',async t=>{
 const o=options(await setup(t));o.keyLoader=()=>assert.fail('key must not be read');o.fetchImpl=()=>assert.fail('no network');
 for(const g of [null,{...grant(),authorized:false},{...grant(),maxRequests:13},{...grant(),scope:'TRAINING'}, {...grant(),approvedAtUtc:'2026-10-22T18:00:00Z'}])await assert.rejects(acquirePitchTrial({...o,grant:g}),/EXPLICIT_GRANT/);
 for(const url of ['http://api.pitchapi.dev/v1/leagues','https://evil.example/v1/leagues',PITCH_BASE+'/v1/account',PITCH_BASE+'/v1/matches/m_000001/lineups',PITCH_BASE+'/v1/leagues?token=x',PITCH_BASE+'/v1/leagues/l_000001/matches?season=2026%2F2027&status=played&page=2'])await assert.rejects(acquirePitchTrial({...o,url}),/ENDPOINT_REFUSED/);
 assert.equal(pitchRequestKind(PITCH_BASE+'/v1/leagues/l_000001/matches?season=2026%2F2027&status=played'),'season');
});
test('Pitch trial uses header only, persists no credential and reuses verified receipt without retransmission',async t=>{
 const directory=await setup(t);let calls=0;
 const o={...options(directory),fetchImpl:async(url,r)=>{calls++;assert.equal(r.headers['X-API-KEY'],secret);assert.equal(r.redirect,'error');assert.equal(r.method,'GET');assert.ok(!url.includes(secret));return reply({data:{leagues:[]}});}};
 assert.equal((await acquirePitchTrial(o)).ordinal,1);assert.equal((await acquirePitchTrial(o)).reused,true);assert.equal(calls,1);
 assert.deepEqual(await readPitchResponse(directory,o.url),{leagues:[]});
 for(const f of await fs.readdir(directory)){if(f==='locks')continue;assert.equal((await fs.readFile(path.join(directory,f),'utf8')).includes(secret),false);}
 const raw=(await fs.readdir(directory)).find(f=>f.endsWith('.response.private.json'));await fs.appendFile(path.join(directory,raw),' ');
 await assert.rejects(acquirePitchTrial(o),/SNAPSHOT_CHANGED/);assert.equal(calls,1);
});
test('Pitch trial counts at most twelve transmissions across persistent invocations',async t=>{
 const o=options(await setup(t));let calls=0;o.fetchImpl=async()=>{calls++;return reply();};
 const urls=[o.url,...['2026/2027','2025/2026'].map(season=>PITCH_BASE+'/v1/leagues/l_000001/matches?season='+encodeURIComponent(season)+'&status=played'),
  ...['000001','000002','000003'].flatMap(id=>['stats','events','players'].map(route=>PITCH_BASE+'/v1/matches/m_'+id+'/'+route))];
 for(const url of urls)await acquirePitchTrial({...o,url});assert.equal(calls,12);
 await assert.rejects(acquirePitchTrial({...o,url:PITCH_BASE+'/v1/matches/m_000004/stats'}),/BUDGET_EXHAUSTED/);assert.equal(calls,12);
});
test('Pitch trial preserves ambiguous intent and blocks all subsequent requests without retries',async t=>{
 const o=options(await setup(t));let calls=0;o.fetchImpl=async()=>{calls++;throw Error(secret);};
 await assert.rejects(acquirePitchTrial(o),e=>e.message==='PITCH_TRIAL_STOPPED_NO_AUTOMATIC_RETRY');
 await assert.rejects(acquirePitchTrial(o),/AMBIGUOUS_NO_RETRY/);
 await assert.rejects(acquirePitchTrial({...o,url:PITCH_BASE+'/v1/matches/m_000001/stats'}),/AMBIGUOUS_NO_RETRY/);assert.equal(calls,1);
});
test('Pitch trial records HTTP/application failures and stops the remaining budget',async t=>{
 for(const [body,status] of [[{error:{code:'UNAUTHORIZED'}},401],[{error:{code:'PLAN_UPGRADE_REQUIRED'}},200],[{data:{},error:{code:'BAD'}},200]]){
  const o=options(await setup(t));let calls=0;o.fetchImpl=async()=>{calls++;return reply(body,status);};
  const result=await acquirePitchTrial(o);assert.equal(result.status,status);assert.equal(result.applicationSuccess,false);
  await assert.rejects(acquirePitchTrial({...o,url:PITCH_BASE+'/v1/matches/m_000001/stats'}),/PREVIOUS_FAILURE_STOP/);assert.equal(calls,1);
 }
});
test('Pitch trial refuses reflected credentials without saving them in payload or diagnostics',async t=>{
 const directory=await setup(t),o={...options(directory),fetchImpl:async()=>reply({data:{echo:secret}})};
 await assert.rejects(acquirePitchTrial(o),/STOPPED_NO_AUTOMATIC_RETRY/);
 for(const f of await fs.readdir(directory)){if(f==='locks')continue;assert.equal((await fs.readFile(path.join(directory,f),'utf8')).includes(secret),false);assert.ok(!f.endsWith('.response.private.json'));}
});
test('Pitch league discovery requires exact country/name, free flag and current season',()=>{
 const league={id:'l_000001',name:'Serie A',country_code:'ITA',is_free:true,seasons:['2026/2027','2025/2026']};
 assert.deepEqual(selectPitchLeague({leagues:[league]}),league);
 for(const mutate of [l=>l.name='Serie A Women',l=>l.country_code='BRA',l=>l.is_free=false,l=>l.seasons=['2025/2026']]){const l=structuredClone(league);mutate(l);assert.throws(()=>selectPitchLeague({leagues:[l]}),/PITCH_TRIAL_/);}
 assert.throws(()=>selectPitchLeague({leagues:[league,league]}),/IDENTITY/);
});
test('Pitch fixture reconciliation refuses duplicates, swapped sides, kickoff changes, null scores and guessed aliases',()=>{
 const event={home:'Home',away:'Away',kickoffUtc:'2026-10-12T18:45:00Z'};
 const m={id:'m_000001',home_team:{id:'t_000001',name:'Home'},away_team:{id:'t_000002',name:'Away'},time_utc:event.kickoffUtc,status:'finished',score_home:0,score_away:0};
 const data={league:{id:'l_000001',season:'2026/2027'},matches:[m]},o={leagueId:'l_000001',season:'2026/2027',event};
 assert.deepEqual(matchPitchFixture(data,o),m);
 for(const mutate of [d=>d.matches.push(m),d=>[d.matches[0].home_team,d.matches[0].away_team]=[m.away_team,m.home_team],d=>d.matches[0].time_utc='2026-10-12T19:45:00Z',d=>d.matches[0].score_home=null,d=>d.league.season='2025/2026',d=>d.matches[0].home_team.name='HOME']){const d=structuredClone(data);mutate(d);assert.throws(()=>matchPitchFixture(d,o),/PITCH_TRIAL_/);}
 const d=structuredClone(data);d.matches[0].home_team.name='Explicit Home';assert.equal(matchPitchFixture(d,{...o,aliases:{'Explicit Home':'Home'}}).id,m.id);
});
