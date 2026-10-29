import {hashValue} from './contracts.mjs';

const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const PROTOTYPE_POLICY=freeze({schema:'lamultipla-mm-synthetic-prototype-policy-v1',id:'mm-m3b-synthetic-v1',
 status:'REGISTERED_SYNTHETIC_PROTOTYPE_ONLY',executionMode:'SYNTHETIC_ONLY',families:['BTTS','TOTAL_GOALS_2_5'],
 primaryModel:'dc',comparator:'bivariate',comparatorFallback:false,minLegs:2,maxLegs:4,onePerFixture:true,excludeRepeatedTeams:true,
 maxCombinations:20000,maxVisitedNodes:100000,maxTicketReviews:10,minPointEV:.05,minLowerEV:.02,maxIntervalWidth:.25,
 intervalWidthQuantity:'UPPER_MINUS_LOWER_DC_MARGINAL_PROBABILITY',centralOutsideInterval:'EXCLUDE',minCombinationLowerEV:.05,
 absoluteProbabilityThreshold:null,reviewOrder:'LEG_COUNT_THEN_LEXICOGRAPHIC_QUOTE_IDS',
 ranking:'VERIFIED_COMBINED_LOWER_EV_DESC_THEN_COMBINATION_ID_ASC',pointJointEV:null,
 maxForecastAgeHours:24,maxQuoteAgeMinutes:30,maxCalendarAgeMinutes:60,maxChangeAgeHours:24,completionLeadMinutes:150,
 requireExistingProgressiveSlot:true,uncertainty:'MARGINAL_NOT_SIMULTANEOUS',jointProbability:null,jointConfidenceInterval:null,
 policyActivation:'NO_AUTHENTIC_ACTIVATION',operationallyApproved:false,scientificallyValidated:false,actualStakeEUR:0});
export const PROTOTYPE_POLICY_SHA256=hashValue(PROTOTYPE_POLICY);
export function assertPrototypePolicy(policy){
 if(hashValue(policy)!==PROTOTYPE_POLICY_SHA256)throw Error('MM3B_POLICY_UNRECOGNIZED');
}
