import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {syntheticMultimarket} from './fixtures/multimarket.mjs';
import {syntheticB1} from './fixtures/goals-b1.mjs';
import {syntheticDecisionBundle} from './fixtures/decision.mjs';
import {buildMultimarketDiagnostic} from '../scripts/lib/diagnostics/multimarket.mjs';
import {controlledSelectorScenarios,selectorFunnel,jointRequirements} from '../scripts/lib/diagnostics/selector-audit.mjs';
import {diagnosticHtml} from '../scripts/lib/diagnostics/html.mjs';
import {diagnosticPreflight,freezeIndependentDiagnostic} from '../scripts/lib/diagnostics/freeze.mjs';
import {settlementProbabilities,evForGrid} from '../scripts/lib/engine/markets.mjs';
import {validateJournal} from '../scripts/lib/engine/forecast.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {digest,writeExclusive,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {ROOT} from '../scripts/lib/private-store.mjs';
const run=promisify(execFile),seal=e=>{const rest={...e};delete rest.entrySha256;return {...rest,entrySha256:digest(rest)};};
test('ten fixtures expose 1X2, totals1.5/2.5/3.5 and BTTS for both frozen v2 models plus an explicitly labelled reference',async()=>{
 const s=await syntheticMultimarket(),before=digest(s),d=buildMultimarketDiagnostic(s);
 assert.equal(d.counts.requestedProjections,330);assert.equal(d.counts.pricedRecords,330);assert.equal(d.counts.selectorEligible,0);
 for(const row of d.projections){assert.ok(Math.abs(Object.values(row.probabilities).reduce((a,b)=>a+b,0)-1)<1e-9);assert.equal(row.eligibleForSelector,false);}
 for(const kind of ['dc','bivariate']){const over=d.projections.filter(r=>r.fixtureId==='id9000'&&r.kind===kind&&r.spec.family==='totals'&&r.spec.outcome==='Over');
  assert.ok(over[0].probabilities.win>over[1].probabilities.win&&over[1].probabilities.win>over[2].probabilities.win);
  assert.ok(over.every(r=>r.probabilityIntervals95.win.length===2));}
 assert.equal(digest(s),before);assert.equal(d.decision,null);assert.equal(d.appDeliveryAllowed,false);
});
test('probability and settlement EV intervals come from the frozen bootstrap grids; no new fit or binary push approximation',async()=>{
 const s=await syntheticMultimarket(),d=buildMultimarketDiagnostic(s),r=d.pricedRecords.find(r=>r.kind==='dc'&&r.spec.family==='totals'&&r.spec.line===2.5);
 assert.deepEqual(r.probabilities,settlementProbabilities(s.journal.entries[0].forecasts.dc.grid,r.spec));
 assert.equal(r.expectedValuePerUnit,evForGrid(s.journal.entries[0].forecasts.dc.grid,r.spec,r.currentPrice));assert.ok(r.evInterval95[0]<=r.evInterval95[1]);
 const reference=d.pricedRecords.filter(r=>r.kind==='referenceV1');assert.ok(reference.every(r=>r.probabilityIntervals95===null&&r.evInterval95===null&&r.classification==='REFERENCE_POINT_ONLY'));
});
test('missing prices remain pending while independent projections remain visible',async()=>{
 const s=await syntheticMultimarket(),d=buildMultimarketDiagnostic({...s,report:null});assert.equal(d.projections.length,330);assert.equal(d.pricedRecords.length,0);
 assert.ok(d.projections.every(r=>r.quoteCoverage==='PRICE_NOT_OBSERVED'));assert.equal(d.priceState,'PENDING_FRESH_REPORT');
});
test('expired, preforecast and inconsistent quote identities cannot supply current price, EV or ranking',async()=>{
 const s=await syntheticMultimarket();
 const stale=buildMultimarketDiagnostic({...s,now:'2026-10-16T13:30:00Z'});assert.ok(stale.pricedRecords.every(r=>r.currentPrice===null&&r.expectedValuePerUnit===null));assert.equal(stale.ranking.length,0);
 s.report.selections[0].fixture.reverse();const d=buildMultimarketDiagnostic(s);assert.ok(d.pricedRecords.filter(r=>r.quoteId===s.report.selections[0].quoteId).every(r=>r.currentPrice===null));
 const earlier=structuredClone(s);earlier.report.fetchedAtUtc='2026-10-16T12:00:00Z';for(const q of earlier.report.selections)q.observedAtUtc=earlier.report.fetchedAtUtc;
 assert.ok(buildMultimarketDiagnostic(earlier).pricedRecords.every(r=>r.currentPrice===null));
});
test('duplicate quotes, player/corner markets and uncertain schema remain explicit, never silently mapped to goals',async()=>{
 const s=await syntheticMultimarket(),q=structuredClone(s.report.selections[0]);s.report.selections.push(q,{...q,quoteId:'corner',marketType:'totals-corners',marketName:'Corners'});
 const d=buildMultimarketDiagnostic(s);assert.equal(d.anomalies.length,1);assert.equal(d.anomalies[0].state,'UNSUPPORTED_OR_UNVERIFIED_MARKET_SCHEMA');
 assert.ok(d.pricedRecords.filter(r=>r.quoteId===q.quoteId).every(r=>r.currentPrice===null));
});
test('exact DNB and Asian quarter-line mapping preserve pushes and partial settlement; unmapped side is refused',async()=>{
 const s=await syntheticMultimarket(),q={...s.report.selections[0],marketId:333,outcomeId:1,marketType:'spreads',marketName:'Asian Handicap',line:-.25,outcome:'1'};
 q.quoteId=digest([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey]);s.report.selections=[q];
 assert.equal(buildMultimarketDiagnostic(s).pricedRecords.length,0);
 const assessment={estimates:[{quoteId:q.quoteId,settlementMapping:{quoteId:q.quoteId,reportSha256:digest(s.report),domain:'bet365.it',origin:'manual_bet365_it',
  settlementVerified:true,side:'home',line:q.line,identitySha256:digest([q.fixtureId,q.marketId,q.outcomeId,q.period,q.line,q.outcome]),reviewer:'SYNTHETIC',evidence:'SYNTHETIC',verifiedAtUtc:s.now}}]};
 const d=buildMultimarketDiagnostic({...s,assessment});assert.equal(d.pricedRecords.length,3);assert.ok(d.pricedRecords[0].probabilities.halfLoss>0);assert.equal(d.pricedRecords[0].settlementReviewState,'MANUAL_RULES_REVIEW_PENDING');
 q.marketType='drawnobet';q.marketName='Draw No Bet';q.line=0;assert.ok(buildMultimarketDiagnostic(s).pricedRecords[0].probabilities.push>0);
});
test('EXPLORATORY_VALUE remains outside selection, rules pending and app delivery is rejected',async()=>{
 const s=await syntheticMultimarket(),d=buildMultimarketDiagnostic(s);assert.ok(d.ranking.length>0);
 assert.ok(d.ranking.every(r=>r.eligibleForSelector===false));assert.ok(d.pricedRecords.every(r=>r.settlementReviewState==='MANUAL_RULES_REVIEW_PENDING'));
 assert.throws(()=>appPackage({decision:d}),/protocol/);
});
test('entry tampering and insufficent bootstrap are visible instead of fabricated marginal intervals',async()=>{
 const s=await syntheticMultimarket();s.journal.entries[0].forecasts.dc.grid[0][0]+=.1;assert.throws(()=>buildMultimarketDiagnostic(s),/entry/);
 s.journal.entries[0]=seal(s.journal.entries[0]);const invalid=buildMultimarketDiagnostic(s);assert.equal(invalid.projections[0].probabilities,null);
 const fresh=await syntheticMultimarket();fresh.journal.entries[0].forecasts.dc.bootstrapGrids=[];fresh.journal.entries[0]=seal(fresh.journal.entries[0]);
 const d=buildMultimarketDiagnostic(fresh);assert.equal(d.projections[0].probabilityIntervals95,null);assert.ok(d.pricedRecords.filter(r=>r.fixtureId==='id9000'&&r.kind==='dc').every(r=>r.classification==='INSUFFICIENT_DATA'));
});
test('HTML has no scripts, escapes source text and clearly labels synthetic, unvalidated diagnostics',async()=>{
 const s=await syntheticMultimarket(),d=buildMultimarketDiagnostic(s);d.projections[0].fixture[0]='<script>alert(1)</script>';
 const html=diagnosticHtml(d);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/DATI SINTETICI/);assert.match(html,/nessuna giocata consigliata/);
});
test('Frechet makes moderate proposals difficult but is not a structural ban on all shadow proposals',()=>{
 const audit=controlledSelectorScenarios();assert.equal(audit.scenarios[0].cause,'COMBINATION_EVIDENCE_INSUFFICIENT');assert.equal(audit.scenarios[1].cause,'JOINT_VALUE_NOT_DEMONSTRATED');
 assert.equal(audit.scenarios[2].singleClassification,'SHADOW_CANDIDATE');assert.equal(audit.scenarios[2].joint.frechetLower,0);
 assert.equal(audit.scenarios[3].joint.frechetLower,0);assert.equal(audit.scenarios[4].cause,'NOT_ENOUGH_DISTINCT_OPPORTUNITIES');
 assert.equal(audit.scenarios[5].singleClassification,'UNCERTAIN_VALUE');assert.equal(audit.scenarios[6].selectorDecision,'SHADOW_BOUND_PROPOSAL');
 assert.equal(audit.empiricalProposalRate,null);assert.ok(Math.abs(jointRequirements([.70,.70]).minimumActualPriceForLowerEV-2.625)<1e-12);
});
test('existing shadow proposal survives unchanged and MODEL_NOT_AUTHORIZED blocks operation, not simulated selection',()=>{
 const s=syntheticDecisionBundle(),before=digest(s.decision),f=selectorFunnel(s.decision);
 assert.equal(f.shadowDecision,'SHADOW_BOUND_PROPOSAL');assert.equal(f.operationalDecision.cause,'MODEL_NOT_AUTHORIZED');assert.equal(digest(s.decision),before);
 assert.equal(f.counts.selectionReady,2);const missing=syntheticDecisionBundle('missing_rules');assert.ok(selectorFunnel(missing.decision).manualReviewExclusions.settlement_rules_not_verified>0);
});
test('new original diagnostic freezes only in the first useful window, never early, late, without reconfirmation or on G6',async()=>{
 const s=await syntheticMultimarket();let calls=0;
 const freeze=async({clock})=>{calls++;clock();return {journal:s.journal,filename:'SYNTHETIC',reused:false};};
 const args={...s,root:ROOT,freeze,clock:()=>new Date('2026-10-16T12:50:00Z')};
 for(const at of ['2026-10-16T12:44:59Z','2026-10-16T16:15:00Z'])await assert.rejects(freezeIndependentDiagnostic({...args,clock:()=>new Date(at)}),/WINDOW/);
 assert.equal(calls,0);await assert.rejects(freezeIndependentDiagnostic({...args,calendar:null}),/CALENDAR/);
 await assert.rejects(freezeIndependentDiagnostic({...args,schedule:{...s.schedule,matchday:6}}));
 const result=await freezeIndependentDiagnostic(args);assert.equal(calls,1);validateJournal(result.journal,s.study);
 let clockCalls=0;await assert.rejects(freezeIndependentDiagnostic({...args,clock:()=>new Date(++clockCalls<=2?'2026-10-16T12:50:00Z':'2026-10-16T16:15:00Z')}),/DEADLINE/);
});
test('preflight is read-only and registered engine identity remains unchanged',async()=>{
 const s=await syntheticMultimarket(),d=await diagnosticPreflight({...s,root:ROOT});assert.equal(d.forecastProduced,false);assert.equal(d.providerRequests,0);assert.deepEqual(d.validatedMarkets,[]);
});
test('CLI creates only immutable diagnostic JSON/HTML, rejects network flags and outside-private inputs',async()=>{
 const s=await syntheticMultimarket(),root=path.join(ROOT,'.local/tests/multimarket-'+crypto.randomUUID());await fs.mkdir(root,{recursive:true});
 const study=path.join(root,'study.json'),journal=path.join(root,'journal.json'),report=path.join(root,'report.json');await writeExclusive(study,s.study);await writeExclusive(journal,s.journal);
 await fs.writeFile(report,JSON.stringify(s.report));
 // Projection-only CLI is at the actual current clock, so use synthetic future timestamps observed before now.
 const generated='2026-10-14T17:34:00.000Z';s.journal.generatedAtUtc=generated;s.journal.datasetAcquiredAtUtc='2026-10-14T17:01:00.000Z';
 s.journal.entries=s.journal.entries.map(e=>seal({...e,generatedAtUtc:generated}));const localJournal=path.join(root,'local-journal.json');await writeExclusive(localJournal,s.journal);
 const result=await run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--report','--study',study,'--journal',localJournal],{cwd:ROOT});
 const output=JSON.parse(result.stdout),d=await readSnapshot(output.file);assert.equal(d.priceState,'PENDING_FRESH_REPORT');assert.equal(output.providerRequests,0);assert.ok(await fs.stat(output.htmlFile));
 await assert.rejects(run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--report','--live-odds'],{cwd:ROOT}));
 await assert.rejects(run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--inspect',path.join(ROOT,'README.md')],{cwd:ROOT}));
});
test('B1 CLI reads only the exact private source chain and records both adapter identities without delivery',async()=>{
 const s=await syntheticB1(),dir=path.join(ROOT,'.local/tests/b1-cli-'+crypto.randomUUID());await fs.mkdir(dir,{recursive:true});
 const study=path.join(dir,'study.json'),journal=path.join(dir,'journal.json'),report=path.join(dir,'report.json'),catalog=path.join(dir,'catalog.json'),fixtures=path.join(dir,'fixtures.json');
 await writeExclusive(study,s.study);await writeExclusive(journal,s.journal);
 for(const [file,value] of [[report,s.report],[catalog,s.catalog],[fixtures,s.fixtures]])await fs.writeFile(file,JSON.stringify(value));
 const result=await run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--report','--study',study,'--journal',journal,'--odds-report',report,'--goals-b1','--catalog',catalog,'--fixtures',fixtures],{cwd:ROOT});
 const output=JSON.parse(result.stdout),d=await readSnapshot(output.file);assert.equal(d.mappingAdapter.version,'goals-mapping-b1-v1');assert.equal(d.mappingB1.counts.verified,73);
 assert.equal(d.performanceAdapter.version,'diagnostic-performance-v1');assert.equal(d.appDeliveryAllowed,false);assert.equal(d.eligibleForSelector,false);
 const b2result=await run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--report','--study',study,'--journal',journal,'--odds-report',report,'--goals-b2','--catalog',catalog,'--fixtures',fixtures],{cwd:ROOT});
 const b2=await readSnapshot(JSON.parse(b2result.stdout).file);assert.equal(b2.mappingAdapter.version,'goals-mapping-b2-v1');assert.ok(b2.mappingB2);
 assert.equal(b2.appDeliveryAllowed,false);assert.equal(b2.eligibleForSelector,false);
 await assert.rejects(run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--report','--goals-b1','--goals-b2'],{cwd:ROOT}));
 await assert.rejects(run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--report','--goals-b1'],{cwd:ROOT}));
 await assert.rejects(run(process.execPath,[path.join(ROOT,'scripts/multimarket-diagnostic.mjs'),'--freeze','--goals-b1','--catalog',catalog,'--fixtures',fixtures],{cwd:ROOT}));
});
