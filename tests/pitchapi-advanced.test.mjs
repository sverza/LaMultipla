import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PITCH_ADVANCED_METRICS,reviewPitchAdvanced,summarizePitchAdvanced} from '../scripts/lib/pitchapi-advanced.mjs';
import {acquirePitchAdvanced} from '../scripts/lib/pitchapi-advanced-acquisition.mjs';
const at='2026-10-21T20:00:00Z';
const fixture={id:'m_000001',time_utc:'2026-09-01T18:00:00Z',status:'finished',home_team:{id:'t_000001',name:'Synthetic Home'},away_team:{id:'t_000002',name:'Synthetic Away'}};
function body(){return {data:{match_id:fixture.id,teams:[fixture.home_team,fixture.away_team].map(team=>{
 const o={team};for(const m of PITCH_ADVANCED_METRICS){const keys=m.path.split('.');let v=o;for(const k of keys.slice(0,-1))v=v[k]??={};v[keys.at(-1)]=m.type==='string'?'pass_share':0;}
 o.passing.pass_accuracy=null;o.defending.ppda=null;return o;
})}};}
const review=b=>reviewPitchAdvanced({fixture,status:200,body:b,observedAtUtc:at});
test('advanced dictionary unique typed fields and faithful null/omitted/zero distinctions',()=>{
 assert.equal(new Set(PITCH_ADVANCED_METRICS.map(m=>m.path)).size,PITCH_ADVANCED_METRICS.length);
 assert.equal(PITCH_ADVANCED_METRICS.length,66);assert.equal(PITCH_ADVANCED_METRICS.filter(m=>m.requiredForComplete).length,64);
 const b=body();delete b.data.teams[0].passing.assists;
 const r=review(b);assert.equal(r.classification,'VALID_PARTIAL');
 const cells=r.teams[0].cells;assert.equal(cells.find(c=>c.path==='passing.assists').state,'OMITTED');
 assert.equal(cells.find(c=>c.path==='passing.pass_accuracy').state,'NULL');assert.equal(cells.find(c=>c.path==='passing.crosses').state,'ZERO');
 assert.equal(r.originalAvailableAtUtc,null);assert.equal(r.trainingEligible,false);
});
test('advanced exact identity, order, side, type and aliases reject unverified semantics',()=>{
 for(const mutate of [b=>b.data.match_id='m_000002',b=>b.data.teams.reverse(),b=>b.data.teams[0].team={id:fixture.home_team.id,name:'Other name'}]){
  const b=body();mutate(b);assert.equal(review(b).classification,'IDENTITY_ERROR');
 }
 for(const mutate of [t=>t.side='away',t=>t.passing.passes='12',t=>t.passing.crosses=2,t=>t.creation.chances_created=1,t=>t.defending.ppda=2,t=>t.tempo=[],t=>t.creation.sca_breakdown=[]]){
  const b=body();mutate(b.data.teams[0]);assert.equal(review(b).classification,'SEMANTIC_ERROR');assert.equal(review(b).canContinue,false);
 }
});
test('advanced signed model metrics preserved without selecting an undocumented decomposition',()=>{
 const b=body();Object.assign(b.data.teams[0].possession_value,{vaep_total:.3,vaep_offensive:.6,vaep_defensive:-.3});
 const d=review(b).teams[0].decomposition.vaep;assert.ok(Math.abs(d.residualAdd)<1e-10);assert.ok(Math.abs(d.residualSubtract+.6)<1e-10);
 assert.equal(d.interpretation,'WITHHELD_DOCUMENTATION_SIGN_BASELINE_AMBIGUITY');
});
test('advanced sample denominator includes unavailable/unobserved and keeps neutral playoff separate',()=>{
 const absent=reviewPitchAdvanced({fixture,status:404,body:{error:{code:'ANALYTICS_UNAVAILABLE'}},observedAtUtc:at});
 assert.equal(absent.canContinue,true);
 const samples=[{season:'2022/2023',scope:'REGULAR',fixture,review:review(body())},{season:'2022/2023',scope:'REGULAR',fixture,review:absent},{season:'2022/2023',scope:'PLAYOFF',fixture}];
 const s=summarizePitchAdvanced(samples,{season:'2022/2023',scope:'REGULAR'});assert.equal(s.plannedMatches,2);assert.equal(s.matrix[0].denominator,4);assert.equal(s.matrix[0].counts.RESPONSE_UNAVAILABLE,2);
 assert.equal(summarizePitchAdvanced(samples,{season:'2022/2023'}).matrix[0].counts.NOT_OBSERVED,2);assert.equal(s.populationCoverageInferred,false);
});
test('advanced null group, missing group, unknown fields and genuine complete numeric contract remain distinct',()=>{
 const full=body();for(const t of full.data.teams){t.passing.passes=1;t.passing.pass_accuracy=0;t.defending.defensive_actions=1;t.defending.ppda=0;}
 assert.equal(review(full).classification,'VALID_COMPLETE');
 full.data.teams[0].creation=null;delete full.data.teams[1].creation;
 const r=review(full);assert.equal(r.teams[0].cells.find(c=>c.path==='creation.sca').state,'NULL');assert.equal(r.teams[0].cells.find(c=>c.path==='creation.sca').nullAt,'creation');
 assert.equal(r.teams[1].cells.find(c=>c.path==='creation.sca').state,'OMITTED');
 const extra=body();extra.data.source_version='synthetic';extra.data.teams[0].new_metric=1;
 assert.deepEqual(review(extra).unknownDataFields,['source_version']);assert.deepEqual(review(extra).teams[0].unknownFields,['new_metric']);assert.equal(review(extra).classification,'VALID_PARTIAL');
});
function grant(){return {schema:'lamultipla-pitchapi-advanced-grant-v1',authorized:true,maxRequests:18,scope:'PRIVATE_TEAM_ADVANCED_DIAGNOSTIC_ONLY',retention:'PRIVATE_USER_CONFIRMED',proposalSha256:'a'.repeat(64),approvedAtUtc:at,
 requests:Array.from({length:18},(_,i)=>{const f={...fixture,id:'m_'+String(i+1).padStart(6,'0')};return {fixture:f,url:'https://api.pitchapi.dev/v1/matches/'+f.id+'/advanced'};})};}
