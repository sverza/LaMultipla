import {canonicalTeam,trainingBefore} from './goals/data.mjs';
import {digest} from './prospective/store.mjs';
import {PROGRESSIVE_POLICY} from './orchestration/progressive-policy.mjs';
import {validateCurrentDataset} from './shadow/registry.mjs';
const wall=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function romeInstant(date,time){
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('ROUND_WALL_TIME_INVALID');
 const candidates=[0,1,2,3].map(h=>new Date(Date.parse(date+'T'+time+':00Z')-h*3600000)).filter(at=>{
  const p=Object.fromEntries(wall.formatToParts(at).map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}`===date&&`${p.hour}:${p.minute}`===time;
 });
 if(candidates.length!==1)throw Error('ROUND_WALL_TIME_AMBIGUOUS_OR_NONEXISTENT');return candidates[0].toISOString();
}
export function prepareRoundDraft({publicData,source,season,matchday,providerFixtures=[],providerObservedAtUtc=null,now=new Date()}){
 const at=new Date(now).getTime();
 if(!Number.isFinite(at)||publicData?.name!==`Italian Serie A ${season}`||!Array.isArray(publicData.matches)
  ||!source||!/^[a-f0-9]{64}$/.test(source.rawSha256)||digest(publicData)!==source.parsedSha256||!Number.isFinite(Date.parse(source.acquiredAtUtc))||Date.parse(source.acquiredAtUtc)>at
  ||!Number.isInteger(matchday)||matchday<1||matchday>38||!Array.isArray(providerFixtures))throw Error('ROUND_DRAFT_SOURCE_INVALID');
 const matches=publicData.matches.filter(m=>m.round===`Matchday ${matchday}`);
 if(matches.length!==10||new Set(matches.flatMap(m=>[canonicalTeam(m.team1),canonicalTeam(m.team2)])).size!==20)throw Error('ROUND_DRAFT_NOT_TEN_DISTINCT_FIXTURES');
 const entries=matches.map(m=>{
  if(m.score!=null)throw Error('ROUND_DRAFT_ALREADY_SCORED');const home=canonicalTeam(m.team1),away=canonicalTeam(m.team2),kickoffUtc=romeInstant(m.date,m.time);
  const found=providerFixtures.filter(f=>canonicalTeam(f.participant1Name)===home&&canonicalTeam(f.participant2Name)===away&&new Date(f.startTime).toISOString()===kickoffUtc);
  const valid=found.length===1&&/^id\d+$/.test(found[0].fixtureId)&&found[0].sportId===10&&found[0].tournamentId===23&&found[0].statusId===0;
  return {fixtureId:valid?found[0].fixtureId:null,home,away,kickoffUtc,providerState:valid?'HISTORICAL_ID_CANDIDATE_RECONFIRM_REQUIRED':found.length?'AMBIGUOUS_OR_UNSUPPORTED':'MISSING'};
 }).sort((a,b)=>a.kickoffUtc.localeCompare(b.kickoffUtc)||a.home.localeCompare(b.home));
 const first=entries[0].kickoffUtc;
 const ids=entries.map(e=>e.fixtureId).filter(Boolean);if(new Set(ids).size!==ids.length)throw Error('ROUND_DRAFT_DUPLICATE_PROVIDER_ID');
 return {schema:'lamultipla-round-preparation-draft-v1',generatedAtUtc:new Date(at).toISOString(),season,matchday,events:entries,publicSource:source,
  providerObservedAtUtc,providerIdsPresent:ids.length,officialConfirmation:null,
  firstKickoffUtc:first,lastKickoffUtc:entries.at(-1).kickoffUtc,
  originalWindow:{opensAtUtc:new Date(Date.parse(first)-PROGRESSIVE_POLICY.openBeforeMinutes*60000).toISOString(),closesAtUtc:new Date(Date.parse(first)-PROGRESSIVE_POLICY.analysisLeadMinutes*60000).toISOString(),closingExclusive:true},
  blockers:[...(ids.length===10?[]:['PROVIDER_IDS_INCOMPLETE']),'FRESH_PROVIDER_AND_OFFICIAL_RECONFIRMATION_REQUIRED','COHORT_APPROVAL_REQUIRED','FREEZE_AUTHORIZATION_REQUIRED'],
  executableSchedule:false,forecastProduced:false,actualStakeEUR:0};
}
export function assessReferenceData(dataset,draft,{now=new Date()}={}){
 const clock=new Date(now).getTime();validateCurrentDataset(dataset,now);const cutoff=draft.firstKickoffUtc.slice(0,7)+'-01T00:00:00.000Z',train=trainingBefore(dataset.rows,cutoff);
 const histories=draft.events.map(e=>({home:e.home,away:e.away,homeN:train.filter(r=>r.home===e.home||r.away===e.home).length,awayN:train.filter(r=>r.home===e.away||r.away===e.away).length}));
 const counts={};for(const row of dataset.rows)counts[row.season]=(counts[row.season]??0)+1;
 return {schema:'lamultipla-reference-data-readiness-v1',datasetSha256:digest(dataset),cutoffUtc:cutoff,trainingRows:train.length,seasonCounts:counts,
  history:histories,historySufficient:histories.every(t=>t.homeN>=20&&t.awayN>=20),datasetObservationFresh:clock-Date.parse(dataset.acquiredAtUtc)<=72*3600000,
  sourceCoverageWarnings:Object.entries(counts).filter(([season,n])=>season!==draft.season.replace('/','-')&&n!==380).map(([season,n])=>({season,n,reason:'NOT_380_OBSERVED_RESULTS_NO_IMPUTATION'})),
  targetLeakageDetected:train.some(r=>draft.events.some(e=>r.season===draft.season.replace('/','-')&&r.home===e.home&&r.away===e.away)),fitExecuted:false};
}
export function draftReferenceCohort(draft,{studyV1Sha256,studyV2Sha256,now=new Date()}={}){
 if(draft.season!=='2026/27'||draft.matchday!==8||![studyV1Sha256,studyV2Sha256].every(h=>/^[a-f0-9]{64}$/.test(h)))throw Error('G8_COHORT_DRAFT_INVALID');
 const planned=[];let season=2026,round=8;for(let i=0;i<60;i++){planned.push({season:`${season}/${String(season+1).slice(-2)}`,matchday:round,expectedEvents:10});if(++round>38){season++;round=1;}}
 return {schema:'lamultipla-reference-cohort-proposal-v1',id:'reference-g8-20261023-v1',createdAtUtc:new Date(now).toISOString(),state:'DRAFT_REQUIRES_USER_APPROVAL',active:false,
  firstSeason:draft.season,firstMatchday:8,firstRoundDraftSha256:digest(draft),firstRoundEvents:draft.events,models:[{id:'goals-v1',studySha256:studyV1Sha256},{id:'dc-v2',studySha256:studyV2Sha256},{id:'bivariate-v2',studySha256:studyV2Sha256}],
  sourceRole:'A',source:'openfootball/football.json',trainingPolicy:'REGISTERED_MONTHLY_CUTOFF_4_YEARS_DATE_PLUS_48H_UNCHANGED',initialCutoffUtc:'2026-10-01T00:00:00.000Z',
  plannedRounds:planned,plannedEvents:600,deadlinePolicy:{...PROGRESSIVE_POLICY},evaluation:{primary:['btts','over2.5'],minPaired:500,minForecastCoverage:.9,minResultsCoverage:.95,bonferroniConfidence:.9875,baselineConfidence:.95,closeAfterLastKickoffHours:48,interims:'DESCRIPTIVE_ONLY',activationRequiresSeparateApproval:true},
  missingRound:'RETAIN_IN_FRAME_AND_BLOCK_CONFIRMATION_NO_SLIDING',reschedule:'REQUIRE_VERSIONED_EVIDENCE_RETAIN_EVENT_ID_NO_RETROACTIVE_FORECAST',
  relationToPrevious:'SEPARATE_ID_AND_STORE; G7_GAP_RETAINED; OLD_V2_PROTOCOL_AND_FRAME_NOT_CHANGED',storeNamespace:'.local/research-review/cohorts/reference-g8-20261023-v1',
  supplementalResultsAllowed:false,challengerAllowed:false,originalCohortChanged:false,forecastProduced:false,actualStakeEUR:0};
}
