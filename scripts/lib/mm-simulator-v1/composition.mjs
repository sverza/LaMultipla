import {frechet} from '../shadow/combinations.mjs';
import {validateBoardSnapshot,hashValue,timestamp,isObject,exactFields} from './contracts.mjs';
import {diagnoseProbabilityBoards,PROJECTION_POLICY} from './probabilities.mjs';
import {validScenario,syntheticGateContext,selectionScenarioGates,ticketScenarioGates} from './composition-gates.mjs';
import {reconcileUniverse} from './universe.mjs';

export const COMPOSITION_SCHEMA='lamultipla-mm-synthetic-composition-v2';
const safety=()=>({exploratory:true,operationallyApproved:false,scientificallyValidated:false,statisticallyValidated:false,
 actualStakeEUR:0,eligibleForOriginalSelector:false,appDeliveryAllowed:false,admissible:false});
const blockers=['M3A_SYNTHETIC_ONLY','POLICY_NOT_APPROVED','AUTHENTIC_EVIDENCE_NOT_VERIFIED','M3B_NOT_IMPLEMENTED'];
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const seal=v=>({...v,canonicalSha256:hashValue(v)});
const economicReasons=new Set(['POINT_EV_CRITERION_NOT_MET','LOWER_EV_CRITERION_NOT_MET','INTERVAL_WIDTH_CRITERION_NOT_MET','FRECHET_LOWER_EV_CRITERION_NOT_MET']);
function validateSearch(s){
 if(!exactFields(s,['primaryModel','minLegs','maxLegs','maxCombinations','maxVisitedNodes','order','excludeRepeatedTeams'])
  ||!PROJECTION_POLICY.models.includes(s.primaryModel)||!Number.isSafeInteger(s.minLegs)||s.minLegs<2
  ||!Number.isSafeInteger(s.maxLegs)||s.maxLegs<s.minLegs
  ||!Number.isSafeInteger(s.maxCombinations)||s.maxCombinations<1||!Number.isSafeInteger(s.maxVisitedNodes)||s.maxVisitedNodes<1
  ||typeof s.excludeRepeatedTeams!=='boolean'||!['IDENTITY','MARGINAL_LOWER_EV'].includes(s.order))throw Error('MM3A_EXPLICIT_SEARCH_LIMITS_REQUIRED');
}
const probabilityOK=p=>Number.isFinite(p)&&p>=0&&p<=1;
function modelOK(m){
 const u=m?.uncertainty;
 return isObject(m)&&probabilityOK(m.probability)&&Array.isArray(m.interval95)&&m.interval95.length===2
  &&m.interval95.every(probabilityOK)&&m.interval95[0]<=m.interval95[1]&&m.reasons.length===0
  &&u?.state==='MARGINAL_BOOTSTRAP_DESCRIPTIVE'&&u.simultaneous===false;
}

