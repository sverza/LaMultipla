import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {syntheticMultimarket} from './fixtures/multimarket.mjs';
import {market,quote} from './fixtures/oddspapi.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
import {digest,envelope} from '../scripts/lib/prospective/store.mjs';
import {adaptOddsPapi} from '../scripts/lib/mm-simulator-v1/oddspapi.mjs';
import {BINDINGS_SCHEMA,hashBytes,hashValue} from '../scripts/lib/mm-simulator-v1/contracts.mjs';
import {projectFrozenFamily,diagnoseProbabilityBoards,PROJECTION_POLICY} from '../scripts/lib/mm-simulator-v1/probabilities.mjs';
import {loadProbabilityDiagnostic,PROBABILITY_INPUT_SCHEMA} from '../scripts/lib/mm-simulator-v1/probability-reader.mjs';
import {probabilityMarkdown} from '../scripts/lib/mm-simulator-v1/probability-report.mjs';

// All teams, prices, grids, parameters, clocks and artifacts below are SYNTHETIC.
function grid(){const g=Array.from({length:4},()=>Array(4).fill(0));g[0][0]=.1;g[0][1]=.2;g[1][0]=.1;g[1][1]=.3;g[2][1]=.2;g[3][0]=.1;return g;}
function forecast(){return {grid:grid(),temperature:1,bootstrapGrids:Array.from({length:40},(_,b)=>{const g=grid(),delta=(b-20)*.001;g[0][0]+=delta;g[1][1]-=delta;return g;}),
 uncertainty:{replicates:40,failures:0,sufficient:true,seed:20261010}};}
const near=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const resign=j=>{for(const e of j.entries){const {entrySha256,...value}=e;assert.ok(entrySha256);e.entrySha256=digest(value);}};
const snapshotHash=b=>{const {canonicalSha256,...value}=b;assert.ok(canonicalSha256);b.canonicalSha256=hashValue(value);};
const freeze=v=>{if(v&&typeof v==='object'&&!Buffer.isBuffer(v)){Object.freeze(v);Object.values(v).forEach(freeze);}return v;};

async function fixture(){
 const a=await syntheticMultimarket(),journal=a.journal,study=a.study;
 journal.models=Object.fromEntries(['dc','bivariate'].map(k=>[k,{synthetic:true,config:structuredClone(study.selected[k].config),converged:true}]));
 for(const e of journal.entries)e.forecasts={dc:forecast(),bivariate:forecast()};resign(journal);
 const raw=a.calendar.fixtures.map((f,i)=>({...f,participant1Id:2*i+1,participant2Id:2*i+2,
  bookmakerOdds:{'bet365.it':{bookmakerIsActive:true,suspended:false,bookmakerFixtureId:'synthetic-book-'+i,markets:{
   104:market({104:{0:quote({bookmakerOutcomeId:'synthetic-yes',changedAt:a.report.fetchedAtUtc})},105:{0:quote({bookmakerOutcomeId:'synthetic-no',changedAt:a.report.fetchedAtUtc})}},{bookmakerMarketId:'synthetic-btts'}),
   1010:market({1010:{0:quote({bookmakerOutcomeId:'synthetic-over',changedAt:a.report.fetchedAtUtc})},1011:{0:quote({bookmakerOutcomeId:'synthetic-under',changedAt:a.report.fetchedAtUtc})}},{bookmakerMarketId:'synthetic-total'})}}}}));
 const catalog=[{marketId:104,marketLength:2,marketName:'Both Teams To Score',marketType:'bothteamsscore',sportId:10,playerProp:false,period:'fulltime',handicap:0,outcomes:[{outcomeId:104,outcomeName:'Yes'},{outcomeId:105,outcomeName:'No'}]},
  {marketId:1010,marketLength:2,marketName:'Over Under Full Time',marketType:'totals',sportId:10,playerProp:false,period:'fulltime',handicap:2.5,outcomes:[{outcomeId:1010,outcomeName:'Over'},{outcomeId:1011,outcomeName:'Under'}]}];
 const round={season:'2026/27',matchday:7,fixtureIds:raw.map(f=>f.fixtureId),fromUtc:'2026-10-16T00:00:00Z',toUtc:'2026-10-20T00:00:00Z'};
 const binding={schema:BINDINGS_SCHEMA,competition:'ITA_SERIE_A',season:round.season,round:7,events:raw.map((f,i)=>({id:'synthetic-event-'+i,sourceEventId:f.fixtureId,sourceSeasonId:f.seasonId,kickoffUtc:f.startTime,home:{id:'synthetic-home-'+i,sourceId:f.participant1Id,name:f.participant1Name},away:{id:'synthetic-away-'+i,sourceId:f.participant2Id,name:f.participant2Name}}))};
 const boardsFromRaw=()=>{const report=buildReport(raw,catalog,{round,observedAt:a.report.fetchedAtUtc,source:'synthetic_test'});
  const rawBytes=Buffer.from(JSON.stringify(raw)),catalogBytes=Buffer.from(JSON.stringify(catalog)),reportBytes=Buffer.from(JSON.stringify(report));
  return adaptOddsPapi({rawBytes,catalogBytes,reportBytes,bindings:binding,source:{providerId:'oddspapi',bookmaker:'bet365.it',raw:{ref:'synthetic-raw.json',sha256:hashBytes(rawBytes)},catalog:{ref:'synthetic-catalog.json',sha256:hashBytes(catalogBytes)},report:{ref:'synthetic-report.json',sha256:hashBytes(reportBytes)}}});};
 return {journal,study,raw,catalog,boardsFromRaw,boards:boardsFromRaw(),freezeCompletedAtUtc:'2026-10-16T12:47:00.000Z'};
}
const run=f=>diagnoseProbabilityBoards({boards:f.boards,journal:f.journal,study:f.study,freezeCompletedAtUtc:f.freezeCompletedAtUtc});

