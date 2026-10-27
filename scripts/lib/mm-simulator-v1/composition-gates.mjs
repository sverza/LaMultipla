import {contextGate} from '../context/dossier.mjs';
import {GENERAL_POLICY} from '../decision/policy.mjs';
import {hashValue,timestamp,isObject,exactFields} from './contracts.mjs';

export const SCENARIO_SCHEMA='lamultipla-mm-synthetic-policy-scenario-v1';
export const REVIEW_SCHEMA='lamultipla-mm-synthetic-selection-review-v1';
export const TICKET_SCHEMA='lamultipla-mm-synthetic-ticket-review-v1';
const positive=v=>Number.isFinite(v)&&v>0;
const nonnegative=v=>Number.isFinite(v)&&v>=0;
const fields=['minPointEV','minLowerEV','maxIntervalWidth','minCombinationLowerEV','maxForecastAgeHours',
 'maxQuoteAgeMinutes','maxCalendarAgeMinutes','maxChangeAgeHours','completionLeadMinutes','maxTicketReviews'];
export function validScenario(s){
 return isObject(s)&&exactFields(s,['schema','synthetic','approvalState',...fields])&&s.schema===SCENARIO_SCHEMA&&s.synthetic===true&&s.approvalState==='NOT_APPROVED'
  &&fields.every(k=>Object.hasOwn(s,k)&&Number.isFinite(s[k]))
  &&['minPointEV','minLowerEV','minCombinationLowerEV'].every(k=>nonnegative(s[k]))
  &&positive(s.maxIntervalWidth)&&s.maxIntervalWidth<=1
  &&['maxForecastAgeHours','maxQuoteAgeMinutes','maxCalendarAgeMinutes','maxChangeAgeHours','completionLeadMinutes'].every(k=>positive(s[k]))
  &&Number.isSafeInteger(s.maxTicketReviews)&&s.maxTicketReviews>=0;
}
const ageOK=(at,now,ms)=>timestamp(at)&&Date.parse(at)<=now&&now-Date.parse(at)<=ms;
const same=(a,b)=>hashValue(a)===hashValue(b);
const ref=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);

// Only synthetic assertions are understood here. This is deliberately NOT an
// authentic human-review/consent reader; M3-A cannot activate an admission policy.
export function syntheticGateContext(context,journal,atUtc){
 if(!context)return {eligibleFixtureIds:[],reasons:['CONTEXT_MISSING'],sha256:null};
 if(context.sourceData!=='synthetic_test'||context.evidence?.synthetic!==true)
  return {eligibleFixtureIds:[],reasons:['CONTEXT_NOT_SYNTHETIC'],sha256:null};
 try{const gate=contextGate(context,journal,atUtc);return {...gate,sha256:hashValue(context)};}
 catch{return {eligibleFixtureIds:[],reasons:['CONTEXT_INVALID'],sha256:hashValue(context)};}
}

