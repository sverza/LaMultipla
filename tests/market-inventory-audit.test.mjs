import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryMarkets,inventoryMarkdown,familyAssessment} from '../scripts/lib/audit/market-inventory.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
import {sample,catalog,round} from './fixtures/oddspapi.mjs';
function inputs(){const raw=sample(),r=buildReport(raw,catalog,{round,observedAt:'2026-10-10T08:00:00Z',source:'synthetic_test'});return {reports:[{file:'SYNTHETIC-report',report:r}],catalog,rawSnapshots:[{file:'SYNTHETIC-raw',fixtures:raw}],now:'2026-10-14T18:00:00Z'};}
test('census retains every observed type, null/inactive prices and exact raw/report scopes without network or models',()=>{
 const args=inputs(),before=digest(args),a=inventoryMarkets(args);
 assert.deepEqual(new Set(a.observedMarketTypes),new Set(args.reports[0].report.selections.map(q=>q.marketType)));
 assert.equal(a.counts.reportRows,args.reports[0].report.selections.length);assert.equal(a.providerRequests,0);assert.equal(a.decision,null);assert.equal(digest(args),before);
 assert.deepEqual(new Set(a.familyCensus.filter(r=>r.observed).map(r=>r.marketType)),new Set(a.observedMarketTypes));
 for(const r of a.reportMatrix){assert.equal(r.readiness.price.numericAboveOne,r.counts.priced);assert.equal(r.readiness.settlement.bookmakerRules,'NOT_ATTESTED_BY_CENSUS');assert.equal(r.readiness.operationallyApproved,false);}
 assert.ok(a.reportMatrix.some(r=>r.marketNames.includes('Corners')&&r.assessment.family==='unclassified'&&r.counts.automaticallyMapped===0));assert.ok(a.reportMatrix.some(r=>r.playerProp===true));
});
test('offline confirmation and reinterpretation never inflate observations, even when requested fixtureIds differ',()=>{
 const args=inputs(),copy=structuredClone(args.reports[0].report);copy.round.fixtureIds=null;copy.round.verified=false;copy.source.mode='offline';copy.summary.candidate=0;
 args.reports.push({file:'SYNTHETIC-reinterpretation',report:copy});args.rawSnapshots.push(structuredClone(args.rawSnapshots[0]));
 const a=inventoryMarkets(args);assert.equal(a.counts.uniqueAcquisitionObservations,1);assert.equal(a.counts.duplicateOrReinterpretationReports,1);
 assert.equal(a.counts.reportRows,copy.selections.length);assert.equal(a.observations[0].derivedStatusVariants.length,2);
});
test('global catalog definitions are not availability proof and missing categories remain explicitly unobserved',()=>{
 const args=inputs();args.catalog=[...catalog,{sportId:10,marketId:'SYNTHETIC_EXTRA',marketType:'spreads-european',marketName:'European Handicap',period:'fulltime',playerProp:false,outcomes:[]}];
 // Raw hash is bound; changing catalog does not invent a bookmaker market.
 const a=inventoryMarkets(args),e=a.categoryChecks.find(c=>c.marketType==='spreads-european');assert.equal(e.observed,false);assert.equal(e.catalogOnly,true);
 assert.equal(a.categoryChecks.find(c=>c.category==='BetBuilder').presenceState,'NOT_OBSERVED_IN_THESE_INPUTS');
});
test('fulltime versus halves/overtime and exact Double Chance name mismatch stay visible without silent mapping',()=>{
 const args=inputs(),q={...args.reports[0].report.selections[0],marketType:'doublechance',marketName:'Double Chance Full Time',period:'fulltime',playerProp:false,outcome:'1X',line:0,playerKey:'0'};
 args.reports[0].report.selections.push(q,{...q,period:'p1'});const a=inventoryMarkets(args);
 assert.equal(a.reportMatrix.find(r=>r.marketType==='doublechance'&&r.period==='fulltime').mappingState,'EXACT_NAME_MISMATCH_NO_SILENT_ALIAS');
 assert.equal(familyAssessment('totals','p1').family,'goal_timing');assert.equal(familyAssessment('players-shots','result').family,'players');
 assert.match(inventoryMarkdown(a),/Dataset/);assert.ok(a.reportMatrix.every(r=>r.assessment.selector.includes('Only existing fulltime1X2')));
});
test('unbound raw, future observation and changed provider are rejected rather than matched by names',()=>{
 const args=inputs();assert.throws(()=>inventoryMarkets({...args,rawSnapshots:[{file:'SYNTHETIC-wrong',fixtures:[]}]}),/UNBOUND/);
 args.reports[0].report.fetchedAtUtc='2027-01-01T00:00:00Z';assert.throws(()=>inventoryMarkets(args),/INVALID/);
 args.reports[0].report.fetchedAtUtc='2026-10-10T08:00:00Z';args.reports[0].report.source.bookmaker='different';assert.throws(()=>inventoryMarkets(args),/INVALID/);
});
test('contradictory quote reinterpretations of the same acquisition stop the census',()=>{
 const args=inputs(),copy=structuredClone(args.reports[0].report);copy.selections[0].price=99;
 args.reports.push({file:'SYNTHETIC-conflict',report:copy});
 assert.throws(()=>inventoryMarkets(args),/CONFLICTING_REINTERPRETATION/);
});
