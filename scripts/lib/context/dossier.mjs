import {canonicalTeam} from '../goals/data.mjs';
import {digest} from '../prospective/store.mjs';
import {validateCurrentDataset} from '../shadow/registry.mjs';
import {recentForm} from './history.mjs';
import {validateBundle,evidenceIssues,topicReview} from './evidence.mjs';
import {CONTEXT_POLICY,finiteTime} from './policy.mjs';
export const emptyBundle=()=>({schema:'lamultipla-context-evidence-v1',sources:[],facts:[],reviews:[],calendar:[]});
export function contextManifest(manifest){
  if(!/^\d{4}\/\d{2}$/.test(manifest?.season)||!Number.isInteger(manifest.matchday)||manifest.matchday<1||manifest.matchday>38||!Array.isArray(manifest.events)||manifest.events.length!==10
    ||new Set(manifest.events.map(e=>e.fixtureId)).size!==10||new Set(manifest.events.flatMap(e=>[canonicalTeam(e.home),canonicalTeam(e.away)])).size!==20
    ||manifest.events.some(e=>typeof e.fixtureId!=='string'||!/^[-A-Za-z0-9_]+$/.test(e.fixtureId)||!e.home?.trim()||!e.away?.trim()||!finiteTime(e.kickoffUtc)))throw new Error('Exact ten-fixture context manifest required');
  return {season:manifest.season,matchday:manifest.matchday,events:manifest.events.map(e=>({fixtureId:e.fixtureId,home:canonicalTeam(e.home),away:canonicalTeam(e.away),kickoffUtc:e.kickoffUtc}))};
}
function calendarFor(bundle,entry,team,clock){
  const target=Date.parse(entry.kickoffUtc),from=target-14*86400000,to=target+7*86400000,sources=new Map(bundle.sources.map(s=>[s.id,s]));
  const relevant=bundle.calendar.filter(m=>canonicalTeam(m.home)===team||canonicalTeam(m.away)===team),issues=[],valid=[];
  const seen=new Map();for(const m of relevant){const previous=seen.get(m.fixtureId);if(previous&&digest(previous)!==digest(m))issues.push('calendar_conflicting_fixture');seen.set(m.fixtureId,m);
    if(!m.fixtureId?.trim()||!m.competition?.trim()||!m.home?.trim()||!m.away?.trim()||canonicalTeam(m.home)===canonicalTeam(m.away)||!sources.has(m.sourceId)||!finiteTime(m.kickoffUtc)
      ||sources.get(m.sourceId)?.authority==='club'&&![canonicalTeam(m.home),canonicalTeam(m.away)].includes(canonicalTeam(sources.get(m.sourceId).team))
      ||!finiteTime(m.capturedAtUtc)||Date.parse(m.capturedAtUtc)>clock||Date.parse(m.capturedAtUtc)>=target||!['scheduled','finished','postponed','cancelled'].includes(m.status)
      ||m.status==='finished'&&(Date.parse(m.kickoffUtc)>=clock||Date.parse(m.capturedAtUtc)<=Date.parse(m.kickoffUtc))||m.endedAtUtc!=null&&(!finiteTime(m.endedAtUtc)||m.status!=='finished'||Date.parse(m.endedAtUtc)<=Date.parse(m.kickoffUtc)||Date.parse(m.endedAtUtc)>clock||Date.parse(m.endedAtUtc)>Date.parse(m.capturedAtUtc))){
      issues.push('calendar_invalid_or_unobserved_match');continue;}
    if(m.fixtureId===entry.fixtureId&&(canonicalTeam(m.home)!==entry.home||canonicalTeam(m.away)!==entry.away||m.kickoffUtc!==entry.kickoffUtc||m.status!=='scheduled'))issues.push('target_schedule_changed');
    valid.push(m);
  }
  const previous=valid.filter(m=>m.fixtureId!==entry.fixtureId&&m.status==='finished'&&Date.parse(m.kickoffUtc)<target).sort((a,b)=>b.kickoffUtc.localeCompare(a.kickoffUtc))[0];
  const counted=valid.filter(m=>m.fixtureId!==entry.fixtureId&&!['postponed','cancelled'].includes(m.status)),review=bundle.reviews.find(r=>r.fixtureId===entry.fixtureId&&canonicalTeam(r.team)===team&&r.category==='calendar');
  const complete=review?.allCompetitionsChecked===true&&finiteTime(review.windowFromUtc)&&finiteTime(review.windowToUtc)&&Date.parse(review.windowFromUtc)<=from&&Date.parse(review.windowToUtc)>=to
    &&relevant.every(m=>Date.parse(m.capturedAtUtc)<=Date.parse(review.reviewedAtUtc)&&review.sourceIds?.includes(m.sourceId));
  const gap=previous?(target-Date.parse(previous.kickoffUtc))/3600000:null;
  return {team,scope:complete?'REVIEWER_ASSERTED_ALL_COMPETITIONS':'PARTIAL_UNKNOWN_COMPETITIONS',complete,
    windowFromUtc:new Date(from).toISOString(),windowToUtc:new Date(to).toISOString(),matches:valid,
    previousKickoffUtc:previous?.kickoffUtc??null,kickoffGapHours:gap,actualRestHours:previous?.endedAtUtc?(target-Date.parse(previous.endedAtUtc))/3600000:null,
    matchesPrevious7Days:counted.filter(m=>Date.parse(m.kickoffUtc)>=target-7*86400000&&Date.parse(m.kickoffUtc)<target).length,
    matchesPrevious14Days:counted.filter(m=>Date.parse(m.kickoffUtc)>=from&&Date.parse(m.kickoffUtc)<target).length,
    matchesNext7Days:counted.filter(m=>Date.parse(m.kickoffUtc)>target&&Date.parse(m.kickoffUtc)<=to).length,
    shortGapFlag:gap!==null&&gap<=CONTEXT_POLICY.shortKickoffGapHours,issues:[...new Set(issues)],
    limitation:'Counts are lower bounds unless full coverage reviewed; team schedule excludes international minutes of individual players; kickoff gap is not actual rest'};
}
function assessEntry(entry,bundle,clock,datasetAcquiredAtUtc){
  const sources=new Map(bundle.sources.map(s=>[s.id,s])),observations=bundle.facts.filter(f=>f.fixtureId===entry.fixtureId).map(f=>({fact:f,reasons:evidenceIssues(f,entry,sources,clock)}));
  const topics={},calendar={},reasons=[];
  for(const team of [entry.home,entry.away]){topics[team]={};calendar[team]=calendarFor(bundle,entry,team,clock);
    for(const category of CONTEXT_POLICY.requiredCategories){topics[team][category]=topicReview(bundle,entry,team,category,observations,clock);
      if(topics[team][category].status!=='REVIEWED_PRIVATE')reasons.push(team+':'+category+':review_required');}
    if(!calendar[team].complete)reasons.push(team+':calendar_coverage_incomplete');
    reasons.push(...calendar[team].issues.map(r=>team+':'+r));
    const usable=observations.filter(o=>!o.reasons.length&&canonicalTeam(o.fact.team)===team);
    const unavailable=new Set(usable.filter(o=>['injuries','suspensions'].includes(o.fact.category)&&o.fact.data.status==='out').map(o=>o.fact.data.playerId));
    if(usable.some(o=>o.fact.category==='lineups'&&o.fact.data.kind==='confirmed'&&o.fact.data.players.some(p=>unavailable.has(p.id))))reasons.push(team+':unavailable_player_in_confirmed_lineup');
    if(calendar[team].shortGapFlag&&topics[team].calendar.review?.uncertaintyAcknowledged!==true)reasons.push(team+':short_gap_not_acknowledged');
  }
  if(clock-Date.parse(datasetAcquiredAtUtc)>CONTEXT_POLICY.maxDatasetObservationAgeHours*3600000)reasons.push('context_history_refresh_required');
  if(clock>=Date.parse(entry.kickoffUtc)-5*60000)reasons.push('context_not_pre_match_with_buffer');
  if(observations.some(o=>o.reasons.length))reasons.push('unusable_context_observations');
  if(observations.some(o=>!o.reasons.length&&o.fact.category==='calendar'&&(o.fact.data.kickoffUtc!==entry.kickoffUtc||o.fact.data.status!=='scheduled')))reasons.push('target_schedule_changed');
  for(const team of [entry.home,entry.away])if(observations.some(o=>canonicalTeam(o.fact.team)===team&&['turnover','coach','other'].includes(o.fact.category))){
    topics[team].other=topicReview(bundle,entry,team,'other',observations,clock);
    if(topics[team].other.status!=='REVIEWED_PRIVATE')reasons.push(team+':additional_uncertainty_not_acknowledged');}
  return {observations,topics,calendar,state:reasons.length?'CONTEXT_REVIEW_REQUIRED':'READY_FOR_SHADOW_REVIEW',reasons:[...new Set(reasons)],
    probabilityAdjustment:null,intervalAdjustment:null,statisticallyValidated:false,operationallyApproved:false};
}
export function buildContext({manifest,dataset,evidence=emptyBundle(),now=new Date()}={}){
  const clock=new Date(now).getTime();if(!Number.isFinite(clock))throw new Error('Invalid context clock');const generatedAtUtc=new Date(clock).toISOString(),normalized=contextManifest(manifest);
  const current=validateCurrentDataset(dataset,generatedAtUtc);evidence=structuredClone(evidence);validateBundle(evidence,generatedAtUtc);
  const ids=new Set(normalized.events.map(e=>e.fixtureId));if(evidence.facts.some(f=>!ids.has(f.fixtureId))||evidence.reviews.some(r=>!ids.has(r.fixtureId)))throw new Error('Evidence outside context round');
  const entries=normalized.events.map(e=>{const atUtc=new Date(Math.min(clock,Date.parse(e.kickoffUtc))).toISOString();
    const form=Object.fromEntries([e.home,e.away].map((t,i)=>[t,{all:recentForm(current.dataset.rows,t,{atUtc}),venue:recentForm(current.dataset.rows,t,{atUtc,role:i===0?'home':'away'})}]));
    return {...e,form,...assessEntry(e,evidence,clock,current.dataset.acquiredAtUtc)};});
  return {schema:'lamultipla-match-context-v1',generatedAtUtc,manifest:normalized,manifestSha256:digest(normalized),policy:CONTEXT_POLICY,policySha256:digest(CONTEXT_POLICY),
    datasetSha256:current.sha256,datasetAcquiredAtUtc:current.dataset.acquiredAtUtc,sourceCommit:current.dataset.commit,sourceFiles:current.dataset.files,
    evidence,evidenceSha256:digest(evidence),entries,counts:{fixtures:entries.length,readyForShadowReview:entries.filter(e=>e.state==='READY_FOR_SHADOW_REVIEW').length},
    sourceData:current.dataset.synthetic||evidence.synthetic?'synthetic_test':'original_local_observations',probabilityAdjustment:null,operationallyApproved:false,publicationAllowed:false};
}
export function contextGate(context,journal,now){
  const clock=new Date(now).getTime(),missing={policyVersion:CONTEXT_POLICY.version,state:'CONTEXT_REVIEW_REQUIRED',contextSha256:null,entries:[],eligibleFixtureIds:[],reasons:['context_not_provided'],probabilityAdjustment:null};
  if(!context)return missing;
  if(!Number.isFinite(clock)||context.schema!=='lamultipla-match-context-v1'||context.policySha256!==digest(CONTEXT_POLICY)||digest(context.policy)!==digest(CONTEXT_POLICY)
    ||context.manifestSha256!==digest(context.manifest)||context.evidenceSha256!==digest(context.evidence)||context.manifestSha256!==digest(contextManifest(journal.manifest))
    ||!finiteTime(context.generatedAtUtc)||Date.parse(context.generatedAtUtc)>clock||!finiteTime(context.datasetAcquiredAtUtc)||Date.parse(context.datasetAcquiredAtUtc)>Date.parse(context.generatedAtUtc)
    ||!Array.isArray(context.entries)||context.entries.length!==10||digest(context.entries.map(({fixtureId,home,away,kickoffUtc})=>({fixtureId,home,away,kickoffUtc})))!==digest(context.manifest.events))throw new Error('Context journal/identity/policy mismatch');
  validateBundle(context.evidence,new Date(clock).toISOString());
  const entries=context.manifest.events.map(e=>({...e,...assessEntry(e,context.evidence,clock,context.datasetAcquiredAtUtc),observedAfterForecast:Date.parse(context.generatedAtUtc)>Date.parse(journal.generatedAtUtc)}));
  const eligibleFixtureIds=entries.filter(e=>e.state==='READY_FOR_SHADOW_REVIEW').map(e=>e.fixtureId);
  return {policyVersion:CONTEXT_POLICY.version,state:eligibleFixtureIds.length===10?'READY_FOR_SHADOW_REVIEW':'CONTEXT_REVIEW_REQUIRED',contextSha256:digest(context),
    entries,eligibleFixtureIds,reasons:[],probabilityAdjustment:null,statisticallyValidated:false,operationallyApproved:false};
}
export function evidenceTemplate(manifest,now=new Date()){
  const normalized=contextManifest(manifest);return {...emptyBundle(),preparedAtUtc:new Date(now).toISOString(),round:{season:normalized.season,matchday:normalized.matchday},
    required:normalized.events.flatMap(e=>[e.home,e.away].flatMap(team=>CONTEXT_POLICY.requiredCategories.map(category=>({fixtureId:e.fixtureId,team,category,status:'unknown'})))),
    instruction:'Add selectively reviewed private facts/sources/calendar/reviews; unknown entries are not confirmations. No prices/probabilities or article bodies.'};
}