test('M2: exact BTTS and O/U2.5 marginal probabilities, complements and descriptive frozen-bootstrap quantiles',()=>{
 const f=forecast(),b=projectFrozenFamily(f,'BTTS'),t=projectFrozenFamily(f,'TOTAL_GOALS');
 near(b.outcomes.YES.probability,.5);near(b.outcomes.NO.probability,.5);near(t.outcomes.OVER.probability,.3);near(t.outcomes.UNDER.probability,.7);
 near(b.complementSum,1);near(t.complementSum,1);near(b.outcomes.YES.interval95[0],.481);near(b.outcomes.YES.interval95[1],.519);
 assert.equal(b.uncertainty.validSamples,40);assert.equal(b.uncertainty.simultaneous,false);assert.equal(b.uncertainty.intervalMethod,'FROZEN_BOOTSTRAP_EMPIRICAL_QUANTILES_FLOOR');
 assert.throws(()=>projectFrozenFamily(f,'TOTAL_GOALS_1_5'),/OUTSIDE_SCOPE/);
});
test('M2: grids missing, non-square, negative, nonfinite or with wrong mass cannot yield probabilities',()=>{
 for(const invalid of [null,[],[[1,0]],[[.5,-.1],[.2,.4]],[[.5,NaN],[0,.5]],[[.2,0],[0,.2]]]){
  const p=projectFrozenFamily({...forecast(),grid:invalid},'BTTS');assert.equal(p.state,'PROBABILITY_UNAVAILABLE');assert.equal(p.outcomes.YES.probability,null);assert.equal(p.outcomes.YES.interval95,null);}
 const almost=grid();almost[0][0]+=1e-7;assert.equal(projectFrozenFamily({...forecast(),grid:almost},'BTTS').state,'PROBABILITY_UNAVAILABLE');
});
test('M2: missing/insufficient/inconsistent bootstrap never invents intervals or refits; central estimate remains available',()=>{
 const cases=[f=>{delete f.bootstrapGrids;},f=>{delete f.uncertainty;},f=>{f.bootstrapGrids=f.bootstrapGrids.slice(0,35);f.uncertainty={replicates:40,failures:5,sufficient:false};},
  f=>{f.uncertainty.failures=1;},f=>{f.bootstrapGrids[0]=null;},f=>{f.bootstrapGrids[0]=[[1]];},f=>{f.uncertainty.replicates=39;}];
 for(const change of cases){const f=forecast();change(f);const p=projectFrozenFamily(f,'BTTS');near(p.outcomes.YES.probability,.5);assert.equal(p.outcomes.YES.interval95,null);assert.ok(p.reasons.length);}
 const absent=forecast();delete absent.bootstrapGrids;const p=projectFrozenFamily(absent,'BTTS');assert.equal(p.uncertainty.storedSamples,null);assert.equal(p.uncertainty.validSamples,null);
 const limit=forecast();limit.bootstrapGrids=limit.bootstrapGrids.slice(0,36);limit.uncertainty={replicates:40,failures:4,sufficient:true};assert.ok(projectFrozenFamily(limit,'BTTS').outcomes.YES.interval95);
});
test('M2: central estimate outside percentile interval is exposed without widening or modification',()=>{
 const f=forecast();f.bootstrapGrids=Array.from({length:40},()=>{const g=grid();g[0][0]+=.1;g[1][1]-=.1;return g;});
 const p=projectFrozenFamily(f,'BTTS');near(p.outcomes.YES.probability,.5);near(p.outcomes.YES.interval95[0],.4);near(p.outcomes.YES.interval95[1],.4);
 assert.ok(p.warnings.includes('CENTRAL_ESTIMATE_OUTSIDE_BOOTSTRAP_INTERVAL:YES'));
});
test('M2: valid M1 boards bind exact frozen-journal entries, keep models distinct and hash all source distributions',async()=>{
 const f=await fixture();f.journal.entries[0].forecasts.bivariate.grid[0][0]+=.1;f.journal.entries[0].forecasts.bivariate.grid[1][1]-=.1;resign(f.journal);
 const r=run(f);assert.equal(r.records.length,40);assert.equal(r.counts.matchedBoards,20);assert.equal(r.counts.calculatedModelProbabilities,80);
 assert.equal(r.state,'COMPLETE_OFFLINE_DIAGNOSTIC');const q=r.records.find(q=>q.outcome==='YES');near(q.models.dc.probability,.5);near(q.models.bivariate.probability,.4);
 assert.equal(q.models.dc.gridSha256,hashValue(f.journal.entries[0].forecasts.dc.grid));assert.equal(q.entrySha256,f.journal.entries[0].entrySha256);
 assert.equal(r.provenance.journalSha256,hashValue(f.journal));assert.equal(r.provenance.datasetSha256,f.journal.datasetSha256);
 assert.equal(q.currentPrice,null);assert.equal(q.priceLabel,'STORICO — NON OFFERTA ATTUALE');assert.equal(q.validationState,'PROSPECTIVE_VALIDATION_PENDING');
 assert.equal(q.eligibleForSelector,false);assert.equal(r.appDeliveryAllowed,false);assert.equal(r.actualStakeEUR,0);assert.equal(r.provenance.verification,'STRUCTURAL_ONLY_NOT_A_FREEZE_ATTESTATION');
});
test('M2: closed markets keep calculable probabilities and original exclusions, without a manual override',async()=>{
 const f=await fixture();f.raw[0].bookmakerOdds['bet365.it'].markets[104].marketActive=false;f.boards=f.boardsFromRaw();const r=run(f),q=r.records[0];
 assert.equal(q.boardAvailability,'CLOSED');assert.equal(q.diagnosticInputReadyM1,false);near(q.models.dc.probability,.5);assert.ok(q.exclusions.includes('SOURCE_FLAGS_CLOSED'));
});
test('M2: incomplete board never invents a missing quote; projections remain explicitly separate',async()=>{
 const f=await fixture();delete f.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes[105];f.boards=f.boardsFromRaw();const r=run(f);
 assert.equal(r.records.length,39);assert.equal(r.state,'PARTIAL_DIAGNOSTIC');const b=r.boardStates[0];assert.equal(b.completeness.state,'INCOMPLETE');
 assert.equal(b.diagnosticInputReadyM1,false);assert.deepEqual(b.completeness.missing,['NO']);assert.ok(b.models.dc.projection.outcomes.NO.probability!==null);
 assert.equal(r.records.filter(q=>q.event.id===b.event.id&&q.family==='BTTS'&&q.outcome==='NO').length,0);
});
test('M2: fixture, home-away, kickoff, season or round discordance does not bind to another event',async()=>{
 for(const edit of [b=>{b.event.sourceEventId='unmatched';},b=>{[b.event.home,b.event.away]=[b.event.away,b.event.home];},b=>{b.event.kickoffUtc='2026-10-16T19:45:00.000Z';}]){
  const f=await fixture();edit(f.boards.boards[0]);snapshotHash(f.boards);const r=run(f);assert.equal(r.boardStates[0].forecastLinkState,'EXCLUDED');assert.equal(r.records[0].models.dc.probability,null);}
 for(const edit of [b=>{b.scope.round=8;},b=>{b.scope.season='2025/26';}]){const f=await fixture();edit(f.boards);snapshotHash(f.boards);const r=run(f);
  assert.equal(r.counts.matchedBoards,0);assert.ok(r.records.every(q=>q.models.dc.probability===null));}
});
test('M2: M1 invalid timestamps, price identity and duplicate quotes remain blocked',async()=>{
 for(const edit of [f=>{f.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes[104].players[0].changedAt='2026-10-17T00:00:00Z';},
  f=>{f.raw[0].bookmakerOdds['bet365.it'].markets[104].outcomes[104].players[1]=quote();}]){
  const f=await fixture();edit(f);f.boards=f.boardsFromRaw();const r=run(f);assert.equal(r.boardStates[0].forecastLinkState,'EXCLUDED');assert.equal(r.records[0].models.dc.probability,null);}
 const f=await fixture();f.boards.boards.push(structuredClone(f.boards.boards[0]));snapshotHash(f.boards);assert.throws(()=>run(f),/MM_BOARD_INVALID/);
 const g=await fixture();g.boards.boards[0].outcomes[1].id=g.boards.boards[0].outcomes[0].id;snapshotHash(g.boards);
 const r=run(g);assert.equal(r.records[0].models.dc.probability,null);assert.ok(r.records[0].exclusions.includes('DUPLICATE_QUOTE_REFERENCE'));
});
test('M2: timestamps before generation/completion and cross-mode synthetic/original data are excluded',async()=>{
 const f=await fixture();f.freezeCompletedAtUtc='2026-10-16T12:49:00.000Z';assert.equal(run(f).counts.matchedBoards,0);
 f.freezeCompletedAtUtc='2026-10-16T12:45:00.000Z';assert.throws(()=>run(f),/FREEZE_TIMESTAMP_INVALID/);
 const g=await fixture();g.journal.generatedAtUtc='2026-10-16T12:49:00.000Z';for(const e of g.journal.entries)e.generatedAtUtc=g.journal.generatedAtUtc;resign(g.journal);g.freezeCompletedAtUtc=null;
 assert.equal(run(g).counts.matchedBoards,0);
 const h=await fixture();h.boards.source.observationKind='ARCHIVED';snapshotHash(h.boards);assert.equal(run(h).counts.matchedBoards,0);
});
test('M2: tampered journal/study/entry/model and manifest identities fail actual registered validators',async()=>{
 for(const edit of [f=>{f.journal.entries[0].forecasts.dc.grid[0][0]=.9;},f=>{f.study.selected.dc.temperature=.99;},
  f=>{f.journal.modelVersion='fake';},f=>{f.journal.entries[0].home='wrong';resign(f.journal);}]){
  const f=await fixture();edit(f);assert.throws(()=>run(f));}
 const f=await fixture();f.journal.models.dc.config.ridge=5;const r=run(f);assert.equal(r.records[0].models.dc.probability,null);assert.ok(r.records[0].models.bivariate.probability!==null);
});
test('M2: missing model grid or insufficient bootstrap produces independent per-model exclusions',async()=>{
 const f=await fixture();delete f.journal.entries[0].forecasts.dc.grid;resign(f.journal);const r=run(f);
 assert.equal(r.records[0].models.dc.probability,null);near(r.records[0].models.bivariate.probability,.5);assert.equal(r.state,'PARTIAL_DIAGNOSTIC');
 const g=await fixture();delete g.journal.entries[0].forecasts.dc.bootstrapGrids;resign(g.journal);const q=run(g).records[0];near(q.models.dc.probability,.5);assert.equal(q.models.dc.interval95,null);
});
test('M2: probability projections never depend on bookmaker price, ranking, EV or subsequent results',async()=>{
 const f=await fixture(),a=run(f);for(const e of f.raw)for(const m of Object.values(e.bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))o.players[0].price=99;
 f.boards=f.boardsFromRaw();const b=run(f);assert.deepEqual(a.records.map(q=>q.models),b.records.map(q=>q.models));
 for(const q of b.records){assert.equal('expectedValuePerUnit'in q,false);assert.equal('rank'in q,false);}assert.equal('ranking'in b,false);assert.equal('decision'in b,false);assert.equal('jointProbability'in b,false);
});
test('M2: frozen inputs, deterministic replay, JSON/Markdown rendering and source hashes remain unchanged',async()=>{
 const f=await fixture();freeze(f.boards);freeze(f.journal);freeze(f.study);const before=hashValue([f.boards,f.journal,f.study]);const a=run(f),b=run(f);
 assert.deepEqual(a,b);const json=JSON.stringify(a);const markdown=probabilityMarkdown(a);assert.equal(probabilityMarkdown(a),markdown);assert.match(markdown,/PREZZI STORICI/);
 assert.equal(JSON.stringify(a),json);assert.equal(hashValue([f.boards,f.journal,f.study]),before);assert.equal(a.canonicalSha256,hashValue(Object.fromEntries(Object.entries(a).filter(([k])=>k!=='canonicalSha256'))));
 assert.equal(a.policy.numericalTolerance,PROJECTION_POLICY.numericalTolerance);
 const altered=structuredClone(a);altered.records[0].models.dc.probability=.9;assert.throws(()=>probabilityMarkdown(altered),/MM2_RENDER_INPUT_CHANGED/);
});
test('M2: CLI has no acquisition/clock options; reader rejects missing/partial official freeze and does not write',async()=>{
 const help=spawnSync(process.execPath,['scripts/multimarket-probabilities.mjs','--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/Solo lettura/);
 const wrong=spawnSync(process.execPath,['scripts/multimarket-probabilities.mjs','--clock','2026-10-23T14:45:00Z'],{encoding:'utf8'});assert.equal(wrong.status,1);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-mm2-'));
 try{const local=path.join(dir,'.local');await fs.mkdir(local);const board='{}',plan='{}';await fs.writeFile(path.join(local,'board.json'),board);await fs.writeFile(path.join(local,'plan.json'),plan);
  const config={schema:PROBABILITY_INPUT_SCHEMA,boardsInput:{ref:'board.json',sha256:hashBytes(board)},referencePlan:{ref:'plan.json',sha256:hashBytes(plan)}};
  const file=path.join(local,'input.json');await fs.writeFile(file,JSON.stringify(config));const names=await fs.readdir(local),before=await Promise.all(names.map(async n=>[n,hashBytes(await fs.readFile(path.join(local,n))),(await fs.stat(path.join(local,n))).mtimeMs]));
  await assert.rejects(()=>loadProbabilityDiagnostic(dir,file),/REQUIRES_FROZEN_VERIFIED/);
  assert.deepEqual(await fs.readdir(local),names);for(const [n,h,at]of before){assert.equal(hashBytes(await fs.readFile(path.join(local,n))),h);assert.equal((await fs.stat(path.join(local,n))).mtimeMs,at);}
  const cohort=path.join(local,'research-review/cohorts/reference-g8-20261023-v1');await fs.mkdir(cohort,{recursive:true});
  const intent=path.join(cohort,'freeze-intent.json'),content=JSON.stringify(envelope({schema:'synthetic-incomplete-intent',inputSha256:'a'.repeat(64)}));
  await fs.writeFile(intent,content);const at=(await fs.stat(intent)).mtimeMs;
  await assert.rejects(()=>loadProbabilityDiagnostic(dir,file),/REQUIRES_FROZEN_VERIFIED/);assert.equal(await fs.readFile(intent,'utf8'),content);assert.equal((await fs.stat(intent)).mtimeMs,at);
  assert.deepEqual(await fs.readdir(cohort),['freeze-intent.json']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
