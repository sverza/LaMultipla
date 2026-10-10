import {digest} from '../prospective/store.mjs';
import {quoteIdentity} from '../availability.mjs';
import {GENERAL_POLICY} from './policy.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const timestamp=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
export function settlementTemplate(report,q){return {schema:'lamultipla-settlement-verification-v1',domain:'bet365.it',origin:'manual_official_rules',
  reportSha256:digest(report),quoteId:q.quoteId,identity:quoteIdentity(q),rulesUrl:'',rulesVersion:'',rulesSha256:'',
  reviewedAtUtc:null,reviewer:'',evidence:'',regulationTimeIncludingStoppage:null,extraTimeExcluded:null,penaltiesExcluded:null,voidAndPostponementReviewed:null};}
function bound(v,report,q){return v?.domain==='bet365.it'&&v.reportSha256===digest(report)&&v.quoteId===q.quoteId&&v.identity&&digest(v.identity)===digest(quoteIdentity(q));}
function validRules(v,report,q,clock){
  const at=timestamp(v?.reviewedAtUtc);let url;try{url=new URL(v?.rulesUrl);}catch{return false;}
  return v?.schema==='lamultipla-settlement-verification-v1'&&bound(v,report,q)&&v.origin==='manual_official_rules'
    &&url.protocol==='https:'&&!url.username&&!url.password&&/^(?:[a-z0-9-]+\.)*bet365\.(?:it|com)$/i.test(url.hostname)
    &&text(v.rulesVersion)&&/^[a-f0-9]{64}$/.test(v.rulesSha256)&&text(v.reviewer)&&text(v.evidence)
    &&Number.isFinite(at)&&at<=clock&&clock-at<=GENERAL_POLICY.maxSettlementAgeDays*86400000
    &&v.regulationTimeIncludingStoppage===true&&v.extraTimeExcluded===true&&v.penaltiesExcluded===true&&v.voidAndPostponementReviewed===true;
}
function disposition(v,report,q,clock){
  const at=timestamp(v?.reviewedAtUtc);
  return v?.schema==='lamultipla-selection-disposition-v1'&&bound(v,report,q)&&text(v.reviewer)&&text(v.reason)
    &&Number.isFinite(at)&&at>=Date.parse(report.fetchedAtUtc)&&at<=clock&&clock-at<=30*60000
    &&['exclude','review'].includes(v.action);
}
export function selectionGate(opportunities,report,assessment,contextGate,now){
  const clock=new Date(now).getTime();if(!Number.isFinite(clock))throw new Error('Invalid gate clock');
  const estimates=assessment.assessment?.estimates??assessment.estimates??[];if(!Array.isArray(estimates))throw new Error('Invalid assessment estimates');
  const entries=opportunities.candidates.map(c=>{
    const matches=estimates.filter(e=>e.quoteId===c.quoteId),q=report.selections.find(q=>q.quoteId===c.quoteId),reasons=[];
    const estimate=matches.length===1?matches[0]:null;
    if(!contextGate.eligibleFixtureIds.includes(c.fixtureId))reasons.push('context_review_required');
    if(matches.length>1)reasons.push('duplicate_selection_assessment');
    if(!q||!validRules(estimate?.settlementVerification,report,q,clock))reasons.push('settlement_rules_not_verified');
    const review=estimate?.disposition;
    if(review){if(!q||!disposition(review,report,q,clock))reasons.push('human_disposition_invalid');
      else reasons.push(review.action==='exclude'?'human_exclusion':'human_review_required');}
    return {quoteId:c.quoteId,fixtureId:c.fixtureId,eligible:!reasons.length,reasons,
      settlementVerificationSha256:estimate?.settlementVerification?digest(estimate.settlementVerification):null,
      dispositionSha256:review?digest(review):null};
  });
  return {schema:'lamultipla-selection-gate-v1',entries,eligibleQuoteIds:entries.filter(e=>e.eligible).map(e=>e.quoteId),
    reasonCounts:Object.fromEntries([...new Set(entries.flatMap(e=>e.reasons))].map(r=>[r,entries.filter(e=>e.reasons.includes(r)).length]))};
}