export function selectionScenarioGates({record,model,diagnostic,scenario,atUtc,context,selectionReviews,calendar}){
 const reasons=[],now=Date.parse(atUtc),p=diagnostic.provenance;
 if(!context.eligibleFixtureIds.includes(String(record.event.sourceEventId)))reasons.push('CONTEXT_REVIEW_REQUIRED');
 if(!validScenario(scenario))reasons.push('POLICY_SCENARIO_MISSING_OR_INVALID');
 else{
  if(!ageOK(p.forecastGeneratedAtUtc,now,scenario.maxForecastAgeHours*3600000))reasons.push('FORECAST_EXPIRED_OR_FUTURE');
  if(!timestamp(p.freezeCompletedAtUtc)||Date.parse(p.freezeCompletedAtUtc)>Date.parse(record.observedAtUtc))reasons.push('FREEZE_NOT_COMPLETED_BEFORE_QUOTE');
  if(!ageOK(record.observedAtUtc,now,scenario.maxQuoteAgeMinutes*60000))reasons.push('QUOTE_EXPIRED_OR_FUTURE');
  if(now>=Date.parse(record.event.kickoffUtc)-scenario.completionLeadMinutes*60000)reasons.push('COMPLETION_WINDOW_CLOSED');
  if(!calendar||calendar.synthetic!==true||calendar.diagnosticSha256!==diagnostic.canonicalSha256
   ||!ageOK(calendar.officialObservedAtUtc,now,scenario.maxCalendarAgeMinutes*60000)
   ||!ageOK(calendar.providerObservedAtUtc,now,scenario.maxCalendarAgeMinutes*60000)
   ||!ref(calendar.eventsSha256)||calendar.eventsSha256!==hashValue(diagnostic.boardStates.filter((b,i,a)=>a.findIndex(x=>x.event.id===b.event.id)===i).map(b=>b.event)))
   reasons.push('CALENDAR_RECONFIRMATION_REQUIRED');
  const pointEV=record.historicalPrice*model.probability-1,lowerEV=record.historicalPrice*model.interval95[0]-1;
  if(!Number.isFinite(pointEV)||!Number.isFinite(lowerEV))reasons.push('MARGINAL_EV_OVERFLOW');
  else{
   if(pointEV<scenario.minPointEV)reasons.push('POINT_EV_CRITERION_NOT_MET');
   if(lowerEV<scenario.minLowerEV)reasons.push('LOWER_EV_CRITERION_NOT_MET');
  }
  if(model.interval95[1]-model.interval95[0]>scenario.maxIntervalWidth)reasons.push('INTERVAL_WIDTH_CRITERION_NOT_MET');
 }
 if(model.probability<model.interval95[0]||model.probability>model.interval95[1])reasons.push('CENTRAL_OUTSIDE_MARGINAL_INTERVAL_REVIEW_REQUIRED');
 const matches=selectionReviews.filter(r=>r.quoteId===record.quoteId),r=matches.length===1?matches[0]:null;
 if(matches.length>1)reasons.push('DUPLICATE_SELECTION_REVIEW');
 const bound=r?.schema===REVIEW_SCHEMA&&r.synthetic===true&&r.reviewer==='SYNTHETIC_TEST_REVIEWER'
  &&r.diagnosticSha256===diagnostic.canonicalSha256&&r.recordSha256===hashValue(record)&&r.observedPrice===record.historicalPrice
  &&r.evidence==='SYNTHETIC_TEST_VECTOR'&&r.available===true;
 if(!bound||!validScenario(scenario)||!ageOK(r?.reviewedAtUtc,now,scenario.maxQuoteAgeMinutes*60000)
  ||Date.parse(r.reviewedAtUtc)<Date.parse(record.observedAtUtc))reasons.push('SINGLE_PRICE_REVIEW_REQUIRED');
 const rules=r?.rules;
 if(!bound||!rules||rules.period!==record.period||rules.family!==record.family||rules.line!==record.line
  ||rules.regulationTimeIncludingStoppage!==true||rules.extraTimeExcluded!==true||rules.penaltiesExcluded!==true
  ||rules.voidAndPostponementReviewed!==true||!ref(rules.definitionSha256)
  ||!ageOK(rules.reviewedAtUtc,now,GENERAL_POLICY.maxSettlementAgeDays*86400000))reasons.push('SETTLEMENT_REVIEW_REQUIRED');
 if(validScenario(scenario)&&(!timestamp(record.lastChangedAtUtc)||Date.parse(record.lastChangedAtUtc)>Date.parse(record.observedAtUtc)
  ||now-Date.parse(record.lastChangedAtUtc)>scenario.maxChangeAgeHours*3600000&&(!bound||r.oldChangeReviewed!==true)))reasons.push('LAST_CHANGE_REVIEW_REQUIRED');
 return {reasons:[...new Set(reasons)].sort(),reviewSha256:r?hashValue(r):null};
}

export function ticketScenarioGates({legs,ticketReviews,diagnostic,scenario,atUtc,reviewAllowed,budgetExhausted}){
 const ids=legs.map(l=>l.quoteId).sort(),matches=ticketReviews.filter(t=>Array.isArray(t.quoteIds)&&same([...t.quoteIds].sort(),ids));
 const t=matches.length===1?matches[0]:null,reasons=[],clock=Date.parse(atUtc);
 if(matches.length>1)reasons.push('DUPLICATE_TICKET_REVIEW');
 if(budgetExhausted)reasons.push('REVIEW_BUDGET_EXHAUSTED');
 const valid=reviewAllowed&&validScenario(scenario)&&t?.schema===TICKET_SCHEMA&&t.synthetic===true
  &&t.kind==='ordinary_accumulator'&&t.bookmaker==='bet365.it'&&t.available===true&&t.reviewer==='SYNTHETIC_TEST_REVIEWER'
  &&t.evidence==='SYNTHETIC_EXACT_TICKET_OBSERVATION'&&t.diagnosticSha256===diagnostic.canonicalSha256
  &&Array.isArray(t.selectionReviewSha256)&&same([...t.selectionReviewSha256].sort(),legs.map(l=>l.scenarioGates.reviewSha256).sort())
  &&Number.isFinite(t.price)&&t.price>1&&ageOK(t.reviewedAtUtc,clock,scenario.maxQuoteAgeMinutes*60000)
  &&legs.every(l=>timestamp(l.record.observedAtUtc)&&Date.parse(t.reviewedAtUtc)>=Date.parse(l.record.observedAtUtc)
   &&timestamp(l.reviewedAtUtc)&&Date.parse(t.reviewedAtUtc)>=Date.parse(l.reviewedAtUtc));
 if(!valid)reasons.push('EXACT_TICKET_PRICE_REVIEW_REQUIRED');
 return {syntheticTicketPrice:valid?t.price:null,actualTicketPrice:null,reviewSha256:t?hashValue(t):null,reasons};
}
