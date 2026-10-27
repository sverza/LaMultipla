import {hashValue,timestamp,exactFields} from './contracts.mjs';
import {composeSyntheticExploration} from './composition.mjs';
import {SCENARIO_SCHEMA,ticketScenarioGates} from './composition-gates.mjs';
import {PROTOTYPE_POLICY,assertPrototypePolicy} from './prototype-policy.mjs';
import {timing} from '../orchestration/progressive-policy.mjs';
import {frechet} from '../shadow/combinations.mjs';

export const PROTOTYPE_INPUT_SCHEMA='lamultipla-mm-synthetic-prototype-input-v1';
export const prototypeSafety=()=>({synthetic:true,exploratory:true,operationallyApproved:false,scientificallyValidated:false,
 actualStakeEUR:0,authenticExecutionAllowed:false,appDeliveryAllowed:false,eligibleForOriginalSelector:false});
export function scenarioFromPrototype(p=PROTOTYPE_POLICY){
 return {schema:SCENARIO_SCHEMA,synthetic:true,approvalState:'NOT_APPROVED',minPointEV:p.minPointEV,minLowerEV:p.minLowerEV,
  maxIntervalWidth:p.maxIntervalWidth,minCombinationLowerEV:p.minCombinationLowerEV,maxForecastAgeHours:p.maxForecastAgeHours,
  maxQuoteAgeMinutes:p.maxQuoteAgeMinutes,maxCalendarAgeMinutes:p.maxCalendarAgeMinutes,maxChangeAgeHours:p.maxChangeAgeHours,
  completionLeadMinutes:p.completionLeadMinutes,maxTicketReviews:p.maxTicketReviews};
}
export function discoverPrototype(input,atUtc,policy=PROTOTYPE_POLICY){
 assertPrototypePolicy(policy);
 if(!exactFields(input,['schema','synthetic','policyRegisteredInSimulationAtUtc','data'])||input.schema!==PROTOTYPE_INPUT_SCHEMA
  ||input.synthetic!==true||!timestamp(input.policyRegisteredInSimulationAtUtc)||!timestamp(atUtc)
  ||!timestamp(input.data?.atUtc)||Date.parse(atUtc)<Date.parse(input.data.atUtc)
  ||Object.hasOwn(input.data,'search')||Object.hasOwn(input.data,'scenario'))throw Error('MM3B_SYNTHETIC_INPUT_INVALID');
 const scenario=scenarioFromPrototype(policy),search={primaryModel:policy.primaryModel,minLegs:policy.minLegs,maxLegs:policy.maxLegs,
  maxCombinations:policy.maxCombinations,maxVisitedNodes:policy.maxVisitedNodes,order:'IDENTITY',excludeRepeatedTeams:true};
 // Discovery performs NO ticket reviews. It reuses the M3-A identity, marginal,
 // context and Frechet mathematics; that contract is never activated or changed.
 const checked=composeSyntheticExploration({...input.data,atUtc,search:{...search,maxCombinations:1},scenario:{...scenario,maxTicketReviews:0},ticketReviews:[]});
 if(checked.state==='INPUT_INVALID')throw Error('MM3B_INPUT_INVALID:'+checked.reasons.join(','));
 if(Date.parse(input.policyRegisteredInSimulationAtUtc)>Date.parse(input.data.boards.source.observedAtUtc))throw Error('MM3B_POLICY_TIMELINE_INVALID');
 const t=timing({...input.data.journal.manifest,schema:'lamultipla-prospective-schedule-v1'},atUtc);
 if(!t.active)throw Error('MM3B_SIMULATION_WINDOW_CLOSED');
 // M3-A verifies all marginal candidates before enumeration. Its single preview
 // combination is discarded. The prototype's own bounded enumeration stores
 // leg references, avoiding thousands of copies of the same M1/M2 provenance.
 const combinations=[],constraintExclusions=[];let examined=0,nodes=0,truncated=false;
 const legs=checked.candidates;
 function record(chosen){
  if(examined>=search.maxCombinations){truncated=true;return;}examined++;
  const ids=chosen.map(l=>l.quoteId),events=chosen.map(l=>l.record.event),reasons=[];
  if(new Set(events.map(e=>e.id)).size!==chosen.length||new Set(events.map(e=>String(e.sourceEventId))).size!==chosen.length)reasons.push('SAME_FIXTURE_MULTIPLE_SELECTIONS');
  if(new Set(events.flatMap(e=>[String(e.home.id),String(e.away.id)])).size!==2*chosen.length)reasons.push('REPEATED_TEAM');
  if(reasons.length){constraintExclusions.push({quoteIds:ids,reasons});return;}
  combinations.push({id:hashValue([...ids].sort()),quoteIds:ids,legs:[...chosen],
   jointProbabilityBounds:frechet(chosen.map(l=>l.model.probability)),
   jointSensitivityEnvelope:[frechet(chosen.map(l=>l.model.interval95[0]))[0],frechet(chosen.map(l=>l.model.interval95[1]))[1]]});
 }
 function walk(size,start,chosen){
  if(truncated)return;if(nodes>=search.maxVisitedNodes){truncated=true;return;}nodes++;
  if(chosen.length===size){record(chosen);return;}
  for(let i=start;i<=legs.length-(size-chosen.length);i++){walk(size,i+1,[...chosen,legs[i]]);if(truncated)return;}
 }
 for(let size=search.minLegs;size<=Math.min(search.maxLegs,legs.length)&&!truncated;size++)walk(size,0,[]);
 const compact=combinations.map(({legs,...c})=>{void legs;return c;});
 const discovery={source:checked.source,search,candidates:legs,combinations,exclusions:checked.exclusions,boardExclusions:checked.boardExclusions,
  universeCoverage:checked.universeCoverage,selectionDiagnostics:checked.selectionDiagnostics,comparatorDiagnostics:checked.comparatorDiagnostics,
  constraintExclusions,searchTruncated:truncated,counts:{inputBoards:checked.counts.inputBoards,inputSelections:checked.counts.inputSelections,
   mathematicalCandidates:legs.length,examinedCombinations:examined,visitedNodes:nodes,constructedCombinations:combinations.length},
  canonicalSha256:hashValue({verification:checked.canonicalSha256,search,compact,constraintExclusions,examined,nodes,truncated})};
 const candidates=combinations.filter(c=>c.legs.every(l=>l.scenarioGates.reasons.length===0));
 return {discovery,candidates,scenario,atUtc};
}
export function checkPrototypeTicket(analysis,input,combinationId,atUtc){
 const c=analysis.candidates.find(c=>c.id===combinationId);if(!c)throw Error('MM3B_REVIEW_OUTSIDE_CANDIDATE_SCOPE');
 const review=ticketScenarioGates({legs:c.legs,ticketReviews:input.data.ticketReviews??[],diagnostic:input.data.diagnostic,
  scenario:analysis.scenario,atUtc,reviewAllowed:true,budgetExhausted:false});
 const ev=review.syntheticTicketPrice===null?null:c.jointSensitivityEnvelope.map(p=>review.syntheticTicketPrice*p-1);
 return {schema:'lamultipla-mm-synthetic-ticket-result-v1',combinationId,verifiedAtSimulationUtc:atUtc,
  quoteIds:[...c.quoteIds],ticketReviewSha256:review.reviewSha256,syntheticTicketPrice:review.syntheticTicketPrice,
  actualTicketPrice:null,jointProbability:null,jointConfidenceInterval:null,
  jointProbabilityBounds:[...c.jointProbabilityBounds],jointSensitivityEnvelope:[...c.jointSensitivityEnvelope],
  conditionalSyntheticNetPerUnitBounds:ev,reasons:[...review.reasons],...prototypeSafety()};
}
export function summarizePrototype(input,analysis,results,policy=PROTOTYPE_POLICY){
 assertPrototypePolicy(policy);
 const d=analysis.discovery,expected=analysis.candidates.slice(0,policy.maxTicketReviews);
 if(results.length!==expected.length||results.some((r,i)=>r.combinationId!==expected[i].id
  ||hashValue(r)!==hashValue(checkPrototypeTicket(analysis,input,expected[i].id,r.verifiedAtSimulationUtc))))throw Error('MM3B_REVIEW_RESULTS_INVALID');
 const current=results.map(r=>checkPrototypeTicket(analysis,input,r.combinationId,analysis.atUtc));
 const unverified=current.filter(r=>r.reasons.length||r.syntheticTicketPrice===null);
 const ranked=current.filter(r=>!r.reasons.length&&r.conditionalSyntheticNetPerUnitBounds?.every(Number.isFinite))
  .sort((a,b)=>b.conditionalSyntheticNetPerUnitBounds[0]-a.conditionalSyntheticNetPerUnitBounds[0]||(a.combinationId<b.combinationId?-1:a.combinationId>b.combinationId?1:0));
 const economic=new Set(['POINT_EV_CRITERION_NOT_MET','LOWER_EV_CRITERION_NOT_MET','INTERVAL_WIDTH_CRITERION_NOT_MET']);
 const marginalGaps=d.candidates.filter(c=>c.scenarioGates.reasons.some(r=>!economic.has(r)));
 const coverageGaps=input.data.diagnostic.boardStates.filter(b=>b.completeness.state!=='COMPLETE'||b.normalization.state!=='VALID'
  ||b.boardAvailability==='UNKNOWN'||b.forecastLinkState!=='EXACT_MATCH'||b.frozenEntryStatus!=='prospective'
  ||b.models.dc.projection?.uncertainty.state!=='MARGINAL_BOOTSTRAP_DESCRIPTIVE');
 const reasons=[...(!d.universeCoverage.complete?['UNIVERSE_COVERAGE_INCOMPLETE']:[]),...(d.searchTruncated?['SEARCH_TRUNCATED']:[]),...(analysis.candidates.length>policy.maxTicketReviews?['REVIEW_BUDGET_EXHAUSTED']:[]),
  ...(unverified.length?['TICKET_REVIEWS_INCOMPLETE']:[]),...(marginalGaps.length?['MARGINAL_REVIEWS_INCOMPLETE']:[]),...(coverageGaps.length?['INPUT_COVERAGE_INCOMPLETE']:[])];
 const selected=reasons.length?null:ranked.find(r=>r.conditionalSyntheticNetPerUnitBounds[0]>=policy.minCombinationLowerEV)??null;
 const state=reasons.length?'ANALYSIS_INCOMPLETE':selected?'SYNTHETIC_EXPLORATORY_SIMULATION_RECORDED'
  :analysis.candidates.length?'NO_COMBINATION_IN_REVIEWED_SYNTHETIC_SCOPE':'NO_SYNTHETIC_COMBINATION_AVAILABLE';
 return {schema:'lamultipla-mm-synthetic-prototype-decision-v2',state,reasons:[...new Set(reasons)].sort(),atSimulationUtc:analysis.atUtc,
  policySha256:hashValue(policy),inputSha256:hashValue(input),discoverySha256:d.canonicalSha256,
  source:structuredClone(d.source),search:structuredClone(d.search),counts:{...d.counts,ticketCandidates:analysis.candidates.length,
   reviewSlots:results.length,verifiedTickets:ranked.length,unverifiedTickets:unverified.length,coverageGaps:coverageGaps.length+d.universeCoverage.gapCount},
  universeCoverage:structuredClone(d.universeCoverage),boardCoverage:{receivedBoards:input.data.boards.boards.length,
   completeBoards:input.data.boards.boards.filter(b=>b.completeness.state==='COMPLETE').length,
   incompleteBoards:input.data.boards.boards.filter(b=>b.completeness.state!=='COMPLETE').length,
   validBoards:input.data.boards.boards.filter(b=>b.normalization.state==='VALID').length,invalidBoards:input.data.boards.boards.filter(b=>b.normalization.state!=='VALID').length},
  boardAvailability:{openBoards:input.data.boards.boards.filter(b=>b.availability.state==='OPEN').length,
   closedBoards:input.data.boards.boards.filter(b=>b.availability.state==='CLOSED').length,unknownBoards:input.data.boards.boards.filter(b=>b.availability.state==='UNKNOWN').length},
  selectionDiagnostics:structuredClone(d.selectionDiagnostics),comparatorDiagnostics:structuredClone(d.comparatorDiagnostics),
  futureAdmission:{state:'NOT_AUTHORIZED',reason:'SYNTHETIC_ONLY_NO_PROSPECTIVE_POLICY'},
  reviewOrder:expected.map(c=>c.id),reviewResultSha256:results.map(hashValue),verifiedRanking:ranked,
  selected,bestVerifiedInReviewedScope:ranked[0]??null,exploratoryPolicyEligible:Boolean(selected),
  globalNoBet:false,scope:'SYNTHETIC_OBSERVED_UNIVERSE_ONLY',marginalIntervalsSimultaneous:false,
  jointProbability:null,jointConfidenceInterval:null,exclusions:[...d.exclusions.map(e=>({...structuredClone(e),stage:'INPUT'})),
   ...d.selectionDiagnostics.filter(e=>e.gateReasons.length).map(e=>({quoteId:e.quoteId,boardId:e.boardId,fixtureId:e.fixtureId,stage:'SYNTHETIC_GATES',reasons:[...e.gateReasons]}))]
    .sort((a,b)=>a.quoteId<b.quoteId?-1:a.quoteId>b.quoteId?1:a.stage<b.stage?-1:a.stage>b.stage?1:0),
  boardExclusions:structuredClone(d.boardExclusions),
  constraintExclusions:structuredClone(d.constraintExclusions),...prototypeSafety()};
}
