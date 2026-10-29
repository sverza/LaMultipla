import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {digest,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {PITCH_HISTORY_SEASONS} from '../scripts/lib/pitchapi-history-plan.mjs';
import {acquirePitchArchive} from '../scripts/lib/pitchapi-history-acquisition.mjs';
import {ARCHIVE_VERSION,pitchBytesHash,buildPitchArchiveUniverse,reviewPitchArchiveResponse,importPitchArchiveResponse,rebuildPitchArchive,planPitchArchivePilot,planPitchArchiveIncremental,validatePitchArchiveGrant} from '../scripts/lib/pitchapi-team-archive.mjs';
const at='2027-01-01T12:00:00.000Z';
const team=(id,name)=>({id,name});
function catalogs(){return PITCH_HISTORY_SEASONS.map((season,s)=>({key:String(s),observation:{acquiredAtUtc:at,url:'https://api.pitchapi.dev/v1/leagues/l_0ALvwF/matches?season='+encodeURIComponent(season)+'&status=all'},body:{data:{league:{id:'l_0ALvwF',season},matches:Array.from({length:12},(_,i)=>({id:'m_'+String(s*100+i).padStart(6,'0'),date:season.slice(0,4)+'-'+String(i+1).padStart(2,'0')+'-01',time_utc:season.slice(0,4)+'-'+String(i+1).padStart(2,'0')+'-01T12:00:00Z',status:'finished',home_team:team('t_000001','Synthetic Home'),away_team:team('t_000002','Synthetic Away'),score_home:0,score_away:1}))}}}));}
function view(){return {universe:buildPitchArchiveUniverse(catalogs()),observations:[],revisions:[]};}
function plan(){const v=view();return planPitchArchivePilot({view:v,viewSha256:digest(v),createdAtUtc:at});}
function grant(){const p=plan();return {schema:ARCHIVE_VERSION+'-grant',authorized:true,scope:'PRIVATE_HISTORICAL_TEAM_PILOT_ONLY',retention:'PRIVATE_USER_CONFIRMED',ceiling:60,approvedAtUtc:at,recordedAtUtc:at,planSha256:digest(p),plan:p};}
const stats=(f,items=[])=>({data:{match_id:f.id,home_team:f.home_team,away_team:f.away_team,periods:[{period:'All',groups:[{items}]}]}});
const item=(key,home,away=home)=>({key,home,away,format_type:'integer'});
function request(){return plan().requests[0];}
function review(body,r=request()){return reviewPitchArchiveResponse({request:r,status:200,body,observedAtUtc:at});}
async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lm-team-archive-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
function receipt(body,url,status=200,acquiredAtUtc=at){const raw=Buffer.from(JSON.stringify(body));return {raw,receipt:{url,status,contentType:'application/json',acquiredAtUtc,bytes:raw.length,rawSha256:pitchBytesHash(raw)}};}
async function seed(directory){for(const c of catalogs())await importPitchArchiveResponse({directory,...receipt(c.body,c.observation.url),source:{synthetic:true}});}

test('archive six-season universe preserves future exclusions and neutral playoff as separate identity',()=>{
 const c=catalogs(),future={...c[5].body.data.matches[0],id:'m_999999',status:'not_started',time_utc:'2027-02-01T12:00:00Z',score_home:null,score_away:null};c[5].body.data.matches.push(future);
 c[1].body.data.matches.push({...c[1].body.data.matches[0],id:'m_3ir3kE',date:'2023-06-11',time_utc:'2023-06-11T18:45:00Z',home_team:team('t_2QVYlo','Spezia'),away_team:team('t_0YcbNh','Hellas Verona')});
 const u=buildPitchArchiveUniverse(c);assert.equal(u.length,74);assert.equal(u.filter(f=>f.candidate).length,73);
 assert.equal(u.find(f=>f.fixture.id==='m_999999').candidate,false);
 const p=u.find(f=>f.fixture.id==='m_3ir3kE');assert.equal(p.scope,'POSTSEASON_NEUTRAL_PLAYOFF');assert.equal(p.neutralVenue,true);assert.equal(p.homeAdvantageAssumed,false);
 assert.ok(u.filter(f=>f.scope==='REGULAR_LEAGUE').every(f=>f.neutralVenue===null));
});
test('archive universe fails closed for duplicate IDs, cross-season identity, missing score, team inversions and unknown states',()=>{
 for(const mutate of [c=>c[0].body.data.matches.push(c[0].body.data.matches[0]),c=>c[1].body.data.matches[0].id=c[0].body.data.matches[0].id,c=>c[0].body.data.matches[0].score_home=null,c=>c[0].body.data.matches[0].away_team=c[0].body.data.matches[0].home_team,c=>c[0].body.data.matches[0].status='unknown',c=>c[0].body.data.matches[0].home_team.name='Different']){
  const c=catalogs();mutate(c);assert.throws(()=>buildPitchArchiveUniverse(c));
 }
});
test('archive pilot deterministic chronological strata: 48 stats + 12 recent advanced, no cached/future replacement',()=>{
 const v=view();v.observations.push({url:'https://api.pitchapi.dev/v1/matches/'+v.universe[0].fixture.id+'/stats',review:{canContinue:true}});
 const p=planPitchArchivePilot({view:v,viewSha256:digest(v),createdAtUtc:at});assert.deepEqual(p,planPitchArchivePilot({view:v,viewSha256:digest(v),createdAtUtc:at}));
 assert.equal(p.requests.length,60);assert.equal(p.requests.filter(r=>r.kind==='stats').length,48);assert.equal(p.requests.filter(r=>r.kind==='advanced').length,12);
 assert.ok(p.requests.every(r=>r.url!==v.observations[0].url));assert.ok(p.requests.filter(r=>r.kind==='advanced').every(r=>Number(r.season.slice(0,4))>=2024));
 assert.equal(new Set(p.requests.map(r=>r.url)).size,60);assert.throws(()=>planPitchArchivePilot({view:v,viewSha256:digest(v),createdAtUtc:at,statsPerSeason:10}),/BUDGET/);
});
test('archive immutable grant binds exact endpoint, ceiling, season and full home/away identity',()=>{
 const g=grant();validatePitchArchiveGrant(g);
 for(const mutate of [g=>g.authorized=false,g=>g.ceiling=61,g=>g.planSha256='x',g=>g.plan.requests[0].url+='?page=2',g=>g.plan.requests[0].fixture.status='not_started',g=>g.plan.requests[0].fixture.away_team=g.plan.requests[0].fixture.home_team]){const x=structuredClone(g);mutate(x);assert.throws(()=>validatePitchArchiveGrant(x));}
});
test('archive traditional values preserve explicit zero, null, omitted and contradictory yellow-card representations',()=>{
 const r=request(),b=stats(r.fixture,[item('corners','0'),item('fouls',null),item('yellow_cards','0'),item('yellow_cards','')]);
 const q=review(b).quality,cell=m=>q.cells.find(c=>c.period==='All'&&c.side==='home'&&c.metric===m);
 assert.equal(cell('corners').state,'ZERO');assert.equal(cell('corners').measurement.value,0);assert.equal(cell('fouls').state,'NULL');assert.equal(cell('total_shots').state,'OMITTED');assert.equal(cell('yellow_cards').state,'AMBIGUOUS');
 assert.equal(review(b).classification,'VALID_PARTIAL');assert.equal(cell('direct_red_cards').state,'AMBIGUOUS');
});
test('archive stats identity/period/schema and numeric-domain inconsistencies refuse continuation',()=>{
 const r=request();for(const mutate of [b=>b.data.match_id='m_999999',b=>b.data.home_team=r.fixture.away_team,b=>b.data.season='2020/2021',b=>b.data.score_home=8,b=>b.data.time_utc='2020-01-01T00:00:00Z',b=>b.data.periods.push(b.data.periods[0]),b=>b.data.periods[0].groups[0].items=null]){
  const b=stats(r.fixture);mutate(b);assert.equal(review(b).canContinue,false);
 }
 const b=stats(r.fixture,[{...item('BallPossesion','101'),format_type:'double'}]);assert.equal(review(b).classification,'SEMANTIC_ERROR');assert.equal(review(b).quality.matrix.find(r=>r.metric==='BallPossesion'&&r.period==='All').counts.AMBIGUOUS,2);
});
test('archive team aggregation checks record shot-definition discrepancy and reject impossible period sums',()=>{
 const r=request(),b=stats(r.fixture,[item('total_shots','10'),item('ShotsOnTarget','3'),item('ShotsOffTarget','3'),item('blocked_shots','3')]);assert.ok(review(b).issues.some(i=>i.code==='SHOT_PARTITION_REQUIRES_DEFINITION_REVIEW'));
 const p=stats(r.fixture,[item('corners','1')]);p.data.periods.push(...['FirstHalf','SecondHalf'].map(period=>({period,groups:[{items:[item('corners','1')]}]})));assert.equal(review(p).canContinue,false);
});
test('archive raw provenance imports/rebuilds idempotently offline and detects object tampering',async t=>{
 const directory=await setup(t);await seed(directory);const r=request(),data=receipt(stats(r.fixture,[item('corners','0'),item('corners','0'),item('clearances','3')]),r.url);
 const o={directory,...data,source:{synthetic:true}};await importPitchArchiveResponse(o);const first=await rebuildPitchArchive(directory);
 await importPitchArchiveResponse(o);assert.equal((await rebuildPitchArchive(directory)).sha,first.sha);assert.equal(first.view.observations.length,1);assert.equal(first.view.trainingEligible,false);
 assert.equal(first.view.observations[0].observedAtUtc,at);assert.equal(first.view.universe.length,72);
 const inventory=first.view.observations[0].traditionalFieldInventory;assert.equal(inventory.filter(c=>c.metric==='corners'&&c.side==='home').length,1);assert.equal(inventory.find(c=>c.metric==='corners').measurement.repeatedEquivalent,true);assert.equal(inventory.find(c=>c.metric==='clearances').definitionStatus,'UNMAPPED_SEMANTICS_NOT_ADMITTED');
 assert.equal(first.view.availability.find(a=>a.fixtureId===r.fixture.id&&a.kind==='stats').state,'VALID_PARTIAL');assert.ok(first.view.availability.some(a=>a.state==='NOT_OBSERVED'));
 await fs.appendFile(path.join(directory,'objects',data.receipt.rawSha256+'.json'),' ');await assert.rejects(rebuildPitchArchive(directory),/OBJECT_CHANGED/);
});
test('archive revisions retain both observations, explicitly conflict, and block new pilot rather than latest-wins',async t=>{
 const directory=await setup(t);await seed(directory);const r=request();
 for(const [value,date] of [['0',at],['1','2027-01-02T12:00:00Z']])await importPitchArchiveResponse({directory,...receipt(stats(r.fixture,[item('corners',value)]),r.url,200,date),source:{synthetic:true}});
 const result=await rebuildPitchArchive(directory);assert.equal(result.view.observations.length,2);assert.equal(result.view.revisions.length,1);assert.equal(result.view.revisions[0].rawHashes.length,2);
 assert.throws(()=>planPitchArchivePilot({view:result.view,viewSha256:result.sha,createdAtUtc:at}),/UNRESOLVED/);
});
test('archive advanced unavailable is retained distinctly; early-season advanced never granted',async t=>{
 const directory=await setup(t);await seed(directory);const f=view().universe.find(f=>f.season==='2024/2025');
 const url='https://api.pitchapi.dev/v1/matches/'+f.fixture.id+'/advanced';await importPitchArchiveResponse({directory,...receipt({error:{code:'ANALYTICS_UNAVAILABLE'}},url,404),source:{synthetic:true}});
 const result=await rebuildPitchArchive(directory);assert.equal(result.view.coverage.find(c=>c.season===f.season).advancedUnavailable,1);assert.equal(result.view.observations[0].review.teams.length,0);
 const g=grant();g.plan.requests[0].kind='advanced';g.plan.requests[0].url=g.plan.requests[0].url.replace('/stats','/advanced');g.planSha256=digest(g.plan);assert.throws(()=>validatePitchArchiveGrant(g),/SCOPE/);
});
test('archive acquisition respects all sixty exact requests and reuses completed response without reading credential',async t=>{
 const directory=await setup(t),g=grant();let calls=0;
 const options={directory,grant:g,keyLoader:async()=>'SYNTHETIC_ARCHIVE_SECRET',clock:()=>new Date(at),fetchImpl:async(url,options)=>{
  calls++;assert.equal(options.redirect,'error');const r=g.plan.requests.find(r=>r.url===url);
  return new Response(JSON.stringify(r.kind==='stats'?stats(r.fixture):{error:{code:'ANALYTICS_UNAVAILABLE'}}),{status:r.kind==='stats'?200:404,headers:{'content-type':'application/json'}});
 }};
 for(const r of g.plan.requests){const result=await acquirePitchArchive({...options,url:r.url});assert.equal(result.review.canContinue,true);}
 assert.equal(calls,60);assert.equal((await acquirePitchArchive({...options,url:g.plan.requests[0].url,keyLoader:()=>assert.fail('cached key access')})).reused,true);
 await assert.rejects(acquirePitchArchive({...options,url:'https://api.pitchapi.dev/v1/matches/m_999999/stats'}));assert.equal(calls,60);
 const files=(await fs.readdir(directory)).filter(n=>n.endsWith('.json'));for(const f of files)assert.ok(!(await fs.readFile(path.join(directory,f),'utf8')).includes('SYNTHETIC_ARCHIVE_SECRET'));
});
test('archive network loss/ambiguous intent blocks every subsequent request without retry, preserving budget',async t=>{
 const directory=await setup(t),g=grant();let calls=0;const o={directory,grant:g,keyLoader:async()=>'SYNTHETIC_SECRET',clock:()=>new Date(at),fetchImpl:async()=>{calls++;throw Error('SYNTHETIC_SECRET');}};
 await assert.rejects(acquirePitchArchive({...o,url:g.plan.requests[0].url}),/^Error: PITCH_ARCHIVE_STOPPED_NO_AUTOMATIC_RETRY$/);
 await assert.rejects(acquirePitchArchive({...o,url:g.plan.requests[1].url}),/AMBIGUOUS/);assert.equal(calls,1);
 assert.equal((await fs.readdir(directory)).filter(n=>n.endsWith('.intent.json')).length,1);
});
test('archive acquisition stops on authentication, limits, bad schema/content type and identity errors',async t=>{
 for(const [status,body,type] of [[401,{error:{code:'NO_ACCESS'}},'application/json'],[429,{error:{code:'LIMIT'}},'application/json'],[200,{data:{}},'application/json'],[200,stats(request().fixture),'text/html']]){
  const directory=await setup(t),g=grant();let calls=0;const o={directory,grant:g,keyLoader:async()=>'SYNTHETIC_SECRET',clock:()=>new Date(at),fetchImpl:async()=>{calls++;return new Response(JSON.stringify(body),{status,headers:{'content-type':type}});}};
  assert.equal((await acquirePitchArchive({...o,url:g.plan.requests[0].url})).review.canContinue,false);
  await assert.rejects(acquirePitchArchive({...o,url:g.plan.requests[1].url}),/PREVIOUS_FAILURE/);assert.equal(calls,1);
 }
});
test('archive restart after receipt retains order, immutable identity and detects altered bytes',async t=>{
 const directory=await setup(t),g=grant(),o={directory,grant:g,keyLoader:async()=>'SYNTHETIC_SECRET',clock:()=>new Date(at),fetchImpl:async url=>new Response(JSON.stringify(stats(g.plan.requests.find(r=>r.url===url).fixture)),{headers:{'content-type':'application/json'}})};
 await assert.rejects(acquirePitchArchive({...o,url:g.plan.requests[1].url}),/ORDER/);
 await acquirePitchArchive({...o,url:g.plan.requests[0].url});const second=await acquirePitchArchive({...o,url:g.plan.requests[1].url});assert.equal(second.ordinal,2);
 const token=pitchBytesHash(g.plan.requests[0].url),original=await readSnapshot(path.join(directory,token+'.receipt.json'));assert.equal(original.rawSha256.length,64);
 await fs.appendFile(path.join(directory,token+'.response.private.json'),' ');
 await assert.rejects(acquirePitchArchive({...o,url:g.plan.requests[2].url}),/SNAPSHOT_CHANGED/);
});
test('archive lock rejects concurrent producer and credential reflection leaves only unresolved intent',async t=>{
 const directory=await setup(t),g=grant();let enter,release;const started=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve);
 const o={directory,grant:g,url:g.plan.requests[0].url,keyLoader:async()=>'SYNTHETIC_SECRET',clock:()=>new Date(at),fetchImpl:async()=>{enter();await held;return new Response(JSON.stringify({data:'SYNTHETIC_SECRET'}),{headers:{'content-type':'application/json'}});}};
 const first=assert.rejects(acquirePitchArchive(o),/STOPPED_NO_AUTOMATIC_RETRY/);await started;
 await assert.rejects(acquirePitchArchive(o),/già in esecuzione/);release();await first;
 assert.ok(!(await fs.readdir(directory)).some(n=>n.endsWith('.receipt.json')));
});

