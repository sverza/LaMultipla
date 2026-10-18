// Equivalent diagnostic implementation; no model fitting, selector, delivery or scientific registry changes.
import {digest} from '../prospective/store.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {quantile} from '../goals/metrics.mjs';
import {experimentalScreenOptimized} from './screen.mjs';
import {createDiagnosticContext} from './context.mjs';
import {DIAGNOSTIC_POLICY,requestedSpecs} from '../diagnostics/multimarket.mjs';
import {quoteSpec} from '../engine/markets.mjs';
import {settlementEV} from '../analysis.mjs';
import {quoteIdentity} from '../availability.mjs';
import {GENERAL_POLICY} from '../decision/policy.mjs';
import {selectorFunnel} from '../diagnostics/selector-audit.mjs';

function mappingFor(report,q,context,clock){
  const matches=(context.reviews.get(q.quoteId)??[]);
  const m=matches.length===1?matches[0].settlementMapping:null,at=Date.parse(m?.verifiedAtUtc);
  return m?.reportSha256===context.reportSha256&&m.domain==='bet365.it'&&m.origin==='manual_bet365_it'&&m.settlementVerified===true
    &&m.quoteId===q.quoteId&&m.identitySha256===digest([q.fixtureId,q.marketId,q.outcomeId,q.period,q.line,q.outcome])
    &&typeof m.reviewer==='string'&&m.reviewer.trim()&&typeof m.evidence==='string'&&m.evidence.trim()
    &&Number.isFinite(at)&&at>=Date.parse(report.fetchedAtUtc)&&at<=clock&&clock-at<=30*60000?m:null;
}
function identityMatches(q,e){return e&&Array.isArray(q.fixture)&&q.fixture.length===2
  &&canonicalTeam(q.fixture[0])===e.home&&canonicalTeam(q.fixture[1])===e.away&&q.kickoffUtc===e.kickoffUtc
  &&q.quoteId===digest([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey])&&q.marketId!=null&&q.outcomeId!=null;}