// Pure and synchronous: no clock reads, filesystem, network, locks or persistence.
// M1/M2 are revalidated against the supplied frozen SYNTHETIC inputs, not trusted
// because their JSON carries a self-computed digest or a positive status string.
export function composeSyntheticExploration(input){
 const base={schema:COMPOSITION_SCHEMA,mode:'SYNTHETIC_OFFLINE_ONLY',...safety(),policyActivated:false,
  admissionBlockers:[...blockers],providerRequests:0};
 let boards,diagnostic,journal,study,search,atUtc,scenario,context,selectionReviews,ticketReviews,calendar;
 try{
  if(!isObject(input))throw Error('MM3A_INPUT_REQUIRED');
  ({boards,diagnostic,journal,study,search,atUtc,scenario=null,context=null,selectionReviews=[],ticketReviews=[],calendar=null}=input);
  if(Object.keys(input).some(k=>!['boards','diagnostic','journal','study','search','atUtc','scenario','context','selectionReviews','ticketReviews','calendar'].includes(k)))throw Error('MM3A_UNSUPPORTED_INPUT_FIELD');
  validateSearch(search);
  if(!timestamp(atUtc)||!Array.isArray(selectionReviews)||!Array.isArray(ticketReviews)
   ||selectionReviews.some(r=>!isObject(r))||ticketReviews.some(r=>!isObject(r)))throw Error('MM3A_CLOCK_OR_REVIEWS_INVALID');
  if(boards?.source?.observationKind!=='SYNTHETIC'||journal?.sourceData!=='synthetic_test'||study?.synthetic!==true
   ||diagnostic?.provenance?.sourceData!=='SYNTHETIC')throw Error('MM3A_AUTHENTIC_OR_ARCHIVED_EXECUTION_FORBIDDEN');
  validateBoardSnapshot(boards);
  const expected=diagnoseProbabilityBoards({boards,journal,study,freezeCompletedAtUtc:diagnostic.provenance.freezeCompletedAtUtc});
  if(hashValue(expected)!==hashValue(diagnostic))throw Error('MM3A_DIAGNOSTIC_INPUT_OR_HASH_MISMATCH');
  if(scenario!==null&&!validScenario(scenario))throw Error('MM3A_POLICY_SCENARIO_INVALID_NOT_ACTIVATED');
 }catch(e){return seal({...base,state:'INPUT_INVALID',reasons:[e.message],combinations:[],exclusions:[]});}
 const source={boardSnapshotSha256:boards.canonicalSha256,diagnosticSha256:diagnostic.canonicalSha256,
  journalSha256:diagnostic.provenance.journalSha256,studySha256:diagnostic.provenance.studySha256,
  modelCodeSha256:diagnostic.provenance.modelCodeSha256,protocolSha256:diagnostic.provenance.protocolSha256,
  provenance:structuredClone(diagnostic.provenance),searchSha256:hashValue(search),
  scenarioSha256:scenario===null?null:hashValue(scenario),evidenceSha256:hashValue({context,selectionReviews,ticketReviews,calendar})};
 const universeCoverage=reconcileUniverse(boards,journal.manifest);
 const contextState=syntheticGateContext(context,journal,atUtc),byBoard=new Map(boards.boards.map(b=>[b.id,b]));
 const candidates=[],exclusions=[],boardExclusions=[];
 const quoteCounts=new Map();for(const b of boards.boards)for(const q of b.outcomes)quoteCounts.set(q.id,(quoteCounts.get(q.id)??0)+1);
 for(const b of boards.boards)if(!b.diagnosticInputReady)boardExclusions.push({boardId:b.id,event:structuredClone(b.event),
  completeness:b.completeness.state,availability:b.availability.state,reasons:[...b.exclusionReasons]});
 for(const record of diagnostic.records){
  const b=byBoard.get(record.boardId),reasons=[...record.exclusions],m=record.models[search.primaryModel];
  if(!b?.observed||b.completeness.state!=='COMPLETE'||b.normalization.state!=='VALID')reasons.push('BOARD_INCOMPLETE_OR_INVALID');
  if(b?.availability.state!=='OPEN'||record.selectionAvailability!=='OPEN')reasons.push('SOURCE_UNAVAILABLE');
  if(quoteCounts.get(record.quoteId)!==1)reasons.push('DUPLICATE_QUOTE_ID');
  if(record.forecastLinkState!=='EXACT_MATCH'||record.frozenEntryStatus!=='prospective'||record.frozenEntryExclusions?.length)reasons.push('FORECAST_NOT_ELIGIBLE');
  if(!modelOK(m))reasons.push('MARGINAL_PROBABILITY_OR_INTERVAL_UNAVAILABLE');
  if(!Number.isFinite(record.historicalPrice)||record.historicalPrice<=1)reasons.push('PRICE_INVALID');
  if(reasons.length){exclusions.push({quoteId:record.quoteId,boardId:record.boardId,event:structuredClone(record.event),reasons:[...new Set(reasons)].sort()});continue;}
  const gates=selectionScenarioGates({record,model:m,diagnostic,scenario,atUtc,context:contextState,selectionReviews,calendar});
  const matching=selectionReviews.filter(r=>r.quoteId===record.quoteId);
  candidates.push({quoteId:record.quoteId,record:structuredClone(record),model:structuredClone(m),scenarioGates:gates,
   reviewedAtUtc:matching.length===1?matching[0].reviewedAtUtc:null,
   marginalArithmetic:{pointEV:record.historicalPrice*m.probability-1,lowerEV:record.historicalPrice*m.interval95[0]-1},...safety()});
 }
 candidates.sort((a,b)=>search.order==='MARGINAL_LOWER_EV'?(b.marginalArithmetic.lowerEV-a.marginalArithmetic.lowerEV
   ||b.marginalArithmetic.pointEV-a.marginalArithmetic.pointEV
   ||cmp(JSON.stringify([a.record.event.id,a.record.boardId,a.record.outcome,a.quoteId]),JSON.stringify([b.record.event.id,b.record.boardId,b.record.outcome,b.quoteId]))):cmp(a.quoteId,b.quoteId));
 const combinations=[],constraintExclusions=[];let examined=0,nodes=0,truncated=false,reviewCount=0;
 function recordCombination(legs){
  if(examined>=search.maxCombinations){truncated=true;return;}examined++;
  const ids=legs.map(l=>l.quoteId),events=legs.map(l=>l.record.event),fixtureIds=events.map(e=>e.id),teams=events.flatMap(e=>[e.home.id,e.away.id]);
  const conflict=[];if(new Set(fixtureIds).size!==legs.length||new Set(events.map(e=>String(e.sourceEventId))).size!==legs.length)conflict.push('SAME_FIXTURE_MULTIPLE_SELECTIONS');
  // Repeated-team exclusion is an explicit draft-policy diagnostic, never an
  // excuse to infer independence when all teams are distinct.
  if(search.excludeRepeatedTeams&&new Set(teams.map(String)).size!==teams.length)conflict.push('REPEATED_TEAM');
  if(conflict.length){constraintExclusions.push({quoteIds:ids,reasons:conflict});return;}
  const p=legs.map(l=>l.model.probability),lo=legs.map(l=>l.model.interval95[0]),hi=legs.map(l=>l.model.interval95[1]);
  const pointBounds=frechet(p),sensitivity=[frechet(lo)[0],frechet(hi)[1]];
  const reasons=[...new Set(legs.flatMap(l=>l.scenarioGates.reasons))];
  const reviewAllowed=validScenario(scenario)&&reviewCount<scenario.maxTicketReviews;
  if(reasons.length===0&&reviewAllowed)reviewCount++;
  // A failed marginal criterion already rules out this combination in the
  // declared scenario; no ticket review is requested to overturn that result.
  const marginallyRejected=reasons.length>0&&reasons.every(r=>economicReasons.has(r));
  const ticket=marginallyRejected?{syntheticTicketPrice:null,reviewSha256:null,reasons:[]}
   :ticketScenarioGates({legs,ticketReviews,diagnostic,scenario,atUtc,reviewAllowed:reasons.length===0&&reviewAllowed,
    budgetExhausted:reasons.length===0&&validScenario(scenario)&&!reviewAllowed});
  reasons.push(...ticket.reasons);
  const ev=ticket.syntheticTicketPrice===null?null:sensitivity.map(v=>ticket.syntheticTicketPrice*v-1);
  if(ev?.some(v=>!Number.isFinite(v)))reasons.push('TICKET_EV_OVERFLOW');
  else if(ev&&validScenario(scenario)&&ev[0]<scenario.minCombinationLowerEV)reasons.push('FRECHET_LOWER_EV_CRITERION_NOT_MET');
  combinations.push({id:hashValue([...ids].sort()),quoteIds:ids,legs:structuredClone(legs),
   jointProbability:null,jointConfidenceInterval:null,jointProbabilityBounds:pointBounds,jointSensitivityEnvelope:sensitivity,
   dependenceMethod:'FRECHET_ARBITRARY_DEPENDENCE',marginalIntervalsSimultaneous:false,
   actualTicketPrice:null,syntheticTicketPrice:ticket.syntheticTicketPrice,ticketReviewSha256:ticket.reviewSha256,
   conditionalSyntheticNetPerUnitBounds:ev?.every(Number.isFinite)?ev:null,
   payoffCondition:'ALL_LEGS_SETTLED_AS_ORDINARY_BINARY_MARKETS; VOID_RISK_NOT_MODELLED',
   state:reasons.length?'EXPLORED_NOT_ADMISSIBLE':'SYNTHETIC_CRITERIA_SATISFIED_NOT_ADMISSIBLE',
   scenarioGateFailures:[...new Set(reasons)].sort(),admissionBlockers:[...blockers],...safety()});
 }
 function walk(size,start,chosen){
  if(truncated)return;
  if(nodes>=search.maxVisitedNodes){truncated=true;return;}nodes++;
  if(chosen.length===size){recordCombination(chosen);return;}
  for(let i=start;i<=candidates.length-(size-chosen.length);i++){
   walk(size,i+1,[...chosen,candidates[i]]);if(truncated)return;
  }
 }
 for(let size=search.minLegs;size<=Math.min(search.maxLegs,candidates.length)&&!truncated;size++)walk(size,0,[]);
 const satisfied=combinations.filter(c=>!c.scenarioGateFailures.length).length;
 const missing=combinations.some(c=>c.scenarioGateFailures.some(r=>!economicReasons.has(r)));
 const state=truncated||!universeCoverage.complete?'ANALYSIS_INCOMPLETE':satisfied?'SYNTHETIC_CRITERIA_SATISFIED_NOT_ADMISSIBLE'
  :missing||!combinations.length&&(exclusions.length||boardExclusions.length)?'ANALYSIS_INCOMPLETE'
   :combinations.length?'NO_COMBINATION_MEETS_SYNTHETIC_CRITERIA_IN_REVIEWED_SCOPE':'MATHEMATICALLY_CALCULABLE_NO_COMBINATION';
 const selectionDiagnostics=diagnostic.records.map(record=>{
  const excluded=exclusions.find(e=>e.quoteId===record.quoteId),candidate=candidates.find(c=>c.quoteId===record.quoteId);
  return {quoteId:record.quoteId,boardId:record.boardId,fixtureId:String(record.event.sourceEventId),
   gateState:excluded?'INPUT_EXCLUDED':candidate?.scenarioGates.reasons.length?
    candidate.scenarioGates.reasons.every(r=>economicReasons.has(r))?'CRITERIA_NOT_MET':'GATES_INCOMPLETE':'SYNTHETIC_GATES_SATISFIED_ONLY',
   inputReasons:[...(excluded?.reasons??[])].sort(),gateReasons:[...(candidate?.scenarioGates.reasons??[])].sort(),
   reasons:[...new Set([...(excluded?.reasons??[]),...(candidate?.scenarioGates.reasons??[])])].sort()};
 }).sort((a,b)=>cmp(a.quoteId,b.quoteId));
 const comparatorDiagnostics=diagnostic.boardStates.map(b=>{
  const entry=journal.entries.find(e=>e.fixtureId===String(b.event.sourceEventId)),p=b.models.bivariate;
  const absent=entry?.forecasts?.bivariate==null;
  const available=!absent&&p.projection?.state==='PROBABILITY_CALCULABLE'&&p.projection?.uncertainty.state==='MARGINAL_BOOTSTRAP_DESCRIPTIVE'&&!p.reasons.length;
  return {boardId:b.boardId,fixtureId:String(b.event.sourceEventId),model:'bivariate-v2',modelIdentity:structuredClone(p.model),state:absent?'ABSENT':available?'AVAILABLE':'INVALID',
   reasons:absent?['COMPARATOR_FORECAST_MISSING']:[...new Set(p.reasons)].sort()};
 }).sort((a,b)=>cmp(a.boardId,b.boardId));
 return seal({...base,state,universeCoverage,selectionDiagnostics,comparatorDiagnostics,
  reasons:[...(truncated?['SEARCH_TRUNCATED']:[]),...(!universeCoverage.complete?['UNIVERSE_COVERAGE_INCOMPLETE']:[]),...(scenario===null?['POLICY_SCENARIO_NOT_PROVIDED']:[]),
  ...(exclusions.length||boardExclusions.length?['INPUT_COVERAGE_EXCLUSIONS_PRESENT']:[])],atUtc,source,search:structuredClone(search),
  scenario:structuredClone(scenario),contextVerification:{sha256:contextState.sha256,reasons:contextState.reasons},
  mathematicalState:combinations.length?'COMBINATIONS_CALCULABLE':candidates.length?'MARGINALS_ONLY':'NO_VERIFIABLE_MARGINALS',
  candidates,exclusions,boardExclusions,constraintExclusions,combinations,
  counts:{inputBoards:boards.boards.length,inputSelections:diagnostic.records.length,mathematicalCandidates:candidates.length,
   examinedCombinations:examined,visitedNodes:nodes,constructedCombinations:combinations.length,syntheticCriteriaSatisfied:satisfied,ticketReviewsConsidered:reviewCount},
  searchTruncated:truncated,negativeConclusionScope:'EXPLICIT_SYNTHETIC_SEARCH_ONLY_NEVER_GLOBAL_NO_BET',
  limitations:['Historical M2 price labels are preserved; no current bookmaker offer is certified',
   'Marginal bootstrap sensitivity is not a simultaneous or joint confidence interval',
   'No point joint probability, no independence assumption, no scientific validation or actual admission',
   'All reviews, clocks and ticket prices in this contract are synthetic test vectors only']});
}
