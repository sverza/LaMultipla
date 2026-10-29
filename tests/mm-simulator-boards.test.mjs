import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sample,market,quote,round,observedAt} from './fixtures/oddspapi.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
import {adaptOddsPapi,describeCapabilities,verifyNormalizedSnapshot} from '../scripts/lib/mm-simulator-v1/oddspapi.mjs';
import {BINDINGS_SCHEMA,INPUT_SCHEMA,hashBytes,hashValue,parseSource,validateBoardSnapshot,availability} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
import {loadOfflineBoards} from '../scripts/multimarket-boards.mjs';

function data(){
 const catalog=[{marketId:104,marketLength:2,marketName:'Both Teams To Score',marketType:'bothteamsscore',sportId:10,playerProp:false,period:'fulltime',handicap:0,
  outcomes:[{outcomeId:104,outcomeName:'Yes'},{outcomeId:105,outcomeName:'No'}]},
 {marketId:1010,marketLength:2,marketName:'Over Under Full Time',marketType:'totals',sportId:10,playerProp:false,period:'fulltime',handicap:2.5,
  outcomes:[{outcomeId:1010,outcomeName:'Over'},{outcomeId:1011,outcomeName:'Under'}]}];
 const raw=sample();for(const f of raw)f.bookmakerOdds['bet365.it'].markets={
  104:market({104:{0:quote({bookmakerOutcomeId:'synthetic-yes'})},105:{0:quote({bookmakerOutcomeId:'synthetic-no'})}},{bookmakerMarketId:'synthetic-btts'}),
  1010:market({1010:{0:quote({bookmakerOutcomeId:'synthetic-over'})},1011:{0:quote({bookmakerOutcomeId:'synthetic-under'})}},{bookmakerMarketId:'synthetic-total'})};
 const bindings={schema:BINDINGS_SCHEMA,competition:'ITA_SERIE_A',season:round.season,round:round.matchday,events:raw.map((f,i)=>({id:'synthetic-event-'+i,
  sourceEventId:f.fixtureId,sourceSeasonId:f.seasonId,home:{id:'synthetic-home-'+i,sourceId:f.participant1Id,name:f.participant1Name},
  away:{id:'synthetic-away-'+i,sourceId:f.participant2Id,name:f.participant2Name},kickoffUtc:f.startTime}))};
 return {raw,catalog,bindings};
}
function seal(d){
 const rawBytes=Buffer.from(JSON.stringify(d.raw)),catalogBytes=Buffer.from(JSON.stringify(d.catalog));
 const report=buildReport(d.raw,d.catalog,{round,observedAt,source:'synthetic_test'}),reportBytes=Buffer.from(JSON.stringify(report));
 const source={providerId:'oddspapi',bookmaker:'bet365.it',raw:{ref:'synthetic-raw.json',sha256:hashBytes(rawBytes)},
  catalog:{ref:'synthetic-catalog.json',sha256:hashBytes(catalogBytes)},report:{ref:'synthetic-report.json',sha256:hashBytes(reportBytes)}};
 return {rawBytes,catalogBytes,reportBytes,source,bindings:d.bindings};
}
const first=r=>r.boards.find(b=>b.event.id==='synthetic-event-0'&&b.family==='BTTS');
const total=r=>r.boards.find(b=>b.event.id==='synthetic-event-0'&&b.family==='TOTAL_GOALS');
const operator=d=>d.raw[0].bookmakerOdds['bet365.it'];
const yes=d=>operator(d).markets[104].outcomes[104].players[0];
function run(change=()=>{}){const d=data();change(d);return adaptOddsPapi(seal(d));}
function frozen(v){if(v&&typeof v==='object'&&!Buffer.isBuffer(v)){Object.freeze(v);Object.values(v).forEach(frozen);}return v;}

