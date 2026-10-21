import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../scripts/lib/private-store.mjs';
import {acquireFootballTrial,reviewFootballResponse,FOOTBALL_TRIAL_URL} from '../scripts/lib/football-data-trial.mjs';
const at=new Date('2026-10-21T12:00:00Z');
const grant=()=>({schema:'lamultipla-football-data-single-trial-grant-v1',authorized:true,endpoint:FOOTBALL_TRIAL_URL,reviewer:'synthetic',approvedAtUtc:at.toISOString(),maxRequests:1,termsAcceptedByUser:true,privateSnapshotTrialAuthorized:true});
const directory=()=>path.join(ROOT,'.local/tests/football-trial-'+crypto.randomUUID());
test('single authenticated trial reuses receipt without another request and never stores key',async()=>{
 const dir=directory();let calls=0;const key='SYNTHETIC-ONLY-SECRET',options={directory:dir,grant:grant(),keyLoader:async()=>key,clock:()=>at,fetchImpl:async(url,o)=>{assert.equal(url,FOOTBALL_TRIAL_URL);assert.equal(o.redirect,'error');assert.equal(o.headers['X-Auth-Token'],key);calls++;return new Response('{"matches":[]}',{status:200,headers:{'content-type':'application/json'}});}};
 await acquireFootballTrial(options);const again=await acquireFootballTrial(options);assert.equal(calls,1);assert.equal(again.reused,true);
 for(const f of ['receipt.json','intent.json','response.private.json'])assert.equal((await fs.readFile(path.join(dir,f),'utf8')).includes(key),false);
 await fs.appendFile(path.join(dir,'response.private.json'),' ');await assert.rejects(acquireFootballTrial(options),/SNAPSHOT_CHANGED/);assert.equal(calls,1);
});
test('absent grant blocks before key/network; ambiguous failures never retry',async()=>{
 let calls=0;const options={directory:directory(),grant:grant(),clock:()=>at,keyLoader:async()=>{calls++;return 'SYNTHETIC';},fetchImpl:async()=>{throw Error('offline');}};
 await assert.rejects(acquireFootballTrial({...options,grant:null}),/GRANT/);assert.equal(calls,0);
 await assert.rejects(acquireFootballTrial(options),/NO_AUTOMATIC_RETRY/);await assert.rejects(acquireFootballTrial(options),/AMBIGUOUS_NO_RETRY/);assert.equal(calls,1);
});
test('FT parser rejects missing scores, awarded, extra time, identity errors and duplicate IDs',()=>{
 const events=Array.from({length:10},(_,i)=>({fixtureId:'synthetic-'+i,home:'Home '+i,away:'Away '+i,kickoffUtc:'2026-10-10T18:00:00Z'}));
 const data={competition:{code:'SA',type:'LEAGUE'},matches:events.map((e,i)=>({id:i+1,season:{startDate:'2026-08-22',endDate:'2027-05-30'},matchday:6,homeTeam:{id:2*i+1,name:e.home},awayTeam:{id:2*i+2,name:e.away},utcDate:e.kickoffUtc,status:'FINISHED',lastUpdated:'2026-10-12T00:00:00Z',score:{duration:'REGULAR',fullTime:{home:1,away:0},winner:'HOME_TEAM'}}))};
 const run=d=>reviewFootballResponse(Buffer.from(JSON.stringify(d)),[{season:'2026/27',matchday:6,events}],{acquiredAtUtc:'2026-10-21T12:00:00Z',now:at});
 assert.equal(run(data).counts.sourceMatched,10);
 for(const change of [m=>m.status='AWARDED',m=>m.score.duration='EXTRA_TIME',m=>m.score.fullTime.home=null,m=>m.utcDate='2026-10-11T18:00:00Z',m=>m.score.winner='AWAY_TEAM',m=>m.lastUpdated='2026-10-22T00:00:00Z']){const d=structuredClone(data);change(d.matches[0]);assert.equal(run(d).counts.sourceMatched,9);}
 const dup=structuredClone(data);dup.matches.push(dup.matches[0]);assert.throws(()=>run(dup),/DUPLICATE/);
});
