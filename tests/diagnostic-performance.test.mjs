import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticMultimarket} from './fixtures/multimarket.mjs';
import {buildMultimarketDiagnostic} from '../scripts/lib/diagnostics/multimarket.mjs';
import {buildMultimarketDiagnosticOptimized} from '../scripts/lib/diagnostic-performance/multimarket.mjs';
import {experimentalScreen} from '../scripts/lib/engine/screen.mjs';
import {experimentalScreenOptimized} from '../scripts/lib/diagnostic-performance/screen.mjs';
import {diagnosticHtml} from '../scripts/lib/diagnostics/html.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
import {quoteIdentity,verificationTemplate} from '../scripts/lib/availability.mjs';
import {settlementTemplate} from '../scripts/lib/decision/gates.mjs';
import {quoteSpec} from '../scripts/lib/engine/markets.mjs';
import {diagnosticPerformanceIdentity} from '../scripts/lib/diagnostic-performance/identity.mjs';
import {ROOT} from '../scripts/lib/private-store.mjs';
const seal=e=>{const rest={...e};delete rest.entrySha256;return {...rest,entrySha256:digest(rest)};};
function equivalent(s){
 const input=digest(s),metrics={},original=buildMultimarketDiagnostic(s),optimized=buildMultimarketDiagnosticOptimized(s,metrics);
 assert.deepEqual(optimized,original);assert.equal(JSON.stringify(optimized),JSON.stringify(original));assert.equal(diagnosticHtml(optimized),diagnosticHtml(original));
 assert.equal(digest(s),input);assert.equal(metrics.reportHashComputations,s.report?1:0);
 assert.equal(optimized.counts.selectorEligible,0);assert.ok(optimized.pricedRecords.every(r=>!r.eligibleForSelector));return optimized;
}
test('optimized complete output, JSON bytes, HTML, fingerprints, ranking and probabilities exactly equal the original',async()=>{
 assert.equal((await diagnosticPerformanceIdentity(ROOT)).scientificPolicyChanged,false);
 const s=await syntheticMultimarket();equivalent(s);assert.deepEqual(experimentalScreenOptimized(s),experimentalScreen(s));
 assert.throws(()=>experimentalScreenOptimized(s,{reportSha256:digest(s.report)}),/CONTEXT_NOT_ISSUED/);
});
test('incomplete, stale, future, unverified, inactive and invalid prices preserve all reasons without cached-state leakage',async()=>{
 const base=await syntheticMultimarket();base.report.selections=base.report.selections.slice(0,12);
 for(const change of [s=>s.report=null,s=>s.report.round.verified=false,s=>s.report.fetchedAtUtc='2026-10-16T11:00:00Z',
  s=>s.report.fetchedAtUtc='2026-10-16T13:00:00Z',s=>{s.report.selections[0].price=null;s.report.selections[1].price=NaN;s.report.selections[2].active=false;s.report.selections[3].suspended=true;},
  s=>{s.report.selections[0].changedAt='2026-10-17T00:00:00Z';s.report.selections[1].bookmakerChangedAt='not-time';}]){const s=structuredClone(base);change(s);equivalent(s);}
 const before=buildMultimarketDiagnosticOptimized(base);base.report.selections[0].price=4;const after=equivalent(base);assert.notEqual(before.reportSha256,after.reportSha256);
});
test('duplicate quotes with conflicting prices and duplicate reviews preserve first-record and last-review reference semantics',async()=>{
 const s=await syntheticMultimarket();s.report.selections=s.report.selections.slice(0,6);
 const q=s.report.selections[0];s.report.selections.push({...q,price:9},{...q,outcome:'2'});
 s.assessment={estimates:[{quoteId:q.quoteId,manualVerification:{}},{quoteId:q.quoteId,manualVerification:{}}]};
 const d=equivalent(s);assert.ok(d.pricedRecords.filter(r=>r.quoteId===q.quoteId&&r.kind!=='referenceV1').every(r=>r.reasons.includes('duplicate_quote_or_review')));
 assert.ok(d.pricedRecords.filter(r=>r.quoteId===q.quoteId).every(r=>r.currentPrice===null));
});
test('exact identities, unsupported periods and player/corner/Double Chance name exclusions are retained',async()=>{
 const s=await syntheticMultimarket();s.report.selections=s.report.selections.slice(0,5);const q=s.report.selections[0];
 s.report.selections.push({...q,marketType:'doublechance',marketName:'Double Chance Full Time',outcome:'1X'},
  {...q,period:'p1'},{...q,playerProp:true,playerName:'SYNTHETIC PLAYER',playerKey:'x'},{...q,marketType:'totals-corners',marketName:'Corners'});
 s.report.selections[1].fixture=['SYNTHETIC WRONG',q.fixture[1]];s.report.selections[2].fixtureId='SYNTHETIC UNKNOWN';
 const d=equivalent(s);assert.equal(d.anomalies.length,4);
 assert.equal(quoteSpec({...q,marketType:'doublechance',marketName:'Double Chance Full Time',outcome:'1X'},null),null);
 assert.deepEqual(quoteSpec({...q,marketType:'doublechance',marketName:'Double Chance',outcome:'1X'},null),{family:'doubleChance',outcome:'1X'});
});
test('manual quarter-line mapping, refunds, availability and rules attestations remain hash-bound and unpromoted',async()=>{
 const s=await syntheticMultimarket(),q={...s.report.selections[0],marketId:333,outcomeId:1,marketType:'spreads',marketName:'Asian Handicap',line:-.25,outcome:'1',active:false};
 q.quoteId=digest([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey]);s.report.selections=[q];
 const verification={...verificationTemplate(s.report,q),verifiedAtUtc:s.now,observedPrice:q.price,availability:'available',reviewer:'SYNTHETIC',evidence:'SYNTHETIC'};
 const rules={...settlementTemplate(s.report,q),rulesUrl:'https://help.bet365.it/s/synthetic',rulesVersion:'SYNTHETIC',rulesSha256:'a'.repeat(64),
  reviewer:'SYNTHETIC',evidence:'SYNTHETIC',reviewedAtUtc:s.now,regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,voidAndPostponementReviewed:true};
 s.assessment={estimates:[{quoteId:q.quoteId,manualVerification:verification,settlementVerification:rules,settlementMapping:{quoteId:q.quoteId,reportSha256:digest(s.report),domain:'bet365.it',origin:'manual_bet365_it',
  settlementVerified:true,side:'home',line:q.line,identitySha256:digest([q.fixtureId,q.marketId,q.outcomeId,q.period,q.line,q.outcome]),reviewer:'SYNTHETIC',evidence:'SYNTHETIC',verifiedAtUtc:s.now}}]};
 const d=equivalent(s);assert.ok(d.pricedRecords[0].probabilities.halfLoss>0);assert.equal(d.pricedRecords[0].availability.override,true);
 assert.match(d.pricedRecords[0].settlementReviewState,/RECORDED_MANUAL/);
 verification.availability='unavailable';const negative=equivalent(s);assert.equal(negative.pricedRecords[0].availability.negative,true);
 verification.identity={...quoteIdentity(q),outcome:'wrong'};rules.reportSha256='b'.repeat(64);equivalent(s);
});
test('tampering rejects before caching; invalid distributions and insufficient bootstrap produce identical nulls and intervals',async()=>{
 const s=await syntheticMultimarket();s.report.selections=s.report.selections.slice(0,3);
 s.journal.entries[0].forecasts.dc.grid[0][0]+=.1;assert.throws(()=>buildMultimarketDiagnosticOptimized(s),/entry/);assert.throws(()=>buildMultimarketDiagnostic(s),/entry/);
 s.journal.entries[0]=seal(s.journal.entries[0]);equivalent(s);
 const valid=await syntheticMultimarket();valid.report.selections=valid.report.selections.slice(0,3);valid.journal.entries[0].forecasts.dc.bootstrapGrids=[];valid.journal.entries[0]=seal(valid.journal.entries[0]);equivalent(valid);
 for(const args of [{...valid,assessment:{estimates:{}}},{...valid,now:'not-time'}]){
  let before,after;try{buildMultimarketDiagnostic(args);}catch(e){before=e.message;}try{buildMultimarketDiagnosticOptimized(args);}catch(e){after=e.message;}assert.equal(after,before);
 }
});
