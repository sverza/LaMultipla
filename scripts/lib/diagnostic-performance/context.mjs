import {digest} from '../prospective/store.mjs';
import {settlementProbabilities} from '../engine/markets.mjs';
import {quantile} from '../goals/metrics.mjs';
import {validateJournal} from '../engine/forecast.mjs';
const issued=new WeakMap();
export const isDiagnosticContext=(context,args)=>issued.get(context)?.every((v,i)=>v===[args.journal,args.study,args.report,args.assessment][i])===true;

// Call-local caches only. Journal validation runs before any cached hashes or indices are created.
export function createDiagnosticContext({journal,study,report,assessment,metrics={},beforeIndex}){
 validateJournal(journal,study);
 beforeIndex?.();
 const entries=new Map(),reviews=new Map(),cache=new Map();
 for(const e of journal.entries)if(!entries.has(e.fixtureId))entries.set(e.fixtureId,e);
 for(const e of assessment.assessment?.estimates??assessment.estimates??[]){const matches=reviews.get(e.quoteId)??[];matches.push(e);reviews.set(e.quoteId,matches);}
 const journalSha256=digest(journal),reportSha256=report?digest(report):null,assessmentSha256=digest(assessment);
 // validateJournal already checked this hash against digest(study).
 const studySha256=journal.studySha256;
 metrics.reportHashComputations=report?1:0;metrics.probabilityMs=0;metrics.payoutCacheMisses=0;
 function payouts(entry,kind,spec){
  const key=digest([entry?.fixtureId??null,kind,spec]);if(cache.has(key))return cache.get(key);
  const started=performance.now(),f=kind==='referenceV1'?entry?.referenceV1:entry?.forecasts?.[kind];
  const probabilities=f?.grid?settlementProbabilities(f.grid,spec):null;
  const samples=(f?.bootstrapGrids??[]).map(g=>settlementProbabilities(g,spec)).filter(Boolean);
  const value={probabilities,samples};cache.set(key,value);
  metrics.probabilityMs+=performance.now()-started;metrics.payoutCacheMisses++;return value;
 }
 function projection(entry,kind,spec){
  const value=payouts(entry,kind,spec);if(value.projection)return value.projection;
  const f=kind==='referenceV1'?entry.referenceV1:entry.forecasts[kind],p=value.probabilities,samples=value.samples,u=f?.uncertainty;
  const sufficient=kind!=='referenceV1'&&u?.sufficient===true&&Number.isInteger(u.replicates)&&u.replicates>=40
    &&Number.isInteger(u.failures)&&u.failures>=0&&u.failures/u.replicates<=.1
    &&samples.length>=Math.ceil(.9*u.replicates)&&samples.length<=u.replicates;
  const interval=p&&sufficient?Object.fromEntries(Object.keys(p).map(k=>[k,[quantile(samples.map(s=>s[k]),.025),quantile(samples.map(s=>s[k]),.975)]])):null;
  const result={probabilities:p,probabilityIntervals95:interval,bootstrapValidSamples:samples.length,
    uncertaintyState:kind==='referenceV1'?'REFERENCE_BOOTSTRAP_NOT_STORED':sufficient?'MARGINAL_BOOTSTRAP_DIAGNOSTIC':'DISTRIBUTION_OR_UNCERTAINTY_INSUFFICIENT',
    entryState:entry.status,modelValidation:kind==='referenceV1'&&spec.family==='oneXTwo'?'V1_RETROSPECTIVE_REFERENCE_ONLY':
      spec.family==='btts'||spec.family==='totals'&&spec.line===2.5?'PROSPECTIVE_VALIDATION_PENDING':'SEPARATE_MARKET_PROTOCOL_REQUIRED'};
  Object.defineProperty(result,'bootstrapPayouts',{value:samples});value.projection=result;return result;
 }
 const context=Object.freeze({journal,study,report,assessment,entries,reviews,journalSha256,studySha256,reportSha256,assessmentSha256,payouts,projection});
 issued.set(context,[journal,study,report,assessment]);return context;
}
