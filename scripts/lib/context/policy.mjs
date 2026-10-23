export const CONTEXT_POLICY=Object.freeze({version:'match-context-v1',formWindows:[5,10],splitWindow:5,formMaxAgeDays:365,minFormMatches:3,maxDatasetObservationAgeHours:72,
  requiredCategories:['calendar','injuries','suspensions','lineups'],maxAgeHours:{calendar:24,injuries:24,suspensions:168,lineups:24,turnover:24,coach:168,other:24},
  confirmedLineupAgeHours:2,shortKickoffGapHours:72,calendarBeforeDays:14,calendarAfterDays:7,probabilityAdjustment:false,
  operationallyApproved:false,publicationAllowed:false});
export const finiteTime=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
