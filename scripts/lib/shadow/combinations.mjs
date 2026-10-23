import {fingerprint} from '../odds-report.mjs';
import {POLICY,rankValue} from './policy.mjs';
import {canonicalTeam} from '../goals/data.mjs';

export function frechet(probabilities) {
  if(!Array.isArray(probabilities)||!probabilities.length||probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw new Error('Invalid marginal probabilities');
  return [Math.max(0,probabilities.reduce((a,b)=>a+b,0)-(probabilities.length-1)),Math.min(...probabilities)];
}
const sorted=a=>[...a].sort();
function actualCombinedPrice(evidence,legs,reportHash,clock) {
  if(!evidence||evidence.schema!=='lamultipla-accumulator-price-verification-v1'||evidence.domain!=='bet365.it'
    ||evidence.origin!=='manual_bet365_it'||evidence.reportSha256!==reportHash||evidence.kind!=='ordinary_accumulator'||evidence.availability!=='available'
    ||!Array.isArray(evidence.quoteIds)||new Set(evidence.quoteIds).size!==legs.length||fingerprint(sorted(evidence.quoteIds))!==fingerprint(sorted(legs.map(l=>l.quoteId)))
    ||!Number.isFinite(evidence.price)||evidence.price<=1||typeof evidence.reviewer!=='string'||!evidence.reviewer.trim()||typeof evidence.evidence!=='string'||!evidence.evidence.trim())return null;
  const at=Date.parse(evidence.verifiedAtUtc);
  if(typeof evidence.verifiedAtUtc!=='string'||!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(evidence.verifiedAtUtc)
    ||!Number.isFinite(at)||at>clock||clock-at>POLICY.maxQuoteAgeMinutes*60000||legs.some(l=>at<Date.parse(l.observedAtUtc)||at>=Date.parse(l.kickoffUtc)
    ||l.availability.verification?.schema!=='lamultipla-bet365-verification-v2'||!l.availability.verified
    ||at<Date.parse(l.availability.verification.verifiedAtUtc)||clock-Date.parse(l.availability.verification.verifiedAtUtc)>POLICY.maxQuoteAgeMinutes*60000))return null;
  return evidence.price;
}
export function selectCombination(opportunities,{maxLegs=4,combinedPrices=[],now=new Date()}={}) {
  const clock=new Date(now).getTime();
  if(!Number.isFinite(clock)||![2,3,4,5,6].includes(maxLegs))throw new Error('Max legs must be 2..6; valid clock required');
  const age=clock-Date.parse(opportunities.screenedAtUtc);
  if(!Number.isFinite(age)||age<0||age>60000)throw new Error('Opportunity screen expired; recalculate against current inputs');
  const legs=[...opportunities.candidates].sort(rankValue),combinations=[];let explored=0,truncated=false;
  function record(selection) {
    if(explored>=POLICY.maxCombinations){truncated=true;return;}explored++;
    const p=selection.map(l=>l.value.probability),lower=selection.map(l=>l.value.interval[0]),upper=selection.map(l=>l.value.interval[1]);
    const pointBounds=frechet(p),sensitivity=[frechet(lower)[0],frechet(upper)[1]],nominalOddsProduct=selection.reduce((s,l)=>s*l.price,1);
    const matching=combinedPrices.filter(v=>Array.isArray(v.quoteIds)&&fingerprint(sorted(v.quoteIds))===fingerprint(sorted(selection.map(l=>l.quoteId))));
    const actualPrice=matching.length===1?actualCombinedPrice(matching[0],selection,opportunities.reportSha256,clock):null;
    const reasons=[];if(!Number.isFinite(nominalOddsProduct))reasons.push('nominal_price_product_overflow');
    if(actualPrice===null)reasons.push('actual_combination_price_and_playability_not_verified');
    const expectedNetPerUnitBounds=actualPrice===null?null:sensitivity.map(p=>actualPrice*p-1);
    if(expectedNetPerUnitBounds&&expectedNetPerUnitBounds[0]<POLICY.minCombinationLowerEV)reasons.push('joint_value_not_supported_by_dependence_bounds');
    combinations.push({id:fingerprint(selection.map(l=>l.quoteId).sort()),quoteIds:selection.map(l=>l.quoteId),
      selections:selection.map(l=>({quoteId:l.quoteId,fixtureId:l.fixtureId,fixture:l.fixture,outcome:l.outcome,price:l.price,entrySha256:l.entrySha256})),
      legs:selection.length,jointProbability:null,jointProbabilityBounds:pointBounds,jointSensitivityEnvelope:sensitivity,
      dependenceMethod:'frechet_arbitrary_dependence',jointConfidenceInterval:null,statisticallyValidated:false,
      nominalOddsProduct:Number.isFinite(nominalOddsProduct)?nominalOddsProduct:null,nominalPriceIsNotBookmakerOffer:true,actualPrice,actualPriceVerification:actualPrice===null?null:matching[0],
      expectedNetPerUnitBounds,nominalPriceEVSensitivity:Number.isFinite(nominalOddsProduct)?sensitivity.map(p=>nominalOddsProduct*p-1):null,
      nominalStakeEUR:POLICY.maxStakeEUR,actualStakeEUR:0,expectedNetEURBounds:expectedNetPerUnitBounds?.map(v=>v*POLICY.maxStakeEUR)??null,
      shadowEligible:reasons.length===0,reasons,limitation:'Bounds conditional on uncertain marginal estimates; no validated joint forecast'});
  }
  function walk(start,chosen,fixtures,teams) {
    if(chosen.length>=POLICY.minLegs)record(chosen);
    if(chosen.length>=maxLegs||truncated)return;
    for(let i=start;i<legs.length;i++) {
      const leg=legs[i],canonical=leg.fixture.map(canonicalTeam);if(fixtures.has(leg.fixtureId)||canonical.some(t=>teams.has(t)))continue;
      walk(i+1,[...chosen,leg],new Set([...fixtures,leg.fixtureId]),new Set([...teams,...canonical]));
      if(truncated)return;
    }
  }
  walk(0,[],new Set(),new Set());
  const proposals=combinations.filter(c=>c.shadowEligible).sort((a,b)=>b.expectedNetPerUnitBounds[0]-a.expectedNetPerUnitBounds[0]||a.legs-b.legs||a.id.localeCompare(b.id));
  const selected=truncated?null:proposals[0]??null;
  const cause=selected?null:truncated?'SEARCH_BUDGET_EXCEEDED':!legs.length?opportunities.state:legs.length<2?'NOT_ENOUGH_DISTINCT_OPPORTUNITIES':
    !combinations.length?'DEPENDENT_OR_REPEATED_EVENTS':combinations.every(c=>c.actualPrice===null)?'COMBINATION_EVIDENCE_INSUFFICIENT':'JOINT_VALUE_NOT_DEMONSTRATED';
  return {schema:'lamultipla-shadow-selector-v1',decision:selected?'SHADOW_BOUND_PROPOSAL':'NO_BET',cause,selected,
    counts:{candidates:legs.length,combinations:explored,shadowEligible:proposals.length},truncated,maxLegs,
    combinations:combinations.sort((a,b)=>(b.nominalPriceEVSensitivity?.[0]??-Infinity)-(a.nominalPriceEVSensitivity?.[0]??-Infinity)||a.id.localeCompare(b.id)),
    operationallyApproved:false,actualStakeEUR:0,maxNominalStakeEUR:POLICY.maxStakeEUR,maxSlipsPerMatchday:1};
}