test('M1: exact BTTS and O/U2.5 boards, neutral semantics, provenance and no admission',()=>{
 const r=run();assert.equal(r.boards.length,20);
 for(const b of r.boards){assert.equal(b.observed,true);assert.equal(b.completeness.state,'COMPLETE');assert.equal(b.normalization.state,'VALID');
  assert.equal(b.availability.state,'OPEN');assert.equal(b.diagnosticInputReady,true);assert.equal(b.eligibleForOriginalSelector,false);assert.equal(b.scientificEligibility,'NOT_EVALUATED');}
 assert.deepEqual(first(r).completeness.expected,['YES','NO']);assert.equal(first(r).line,null);assert.equal(total(r).line,2.5);
 assert.equal(first(r).provenance.rawLine,0);assert.equal(first(r).provenance.sourceMarketId,'104');
 assert.equal(first(r).outcomes[0].provenance.rawPointer,'/0/bookmakerOdds/bet365.it/markets/104/outcomes/104/players/0');
 assert.equal(first(r).outcomes[0].provenance.catalogPointer,'/0/outcomes/0');
 assert.equal(r.source.observedAtUtc,observedAt);assert.equal(r.providerRequests,0);assert.equal(r.actualStakeEUR,0);assert.equal(r.appDeliveryAllowed,false);
 assert.equal(r.source.observationKind,'SYNTHETIC');
 assert.equal(r.canonicalSha256,hashValue(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='canonicalSha256'))));
});
test('M1: absent outcome stays absent; positive flags can coexist with an incomplete board',()=>{
 const b=first(run(d=>delete operator(d).markets[104].outcomes[105]));
 assert.equal(b.outcomes.length,1);assert.equal(b.completeness.state,'INCOMPLETE');assert.deepEqual(b.completeness.missing,['NO']);
 assert.equal(b.availability.state,'OPEN');assert.equal(b.diagnosticInputReady,false);assert.ok(b.exclusionReasons.includes('EXPECTED_OUTCOMES_MISSING'));
});
test('M1: board absent is explicit, no invented outcomes and no regional substitution',()=>{
 const a=first(run(d=>delete operator(d).markets[104]));assert.equal(a.observed,false);assert.equal(a.outcomes.length,0);assert.equal(a.availability.state,'UNKNOWN');
 const r=run(d=>{d.raw[0].bookmakerOdds.bet365=operator(d);delete d.raw[0].bookmakerOdds['bet365.it'];});
 assert.ok(first(r).exclusionReasons.includes('EXACT_BOOKMAKER_ABSENT'));assert.equal(first(r).diagnosticInputReady,false);
});
test('M1: duplicate outcome through extra participant or operator ID cannot form a complete usable board',()=>{
 for(const change of [d=>{operator(d).markets[104].outcomes[104].players[1]=quote();},d=>{yes(d).bookmakerOutcomeId='synthetic-no';}]){
  const b=first(run(change));assert.equal(b.completeness.state,'CONFLICT');assert.equal(b.diagnosticInputReady,false);}
 const unknown=first(run(d=>{operator(d).markets[104].outcomes[999]={players:{}};}));assert.equal(unknown.completeness.state,'CONFLICT');
 assert.deepEqual(unknown.completeness.unexpectedSourceOutcomeIds,['999']);assert.equal(unknown.outcomes.length,2);assert.equal(unknown.diagnosticInputReady,false);
});
test('M1: catalog duplicates, wrong IDs/names or unknown outcomes never silently map',()=>{
 for(const change of [d=>d.catalog.push(structuredClone(d.catalog[0])),d=>{d.catalog[0].outcomes[0].outcomeId=999;},
  d=>{d.catalog[0].outcomes[1].outcomeId=104;},d=>{d.catalog[0].marketName='Full Time Both Teams To Score';},d=>{operator(d).markets[104].outcomes[999]={players:{0:quote()}};}]){
  const b=first(run(change));assert.equal(b.diagnosticInputReady,false);assert.equal(b.normalization.state,'INVALID');}
});
test('M1: marketActive false with active true preserves complete board and blocks availability',()=>{
 const b=first(run(d=>{operator(d).markets[104].marketActive=false;}));
 assert.equal(b.completeness.state,'COMPLETE');assert.equal(b.normalization.state,'VALID');assert.equal(b.availability.state,'CLOSED');assert.equal(b.diagnosticInputReady,false);
 assert.ok(b.outcomes.every(o=>o.availability==='OPEN'));assert.ok(b.exclusionReasons.includes('SOURCE_FLAGS_CLOSED'));
});
test('M1: all four flags require exact booleans, unknown never becomes true',()=>{
 for(const [name,mutate]of [['inactive',d=>{operator(d).bookmakerIsActive=false;}],['suspended',d=>{operator(d).suspended=true;}],
  ['selection false',d=>{yes(d).active=false;}],['missing bookmaker',d=>{delete operator(d).bookmakerIsActive;}],
  ['null market',d=>{operator(d).markets[104].marketActive=null;}],['string active',d=>{yes(d).active='true';}],
  ['missing suspension',d=>{delete operator(d).suspended;}],['missing selection',d=>{delete yes(d).active;}]]){
  const b=first(run(mutate));assert.notEqual(b.availability.state,'OPEN',name);assert.equal(b.diagnosticInputReady,false,name);}
 assert.equal(availability({operatorEnabled:true,operatorUnsuspended:true,marketEnabled:true,outcomesEnabled:[]}).state,'UNKNOWN');
});
test('M1: invalid prices retained as null with reasons; valid decimal strings use existing normalizer',()=>{
 for(const price of [null,'',0,1,-1,'NaN',{},true]){const b=first(run(d=>{yes(d).price=price;}));
  assert.equal(b.outcomes[0].price,null);assert.ok(b.outcomes[0].reasons.includes('INVALID_DECIMAL_PRICE'));assert.equal(b.diagnosticInputReady,false);}
 assert.equal(first(run(d=>{yes(d).price='2.45';})).outcomes[0].price,2.45);
});
test('M1: missing/future/invalid timestamps block normalization; old last change is not an observation age',()=>{
 for(const [field,value]of [['changedAt',undefined],['changedAt','2026-10-09'],['changedAt','2026-10-09T22:00:00Z'],
  ['changedAt','2026-02-30T12:00:00Z'],['bookmakerChangedAt','2026-10-09T22:00:00Z']]){
  const b=first(run(d=>{yes(d)[field]=value;}));assert.equal(b.diagnosticInputReady,false);assert.equal(b.normalization.state,'INVALID');}
 const old=first(run(d=>{yes(d).changedAt='2026-10-01T12:00:00Z';}));assert.equal(old.diagnosticInputReady,true);
 assert.ok(old.warnings.includes('LAST_CHANGE_OLDER_THAN_24H_NOT_SYNC_PROOF'));assert.equal(old.temporal.freshness,'NOT_EVALUATED');
 assert.equal(first(run(d=>{d.raw[0].updatedAt='2026-10-09T23:00:00Z';})).diagnosticInputReady,false);
});
test('M1: wrong period/line/player flag/type/name cannot enable other lines or a different market',()=>{
 for(const [field,value]of [['period','p1'],['handicap',1.5],['handicap',3.5],['handicap','2.5'],['playerProp',true],['marketType','teamtotals-team1'],['marketName','Corners']]){
  const b=total(run(d=>{d.catalog[1][field]=value;}));assert.equal(b.diagnosticInputReady,false);assert.ok(b.exclusionReasons.includes('EXACT_CATALOG_MAPPING_INVALID'));}
 const r=run(d=>{d.catalog.push({...d.catalog[1],marketId:999,handicap:1.5});operator(d).markets[999]=structuredClone(operator(d).markets[1010]);});
 assert.equal(r.boards.length,20);assert.ok(r.excludedMarkets.some(m=>m.sourceMarketId==='999'&&m.reason==='MARKET_OUTSIDE_M1_ALLOWLIST'));
});
test('M1: exact fixture/team/season/time binding, no home-away reversal or fuzzy association',()=>{
 for(const change of [d=>{d.bindings.events[0].home.name='Synthetic Home 0 ';},d=>{const e=d.bindings.events[0];[e.home,e.away]=[e.away,e.home];},
  d=>{d.bindings.events[0].sourceSeasonId=999;},d=>{d.bindings.events[0].home.sourceId=999;},d=>{d.bindings.events[0].kickoffUtc='2026-10-10T14:00:00Z';},
  d=>{d.raw.push(structuredClone(d.raw[0]));}]){
  const b=first(run(change));assert.equal(b.diagnosticInputReady,false);assert.equal(b.normalization.state,'INVALID');}
 for(const change of [d=>{d.bindings.round=7;},d=>{d.bindings.season='2025/26';},d=>{d.bindings.events[0].sourceEventId='nonexistent';},
  d=>{d.bindings.events.push(structuredClone(d.bindings.events[0]));}])assert.throws(()=>run(change),/MM_/);
});
test('M1: source byte/hash and normalized report mismatch fail closed',()=>{
 const args=seal(data());args.rawBytes=Buffer.from('[]');assert.throws(()=>adaptOddsPapi(args),/SOURCE_BYTES_MISMATCH/);
 const b=seal(data()),r=JSON.parse(b.reportBytes);r.selections[0].price=99;b.reportBytes=Buffer.from(JSON.stringify(r));b.source.report.sha256=hashBytes(b.reportBytes);
 assert.throws(()=>adaptOddsPapi(b),/REPORT_REPLAY_MISMATCH/);
 const c=seal(data());c.source.bookmaker='bet365';assert.throws(()=>adaptOddsPapi(c),/BOOKMAKER/);
 const e=seal(data()),report=JSON.parse(e.reportBytes);report.source.fixturesSha256='0'.repeat(64);e.reportBytes=Buffer.from(JSON.stringify(report));e.source.report.sha256=hashBytes(e.reportBytes);
 assert.throws(()=>adaptOddsPapi(e),/CANONICAL_SOURCE_HASH_MISMATCH/);
});
test('M1: contradictory raw market/outcome/price identity remains excluded',()=>{
 for(const change of [d=>{operator(d).markets[104].marketId=1010;},d=>{operator(d).markets[104].period='p1';},
  d=>{operator(d).markets[104].handicap=2.5;},d=>{operator(d).markets[104].outcomes[104].outcomeId=105;},
  d=>{yes(d).fixtureId='different';},d=>{yes(d).outcomeId=105;}]){
  const b=first(run(change));assert.equal(b.normalization.state,'INVALID');assert.equal(b.diagnosticInputReady,false);assert.ok(b.exclusionReasons.some(r=>r.startsWith('RAW_')));}
});
test('M1: source identity and all operator identifiers are mandatory; reviews cannot override flags',()=>{
 for(const change of [d=>{delete operator(d).bookmakerFixtureId;},d=>{delete operator(d).markets[104].bookmakerMarketId;},d=>{delete yes(d).bookmakerOutcomeId;}]){
  assert.equal(first(run(change)).diagnosticInputReady,false);}
 const b=first(run(d=>{operator(d).markets[104].marketActive=false;yes(d).manualVerification={availability:'available',verified:true};}));
 assert.equal(b.availability.state,'CLOSED');assert.equal(b.diagnosticInputReady,false);
});
test('M1: replay verifies against originals, even when a tampered output is rehashed',()=>{
 const args=seal(data()),r=adaptOddsPapi(args);assert.equal(verifyNormalizedSnapshot(r,args),true);
 r.boards[0].outcomes[0].price=99;const {canonicalSha256:ignored,...payload}=r;assert.ok(ignored);r.canonicalSha256=hashValue(payload);
 assert.throws(()=>verifyNormalizedSnapshot(r,args),/MM_NORMALIZED_REPLAY_MISMATCH/);
});
test('M1: consumer contract is provider-neutral and does not implement a second adapter',()=>{
 const r=run();delete r.canonicalSha256;r.adapterVersion='future-provider-contract-test';r.source.providerId='future-provider';
 assert.equal(validateBoardSnapshot(r),r);assert.equal(describeCapabilities().providerId,'oddspapi');
});
test('M1: malformed source and duplicate JSON keys, including escaped keys, are rejected',()=>{
 for(const text of ['{','{"x":1,"x":2}','{"x":1,"\\u0078":2}','[{"a":{"x":1,"x":2}}]']){
  const bytes=Buffer.from(text);assert.throws(()=>parseSource(bytes,{ref:'synthetic.json',sha256:hashBytes(bytes)}),/MM_SOURCE_(JSON_INVALID|DUPLICATE_JSON_KEY)/);}
 const a=seal(data());a.source.raw.ref='https://host/?apiKey=FORBIDDEN';assert.throws(()=>adaptOddsPapi(a),/SOURCE_REFERENCE_INVALID/);
 const extra=seal(data());extra.source.raw.apiKey='SYNTHETIC_DO_NOT_ECHO';assert.throws(()=>adaptOddsPapi(extra),/^Error: MM_SOURCE_REFERENCE_INVALID$/);
 const binding=seal(data());binding.bindings.events[0].unexpected='SYNTHETIC_DO_NOT_ECHO';assert.throws(()=>adaptOddsPapi(binding),/MM_BINDING_IDENTITY_INVALID/);
 const malformed=seal(data());malformed.reportBytes=Buffer.from('null');malformed.source.report.sha256=hashBytes(malformed.reportBytes);
 assert.throws(()=>adaptOddsPapi(malformed),/MM_REPORT_IDENTITY_INVALID/);
 const b=first(run(d=>{d.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes=[];}));
 assert.equal(b.diagnosticInputReady,false);assert.equal(b.completeness.state,'INCOMPLETE');assert.ok(b.exclusionReasons.includes('MARKET_STRUCTURE_INVALID'));
});
test('M1: repeated execution deterministic, no mutation even with frozen metadata; output does not alias input',()=>{
 const args=seal(data());frozen(args.source);frozen(args.bindings);const before=hashValue(args);
 const a=adaptOddsPapi(args),b=adaptOddsPapi(args);assert.deepEqual(a,b);assert.equal(hashValue(args),before);
 a.boards[0].event.home.name='modified output';assert.notEqual(a.boards[0].event.home.name,args.bindings.events[0].home.name);
 const caps=describeCapabilities();caps.mapping.BTTS.labels[104][0]='changed';assert.equal(describeCapabilities().mapping.BTTS.labels[104][0],'Yes');
});
test('M1: canonical validator refuses false readiness/completeness/availability/admission',()=>{
 for(const mutate of [r=>{r.boards[0].outcomes.pop();},r=>{r.boards[0].availability.signals.marketEnabled=false;},
  r=>{r.boards[0].diagnosticInputReady=false;},r=>{r.scientificEligibility='VALIDATED';},r=>{r.boards[0].line=1.5;}]){
  const r=run();mutate(r);assert.throws(()=>validateBoardSnapshot(r),/MM_/);}
});
test('M1: local loader/CLI reads only sealed inputs and does not modify files or timestamps',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-mm-m1-'));
 try{const args=seal(data());const config={schema:INPUT_SCHEMA,source:args.source,bindings:args.bindings};
  for(const [name,bytes]of [[config.source.raw.ref,args.rawBytes],[config.source.catalog.ref,args.catalogBytes],[config.source.report.ref,args.reportBytes],['input.json',JSON.stringify(config)]])await fs.writeFile(path.join(dir,name),bytes,{flag:'wx'});
  const paths=await fs.readdir(dir),before=await Promise.all(paths.map(async f=>({f,stat:await fs.stat(path.join(dir,f)),hash:hashBytes(await fs.readFile(path.join(dir,f)))})));
  const result=await loadOfflineBoards(path.join(dir,'input.json'));assert.equal(result.boards.length,20);
  const cli=spawnSync(process.execPath,['scripts/multimarket-boards.mjs','--input',path.join(dir,'input.json')],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.deepEqual(JSON.parse(cli.stdout),result);
  const rejected=spawnSync(process.execPath,['scripts/multimarket-boards.mjs','--refresh'],{encoding:'utf8'});assert.equal(rejected.status,1);assert.match(rejected.stderr,/MM_USAGE/);
  assert.deepEqual(await fs.readdir(dir),paths);for(const p of before){const file=path.join(dir,p.f);assert.equal(hashBytes(await fs.readFile(file)),p.hash);assert.equal((await fs.stat(file)).mtimeMs,p.stat.mtimeMs);}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