async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lm-advanced-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const g=grant();return {directory,grant:g,url:g.requests[0].url,keyLoader:async()=>'SYNTHETIC_ADVANCED_SECRET',clock:()=>new Date(at)};}
test('advanced grant restricts scope, order, renewal, cache and raw snapshot integrity',async t=>{
 const o=await setup(t);let calls=0;o.fetchImpl=async()=>{calls++;return new Response(JSON.stringify(body()),{headers:{'content-type':'application/json'}});};
 for(const g of [null,{...o.grant,maxRequests:19},{...o.grant,authorized:false}])await assert.rejects(acquirePitchAdvanced({...o,grant:g}),/GRANT/);
 await assert.rejects(acquirePitchAdvanced({...o,url:o.grant.requests[0].url+'/players'}),/GRANT/);
 await assert.rejects(acquirePitchAdvanced({...o,url:o.grant.requests[1].url}),/ORDER/);
 await acquirePitchAdvanced(o);assert.equal((await acquirePitchAdvanced(o)).reused,true);assert.equal(calls,1);
 await assert.rejects(acquirePitchAdvanced({...o,grant:{...o.grant,approvedAtUtc:'2026-10-21T19:59:00Z'}}),/NO_RENEWAL/);
 const file=(await fs.readdir(o.directory)).find(f=>f.endsWith('.response.private.json'));await fs.appendFile(path.join(o.directory,file),' ');
 await assert.rejects(acquirePitchAdvanced(o),/SNAPSHOT_CHANGED/);assert.equal(calls,1);
});
test('advanced expected analytics absence continues, HTTP/application/identity errors stop before another key read',async t=>{
 for(const [status,payload,continues] of [[404,{error:{code:'ANALYTICS_UNAVAILABLE'}},true],[404,{error:{code:'RESOURCE_NOT_FOUND'}},false],[429,{error:{code:'RATE_LIMIT_EXCEEDED'}},false],[200,{data:{match_id:'wrong',teams:[]}},false]]){
  const o=await setup(t);let calls=0;o.fetchImpl=async()=>{calls++;return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});};
  assert.equal((await acquirePitchAdvanced(o)).review.canContinue,continues);
  if(continues){await acquirePitchAdvanced({...o,url:o.grant.requests[1].url});assert.equal(calls,2);}
  else {await assert.rejects(acquirePitchAdvanced({...o,url:o.grant.requests[1].url}),/PREVIOUS_FAILURE_STOP/);assert.equal(calls,1);}
 }
});
test('advanced interrupted requests and reflected secrets never retry or leak',async t=>{
 for(const mode of ['offline','reflect']){
  const o=await setup(t);let calls=0;o.fetchImpl=async()=>{calls++;if(mode==='offline')throw Error('SYNTHETIC_ADVANCED_SECRET');return new Response('SYNTHETIC_ADVANCED_SECRET');};
  await assert.rejects(acquirePitchAdvanced(o),e=>e.message==='PITCH_ADVANCED_STOPPED_NO_AUTOMATIC_RETRY');
  await assert.rejects(acquirePitchAdvanced(o),/AMBIGUOUS_NO_RETRY/);assert.equal(calls,1);
  for(const file of await fs.readdir(o.directory))if(file.endsWith('.json'))assert.ok(!(await fs.readFile(path.join(o.directory,file),'utf8')).includes('SYNTHETIC_ADVANCED_SECRET'));
 }
});
test('advanced eighteen-call ledger refuses extensions; malformed and non-JSON replies stop',async t=>{
 const o=await setup(t);let calls=0;o.fetchImpl=async()=>{calls++;return new Response('{"error":{"code":"ANALYTICS_UNAVAILABLE"}}',{status:404,headers:{'content-type':'application/json'}});};
 for(const r of o.grant.requests)await acquirePitchAdvanced({...o,url:r.url});
 assert.equal(calls,18);assert.equal((await acquirePitchAdvanced(o)).reused,true);
 await assert.rejects(acquirePitchAdvanced({...o,grant:{...o.grant,requests:[...o.grant.requests.slice(0,17),{fixture:{...fixture,id:'m_000019'},url:'https://api.pitchapi.dev/v1/matches/m_000019/advanced'}]}}),/NO_RENEWAL/);
 assert.equal(calls,18);
 for(const [raw,type] of [['not JSON','application/json'],[JSON.stringify(body()),'text/html']]){
  const a=await setup(t);a.fetchImpl=async()=>new Response(raw,{headers:{'content-type':type}});
  assert.equal((await acquirePitchAdvanced(a)).review.canContinue,false);
  await assert.rejects(acquirePitchAdvanced({...a,url:a.grant.requests[1].url}),/PREVIOUS_FAILURE_STOP/);
 }
});
test('advanced expired or future grants and noncompleted samples make no transmission',async t=>{
 const o=await setup(t);o.keyLoader=()=>assert.fail('credential should not be read');o.fetchImpl=()=>assert.fail('no transmission');
 for(const approvedAtUtc of ['2026-10-20T19:59:59Z','2026-10-21T20:00:01Z'])await assert.rejects(acquirePitchAdvanced({...o,grant:{...o.grant,approvedAtUtc}}),/WINDOW/);
 const g=structuredClone(o.grant);g.requests[0].fixture.status='not_started';await assert.rejects(acquirePitchAdvanced({...o,grant:g}),/GRANT/);
 assert.throws(()=>reviewPitchAdvanced({fixture:{...fixture,time_utc:'2026-10-22T20:00:00Z'},status:200,body:body(),observedAtUtc:at}),/NOT_COMPLETED/);
 assert.equal((await fs.readdir(o.directory)).length,0);
});
