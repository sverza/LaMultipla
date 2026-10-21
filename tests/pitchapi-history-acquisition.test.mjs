import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {acquirePitchHistory,readPitchHistoryResponse} from '../scripts/lib/pitchapi-history-acquisition.mjs';
import {pitchHistoryDiscoveryPlan} from '../scripts/lib/pitchapi-history-plan.mjs';
const at=new Date('2026-10-21T18:00:00Z'),secret='SYNTHETIC_HISTORY_CREDENTIAL_ONLY';
const urls=pitchHistoryDiscoveryPlan().requests.map(r=>r.url);
const grant=(endpoints=urls)=>({schema:'lamultipla-pitchapi-history-grant-v1',authorized:true,maxTotalRequests:30,scope:'PRIVATE_DIAGNOSTIC_ONLY',retention:'TEMPORARY_REVIEW_ONLY',approvedAtUtc:at.toISOString(),endpoints,maxRequests:endpoints.length});
async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-pitch-history-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {directory,grant:grant(),url:urls[0],keyLoader:async()=>secret,clock:()=>at};}
const response=()=>new Response('{"data":{"sample":0}}',{headers:{'content-type':'application/json'}});
test('history acquisition enforces exact per-phase approved endpoints before key access',async t=>{
 const o=await setup(t);o.keyLoader=()=>assert.fail();o.fetchImpl=()=>assert.fail();
 for(const g of [null,{...grant(),authorized:false},{...grant(),maxTotalRequests:31},{...grant(),maxRequests:6}])await assert.rejects(acquirePitchHistory({...o,grant:g}),/GRANT/);
 for(const url of ['https://evil.example/',urls[0]+'&page=2','https://api.pitchapi.dev/v1/matches/m_000001/stats'])await assert.rejects(acquirePitchHistory({...o,url}),/GRANT/);
});
test('history acquisition uses one transmission per approved URL and reuses verified bytes without credentials',async t=>{
 const o=await setup(t);let calls=0;o.fetchImpl=async(url,r)=>{calls++;assert.equal(r.headers['X-API-KEY'],secret);assert.equal(r.redirect,'error');return response();};
 await acquirePitchHistory(o);assert.equal((await acquirePitchHistory(o)).reused,true);assert.equal(calls,1);
 assert.deepEqual(await readPitchHistoryResponse(o.directory,o.url),{sample:0});
 for(const f of await fs.readdir(o.directory))if(f.endsWith('.json'))assert.ok(!(await fs.readFile(path.join(o.directory,f),'utf8')).includes(secret));
 const raw=(await fs.readdir(o.directory)).find(f=>f.endsWith('.response.private.json'));await fs.appendFile(path.join(o.directory,raw),' ');
 await assert.rejects(acquirePitchHistory(o),/SNAPSHOT_CHANGED/);assert.equal(calls,1);
});
test('history acquisition retains ambiguous intents and never retries or advances after network failure',async t=>{
 const o=await setup(t);let calls=0;o.fetchImpl=async()=>{calls++;throw Error(secret);};
 await assert.rejects(acquirePitchHistory(o),e=>e.message==='PITCH_HISTORY_STOPPED_NO_AUTOMATIC_RETRY');
 await assert.rejects(acquirePitchHistory({...o,url:urls[1]}),/AMBIGUOUS_NO_RETRY/);assert.equal(calls,1);
});
test('history acquisition stops on HTTP or application errors and refuses reflected credentials',async t=>{
 for(const [status,body] of [[429,'{"error":{"code":"RATE_LIMIT_EXCEEDED"}}'],[200,'{"error":{"code":"BLOCKED"}}']]){
  const o=await setup(t);o.fetchImpl=async()=>new Response(body,{status});const r=await acquirePitchHistory(o);assert.equal(r.applicationSuccess,false);
  await assert.rejects(acquirePitchHistory({...o,url:urls[1]}),/PREVIOUS_FAILURE_STOP/);
 }
 const o=await setup(t);o.fetchImpl=async()=>new Response(JSON.stringify({data:secret}));await assert.rejects(acquirePitchHistory(o),/STOPPED_NO_AUTOMATIC_RETRY/);
 assert.ok(!(await fs.readdir(o.directory)).some(f=>f.endsWith('.response.private.json')));
});
test('history acquisition shares the thirty-call ceiling across independently approved phases',async t=>{
 const o=await setup(t);let calls=0;o.fetchImpl=async()=>{calls++;return response();};
 for(const url of urls)await acquirePitchHistory({...o,url});
 const details=Array.from({length:26},(_,i)=>'https://api.pitchapi.dev/v1/matches/m_'+String(i).padStart(6,'0')+'/stats');
 const g=grant(details);
 for(const url of details.slice(0,25))await acquirePitchHistory({...o,grant:g,url});
 await assert.rejects(acquirePitchHistory({...o,grant:g,url:details[25]}),/GLOBAL_BUDGET_EXHAUSTED/);assert.equal(calls,30);
});
test('history acquisition requires explicit lineup observation window and blocks early or late calls before reading key',async t=>{
 const o=await setup(t),url='https://api.pitchapi.dev/v1/matches/m_000001/lineups',g=grant([url]);
 o.keyLoader=()=>assert.fail('outside window');o.fetchImpl=()=>assert.fail('no request');
 await assert.rejects(acquirePitchHistory({...o,grant:g,url}),/LINEUP_WINDOW_REQUIRED/);
 g.requestWindows={[url]:{notBeforeUtc:'2026-10-21T18:45:00Z',notAfterUtc:'2026-10-22T18:00:00Z'}};
 await assert.rejects(acquirePitchHistory({...o,grant:g,url}),/OUTSIDE_REQUEST_WINDOW/);
 await assert.rejects(acquirePitchHistory({...o,grant:g,url,clock:()=>new Date('2026-10-22T18:00:00Z')}),/OUTSIDE_REQUEST_WINDOW/);
 assert.deepEqual(await fs.readdir(o.directory),[]);
});
