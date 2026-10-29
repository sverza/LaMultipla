import {buildMultimarketDiagnosticOptimized} from '../diagnostic-performance/multimarket.mjs';
import {prepareB1Mapping} from './mapping.mjs';
export function buildB1Diagnostic({catalog,fixtures,...input},metrics={}){
 let mapping;
 const result=buildMultimarketDiagnosticOptimized(input,metrics,{mappingFactory:({reportSha256})=>{
  mapping=prepareB1Mapping({...input,catalog,fixtures,reportSha256});return mapping.resolve;
 }});
 const target=new Set(mapping.audit.records.map(r=>r.quoteId)),availability=new Map(),technicalReasons=new Map();
 const blockers=new Set(['round_identity_unverified','forecast_expired_or_future','report_expired_or_before_forecast','exact_identity_mismatch','duplicate_quote_or_review',
  'unavailable_or_reserved','quote_time_or_kickoff_invalid','future_provider_timestamp','invalid_bookmaker_timestamp','old_change_requires_manual_check']);
 for(const r of result.pricedRecords)if(r.availability&&!availability.has(r.quoteId))availability.set(r.quoteId,r.availability);
 for(const r of result.pricedRecords)if(r.kind==='dc'&&!technicalReasons.has(r.quoteId))technicalReasons.set(r.quoteId,r.reasons.filter(v=>blockers.has(v)));
 const pricedRecords=result.pricedRecords.map(r=>{
  if(!target.has(r.quoteId))return r;const a=availability.get(r.quoteId),p=a?.provider;
  const technical=technicalReasons.get(r.quoteId)??[];
  const usable=r.priceUsableForCurrentDiagnostic&&!technical.length&&a&&!a.negative&&(p.active===true||a.override)&&p.marketActive===true&&p.bookmakerIsActive===true&&p.suspended===false;
  return usable?r:{...r,currentPrice:null,priceUsableForCurrentDiagnostic:false,expectedValuePerUnit:null,evInterval95:null,classification:'INSUFFICIENT_DATA',reasons:[...new Set([...r.reasons,...technical,'B1_CURRENT_AVAILABILITY_NOT_VERIFIED'])]};
 });
 const allowed=new Set(pricedRecords.filter(r=>r.classification==='EXPLORATORY_VALUE').map(r=>r.quoteId+'|'+r.kind));
 const ranking=result.ranking.filter(r=>allowed.has(r.quoteId+'|'+r.kind)).map((r,i)=>({...r,rank:i+1}));
 return {...result,pricedRecords,ranking,counts:{...result.counts,exploratoryRecords:ranking.length},mappingB1:mapping.audit};
}
