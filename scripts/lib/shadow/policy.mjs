// Fixed before implementation/testing. Heuristics under prospective evaluation, not proven profit.
export const POLICY = Object.freeze({version:'shadow-value-v1',registeredAtUtc:'2026-10-10T06:37:16Z',
  market:'1x2-fulltime',minPointEV:.05,minLowerEV:.02,maxIntervalWidth:.25,minReplicates:40,maxFailureRate:.1,
  maxQuoteAgeMinutes:30,maxForecastAgeHours:24,maxForecastQuoteLagMinutes:30,maxChangeAgeHours:24,
  freezeBufferMinutes:5,minLegs:2,normalMaxLegs:4,maxLegs:6,maxCombinations:20000,minCombinationLowerEV:.05,
  maxStakeEUR:3,maxSlipsPerMatchday:1,actualStakeEUR:0,operationallyApproved:false});
export function valueMetrics(price,probability,interval) {
  if(!Number.isFinite(price)||price<=1||!Number.isFinite(probability)||probability<0||probability>1
    ||!Array.isArray(interval)||interval.length!==2||interval.some(v=>!Number.isFinite(v)||v<0||v>1)||interval[0]>interval[1])return null;
  return {probability,interval,pointEV:price*probability-1,lowerEV:price*interval[0]-1,upperEV:price*interval[1]-1,
    breakEvenProbability:1/price,intervalWidth:interval[1]-interval[0]};
}
export function classifyValue(value) {
  if(!value)return 'INSUFFICIENT_DATA';
  if(value.pointEV<=0)return 'NO_VALUE';
  if(value.pointEV<POLICY.minPointEV||value.lowerEV<POLICY.minLowerEV||value.intervalWidth>POLICY.maxIntervalWidth)return 'UNCERTAIN_VALUE';
  return 'SHADOW_CANDIDATE';
}
export const rankValue=(a,b)=>b.value.lowerEV-a.value.lowerEV||b.value.pointEV-a.value.pointEV||a.fixtureId.localeCompare(b.fixtureId)||a.outcome.localeCompare(b.outcome);