test('archive incremental plan skips exhausted seasons and completes advanced-only and short final batches',()=>{
 const v=view(),pending=v.universe.filter(f=>f.season==='2025/2026').slice(0,3).map(f=>'https://api.pitchapi.dev/v1/matches/'+f.fixture.id+'/advanced');
 v.observations=v.universe.flatMap(f=>(Number(f.season.slice(0,4))>=2024?['stats','advanced']:['stats']).map(kind=>({url:'https://api.pitchapi.dev/v1/matches/'+f.fixture.id+'/'+kind,review:{canContinue:true}}))).filter(o=>!pending.includes(o.url));
 const options={view:v,viewSha256:digest(v),createdAtUtc:at};
 const p=planPitchArchiveIncremental(options);assert.equal(p.maxRequests,3);assert.deepEqual(p.requests.map(r=>r.url),pending);assert.ok(p.requests.every(r=>r.kind==='advanced'));
 assert.equal(planPitchArchiveIncremental({...options,limit:2}).maxRequests,2);
 v.observations.push(...pending.map(url=>({url,review:{canContinue:true}})));assert.equal(planPitchArchiveIncremental({...options,viewSha256:digest(v)}).maxRequests,0);
});
test('archive incremental plan balances remaining seasons deterministically within arbitrary approved batch sizes',()=>{
 const v=view(),options={view:v,viewSha256:digest(v),createdAtUtc:at,limit:17},p=planPitchArchiveIncremental(options);
 assert.deepEqual(p,planPitchArchiveIncremental(options));assert.equal(p.maxRequests,17);assert.equal(new Set(p.requests.map(r=>r.url)).size,17);
 for(const season of PITCH_HISTORY_SEASONS)assert.ok([2,3].includes(p.requests.filter(r=>r.season===season).length));
 assert.ok(p.requests.filter(r=>r.kind==='advanced').every(r=>Number(r.season.slice(0,4))>=2024));
 for(const limit of [0,61,1.5])assert.throws(()=>planPitchArchiveIncremental({...options,limit}),/PLAN_INPUT/);
});