function settlementReviewState(report,q,context,clock){
  const matches=(context.reviews.get(q.quoteId)??[]),v=matches.length===1?matches[0].settlementVerification:null;
  const at=Date.parse(v?.reviewedAtUtc);let url;try{url=new URL(v?.rulesUrl);}catch{return 'MANUAL_RULES_REVIEW_PENDING';}
  return v?.schema==='lamultipla-settlement-verification-v1'&&v.reportSha256===context.reportSha256&&v.quoteId===q.quoteId&&digest(v.identity??null)===digest(quoteIdentity(q))
    &&v.domain==='bet365.it'&&v.origin==='manual_official_rules'&&url.protocol==='https:'&&!url.username&&!url.password
    &&/^(?:[a-z0-9-]+\.)*bet365\.(?:it|com)$/i.test(url.hostname)&&/^[a-f0-9]{64}$/.test(v.rulesSha256)
    &&typeof v.rulesVersion==='string'&&v.rulesVersion.trim()&&v.reviewer?.trim()&&v.evidence?.trim()
    &&Number.isFinite(at)&&at<=clock&&clock-at<=GENERAL_POLICY.maxSettlementAgeDays*86400000
    &&['regulationTimeIncludingStoppage','extraTimeExcluded','penaltiesExcluded','voidAndPostponementReviewed'].every(k=>v[k]===true)?
    'RECORDED_MANUAL_RULES_ATTESTATION_NOT_INDEPENDENT_CERTIFICATION':'MANUAL_RULES_REVIEW_PENDING';
}
export function buildMultimarketDiagnosticOptimized({journal,study,report=null,assessment={},context=null,decision=null,now=new Date()}={},metrics={}){
  const started=performance.now();
  const clock=new Date(now).getTime();
  const work=createDiagnosticContext({journal,study,report,assessment,metrics,beforeIndex:()=>{
   if(!Number.isFinite(clock)||clock<Date.parse(DIAGNOSTIC_POLICY.registeredAtUtc)||Date.parse(journal.generatedAtUtc)>clock)throw new Error('DIAGNOSTIC_CLOCK_INVALID');
   if(!Array.isArray(assessment.assessment?.estimates??assessment.estimates??[]))throw new Error('DIAGNOSTIC_ASSESSMENT_INVALID');
  }});
  if(context&&(context.schema!=='lamultipla-match-context-v1'||context.manifest.season!==journal.manifest.season
    ||context.manifest.matchday!==journal.manifest.matchday||digest(context.manifest.events)!==digest(journal.manifest.events.map(({fixtureId,home,away,kickoffUtc})=>({fixtureId,home,away,kickoffUtc})))))throw new Error('DIAGNOSTIC_CONTEXT_IDENTITY_MISMATCH');
  if(decision&&(decision.schema!=='lamultipla-shadow-decision-v1'||decision.round.season!==journal.manifest.season||decision.round.matchday!==journal.manifest.matchday
    ||!report||decision.reportSha256!==work.reportSha256))throw new Error('DIAGNOSTIC_DECISION_REPORT_MISMATCH');
  metrics.validationAndIndexMs=performance.now()-started;
  const screenStarted=performance.now(),mathBefore=metrics.probabilityMs??0;
  const screen=report?experimentalScreenOptimized({journal,study,report,assessment,now},work):null;
  metrics.screeningMs=performance.now()-screenStarted;metrics.screeningProbabilityMs=(metrics.probabilityMs??0)-mathBefore;
  const recordsByQuote=new Map();for(const r of screen?.records??[]){let kinds=recordsByQuote.get(r.quoteId);if(!kinds){kinds=new Map();recordsByQuote.set(r.quoteId,kinds);}if(!kinds.has(r.kind))kinds.set(r.kind,r);}
  const quoteCount=new Map();for(const q of report?.selections??[])quoteCount.set(q.quoteId,(quoteCount.get(q.quoteId)??0)+1);
  const mapped=(report?.selections??[]).map(q=>({q,spec:quoteSpec(q,mappingFor(report,q,work,clock))}));
  const anomalies=mapped.filter(({spec})=>!spec).map(({q})=>({quoteId:q.quoteId,fixtureId:q.fixtureId,marketType:q.marketType,
    marketName:q.marketName,period:q.period,line:q.line,outcome:q.outcome,state:'UNSUPPORTED_OR_UNVERIFIED_MARKET_SCHEMA',eligibleForSelector:false}));
  const projections=[],priced=[];
  const mappedIndex=new Map();for(const m of mapped){if(!m.spec)continue;const key=digest([m.q.fixtureId,m.spec]),matches=mappedIndex.get(key)??[];matches.push(m);mappedIndex.set(key,matches);}
  const projected=(e,kind,spec)=>work.projection(e,kind,spec);
  for(const entry of journal.entries){
    for(const spec of requestedSpecs())for(const kind of DIAGNOSTIC_POLICY.models){
      const matched=(mappedIndex.get(digest([entry.fixtureId,spec]))??[]);
      projections.push({fixtureId:entry.fixtureId,fixture:[entry.home,entry.away],kickoffUtc:entry.kickoffUtc,kind,spec,...projected(entry,kind,spec),
        observedQuoteIds:matched.map(m=>m.q.quoteId),quoteCoverage:matched.length?'QUOTES_OBSERVED_SEE_IDENTITY_AND_TIME_CHECKS':'PRICE_NOT_OBSERVED',
        eligibleForSelector:false,operationallyApproved:false});
    }
  }
  for(const {q,spec} of mapped.filter(m=>m.spec))for(const kind of DIAGNOSTIC_POLICY.models){
    const entry=work.entries.get(q.fixtureId),p=entry?projected(entry,kind,spec):null;
    const current=Boolean(entry&&identityMatches(q,entry)&&report.round.verified&&report.round.season===journal.manifest.season&&report.round.matchday===journal.manifest.matchday
      &&Date.parse(report.fetchedAtUtc)>=Date.parse(journal.generatedAtUtc)&&clock-Date.parse(report.fetchedAtUtc)>=0&&clock-Date.parse(report.fetchedAtUtc)<=30*60000
      &&q.observedAtUtc===report.fetchedAtUtc&&clock-Date.parse(journal.generatedAtUtc)<=24*3600000&&quoteCount.get(q.quoteId)===1
      &&Date.parse(q.kickoffUtc)>clock+5*60000&&Number.isFinite(q.price)&&q.price>1);
    const record=recordsByQuote.get(q.quoteId)?.get(kind);
    const ev=current?settlementEV(q.price,p?.probabilities):null;
    const evSamples=current?(p?.bootstrapPayouts??[]).map(s=>settlementEV(q.price,s)).filter(Number.isFinite):[];
    priced.push({quoteId:q.quoteId,fixtureId:q.fixtureId,fixture:q.fixture,kickoffUtc:q.kickoffUtc,identity:quoteIdentity(q),kind,spec,
      probabilities:p?.probabilities??null,probabilityIntervals95:p?.probabilityIntervals95??null,
      observedPrice:q.price,currentPrice:current?q.price:null,observedAtUtc:q.observedAtUtc,priceUsableForCurrentDiagnostic:current,
      expectedValuePerUnit:ev,evInterval95:p?.probabilityIntervals95&&evSamples.length?[quantile(evSamples,.025),quantile(evSamples,.975)]:null,
      classification:!current?'INSUFFICIENT_DATA':kind==='referenceV1'?'REFERENCE_POINT_ONLY':!p?.probabilityIntervals95?'INSUFFICIENT_DATA':record?.classification??'INSUFFICIENT_DATA',
      reasons:[...new Set([...(record?.reasons??[]),...(!current?['fresh_exact_price_or_forecast_missing']:[]),
        ...(kind==='referenceV1'?['reference_uncertainty_not_stored']:!p?.probabilityIntervals95?['marginal_uncertainty_incomplete']:[])])],
      availability:record?.availability??null,settlementReviewState:settlementReviewState(report,q,work,clock),
      contextState:context?'OBSERVED_CONTEXT_RECHECK_AT_DECISION':'CONTEXT_NOT_PROVIDED',
      validationState:p?.modelValidation??'DISTRIBUTION_UNAVAILABLE',eligibleForSelector:false,operationallyApproved:false});
  }
  const ranking=priced.filter(r=>r.classification==='EXPLORATORY_VALUE'&&r.expectedValuePerUnit!=null)
    .sort((a,b)=>b.evInterval95[0]-a.evInterval95[0]||b.expectedValuePerUnit-a.expectedValuePerUnit||a.quoteId.localeCompare(b.quoteId)||a.kind.localeCompare(b.kind))
    .map((r,i)=>({rank:i+1,quoteId:r.quoteId,fixtureId:r.fixtureId,kind:r.kind,spec:r.spec,pointEV:r.expectedValuePerUnit,evInterval95:r.evInterval95,
      purpose:'DIAGNOSTIC_RANKING_NOT_A_RECOMMENDATION',eligibleForSelector:false}));
  metrics.totalMs=performance.now()-started;
  return {schema:'lamultipla-multimarket-diagnostic-v1',generatedAtUtc:new Date(clock).toISOString(),policy:DIAGNOSTIC_POLICY,policySha256:digest(DIAGNOSTIC_POLICY),
    round:{season:journal.manifest.season,matchday:journal.manifest.matchday},forecastGeneratedAtUtc:journal.generatedAtUtc,trainingCutoffUtc:journal.trainingCutoffUtc,
    journalSha256:work.journalSha256,studySha256:work.studySha256,datasetSha256:journal.datasetSha256,sourceCommit:journal.sourceCommit,
    reportSha256:report?work.reportSha256:null,assessmentSha256:work.assessmentSha256,contextSha256:context?digest(context):null,
    priceState:report?'OBSERVED_QUOTES_IDENTITY_AND_FRESHNESS_CHECKED_PER_RECORD':'PENDING_FRESH_REPORT',projections,pricedRecords:priced,anomalies,ranking,
    globalIssues:screen?.globalIssues??['fresh_report_not_provided'],selectorAudit:decision?selectorFunnel(decision):null,
    counts:{fixtures:journal.entries.length,requestedProjections:projections.length,pricedRecords:priced.length,unmappedQuotes:anomalies.length,
      exploratoryRecords:ranking.length,selectorEligible:0},
    sourceData:journal.sourceData==='synthetic_test'||report?.source.mode==='synthetic_test'?'synthetic_test':'original_local_artifacts',
    decision:null,decisionAuthority:'scripts/shadow.mjs_only',eligibleForSelector:false,operationallyApproved:false,actualStakeEUR:0,appDeliveryAllowed:false,publicationAllowed:false,
    limitations:['No operational proposal or validation follows from EXPLORATORY_VALUE',
      'Marginal percentile bootstrap intervals are sensitivity diagnostics, not simultaneous confidence or profit guarantees',
      'referenceV1 is the frozen v2 journal reference grid, not the original v1 scientific journal; no missing bootstrap is reconstructed',
      'Other lines/families require separate preregistered validation; no inheritance from 1X2 or Over2.5',
      'No point joint probability across matches; same-match mathematical settlement is not a bookmaker BetBuilder offer',
      'Rules/context attestations are human evidence; this report cannot independently certify their truth']};
}
