import {POLICY,valueMetrics,classifyValue} from '../shadow/policy.mjs';
import {selectCombination,frechet} from '../shadow/combinations.mjs';
const histogram=rows=>Object.fromEntries([...new Set(rows.flatMap(r=>r.reasons??[]))].map(k=>[k,rows.filter(r=>r.reasons?.includes(k)).length]));
export function selectorFunnel(decision){
  if(decision?.schema!=='lamultipla-shadow-decision-v1')throw new Error('DIAGNOSTIC_SHADOW_DECISION_REQUIRED');
  return {schema:'lamultipla-selector-funnel-diagnostic-v1',sourceDecisionId:decision.id,observedAtUtc:decision.generatedAtUtc,
    counts:{...decision.opportunities.counts,completeBoards:decision.opportunities.baselines.filter(b=>b.status==='COMPLETE').length,
      rawEVCandidates:decision.opportunities.candidates.length,contextReadyFixtures:decision.contextGate.eligibleFixtureIds.length,
      contextReadyCandidates:decision.contextGate.contextReadyCandidates,selectionReady:decision.selectionGate.eligibleQuoteIds.length,
      combinations:decision.selector.counts.combinations,boundEligibleCombinations:decision.selector.counts.shadowEligible},
    priceAndForecastExclusions:histogram(decision.opportunities.screening),contextExclusions:histogram(decision.contextGate.entries??[]),
    manualReviewExclusions:histogram(decision.selectionGate.entries),combinationExclusions:histogram(decision.selector.combinations),
    shadowDecision:decision.selector.decision,shadowCause:decision.noBetCause,operationalDecision:decision.governance.operational,
    operationalBlockDoesNotVetoShadowSelection:true,empiricalFrequencyEstimated:false,
    limitation:'Counts overlap; this is an audit of one recorded attempt, not a rate estimate or a new decision'};
}
export function jointRequirements(lowerProbabilities,actualPrice=null){
  const lower=frechet(lowerProbabilities)[0];
  return {legs:lowerProbabilities.length,lowerProbabilities,frechetLower:lower,
    minimumActualPriceForLowerEV:lower>0?(1+POLICY.minCombinationLowerEV)/lower:null,
    actualPrice,lowerEV:actualPrice==null?null:actualPrice*lower-1,
    structurallyImpossibleUnderTheseMarginals:lower===0,
    productOfSinglePricesUsedAsOffer:false,pointJointProbability:null};
}
export function controlledSelectorScenarios(){
  const now='2026-10-16T13:00:00.000Z',hash='a'.repeat(64);
  function run(name,p,lower,price,n,actualPrice){
    const candidates=Array.from({length:n},(_,i)=>({quoteId:'SYNTHETIC-'+i,fixtureId:'SYNTHETIC-FIXTURE-'+i,fixture:['SYNTHETIC-HOME-'+i,'SYNTHETIC-AWAY-'+i],outcome:'1',price,
      observedAtUtc:now,availability:{verified:true,verification:{schema:'lamultipla-bet365-verification-v2',verifiedAtUtc:now}},
      value:valueMetrics(price,p,[lower,Math.min(1,p+.02)]),classification:classifyValue(valueMetrics(price,p,[lower,Math.min(1,p+.02)]))}))
      .filter(c=>c.classification==='SHADOW_CANDIDATE');
    const combinedPrices=actualPrice==null?[]:[{schema:'lamultipla-accumulator-price-verification-v1',domain:'bet365.it',origin:'manual_bet365_it',kind:'ordinary_accumulator',
      availability:'available',reportSha256:hash,quoteIds:candidates.map(c=>c.quoteId),price:actualPrice,verifiedAtUtc:now,reviewer:'SYNTHETIC',evidence:'SYNTHETIC CONTROLLED TEST ONLY'}];
    const result=selectCombination({screenedAtUtc:now,reportSha256:hash,candidates,state:'NO_VALUE'},{combinedPrices,now});
    return {name,synthetic:true,inputs:{p,lower,price,n,actualPrice},singleClassification:classifyValue(valueMetrics(price,p,[lower,Math.min(1,p+.02)])),
      candidates:candidates.length,selectorDecision:result.decision,cause:result.cause,joint:jointRequirements(Array(n).fill(lower),actualPrice),actualStakeEUR:0};
  }
  return {schema:'lamultipla-selector-controlled-audit-v1',sourceData:'synthetic_test',policy:POLICY,
    scenarios:[run('Two admissible singles, missing combined ticket',.75,.70,1.5,2,null),
      run('Two admissible singles but Frechet rejects the exact synthetic ticket',.75,.70,1.5,2,2.25),
      run('Positive single EV and lower EV but zero joint lower bound',.52,.48,2.2,2,4.8),
      run('Three moderate marginal lower bounds cannot support a joint',.65,.60,1.8,3,5.5),
      run('One candidate cannot form an accumulator',.95,.94,1.2,1,null),
      run('Point EV positive but lower interval fails',.55,.48,2,2,4),
      run('Existing selector can produce a shadow proposal',.95,.94,1.2,2,1.4)],
    empiricalProposalRate:null,operationallyApproved:false,actualStakeEUR:0,
    limitation:'Synthetic prices are explicitly supplied ticket evidence, never inferred from a product; these examples prove mathematical feasibility, not realistic market frequency'};
}
