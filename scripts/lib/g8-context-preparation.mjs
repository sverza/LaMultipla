import {digest} from './prospective/store.mjs';
const categories=['injuries','suspensions','probableLineups','officialLineups','rotation','competitionLoad'];
// Preparation only: a draft cannot impersonate the provider-bound operational dossier.
export function prepareContextDrafts({round,dataset,facts=[],now=new Date()}){
 const at=new Date(now).getTime();
 if(round?.schema!=='lamultipla-round-preparation-draft-v1'||round.events?.length!==10||!Array.isArray(dataset?.rows)||!Number.isFinite(at))throw Error('CONTEXT_PREPARATION_INPUT');
 const teams=new Set(round.events.flatMap(e=>[e.home,e.away]));
 for(const f of facts){
  let url;try{url=new URL(f.url);}catch{throw Error('CONTEXT_SOURCE_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||!teams.has(f.team)||!categories.includes(f.category)||!f.statement?.trim()
   ||!['CONFIRMED_STATEMENT','PLANNED_EVENT','PARTIAL_ACCESS','CONFLICT_REQUIRES_REVIEW'].includes(f.state)
   ||!Number.isFinite(Date.parse(f.observedAtUtc))||Date.parse(f.observedAtUtc)>at||!Number.isFinite(Date.parse(f.expiresAtUtc))
   ||Date.parse(f.expiresAtUtc)<=Date.parse(f.observedAtUtc)||f.availabilityInference!==false)throw Error('CONTEXT_SOURCE_INVALID');
 }
 return {schema:'lamultipla-context-preparation-drafts-v1',generatedAtUtc:new Date(at).toISOString(),roundSha256:digest(round),datasetSha256:digest(dataset),
  dossiers:round.events.map(e=>{
   const notes=facts.filter(f=>f.team===e.home||f.team===e.away).map(f=>({...f,fresh:at<Date.parse(f.expiresAtUtc)}));
   return {draftId:digest([round.season,round.matchday,e.home,e.away,e.kickoffUtc]),fixtureId:e.fixtureId,home:e.home,away:e.away,kickoffUtc:e.kickoffUtc,
    notes,historicalObservedForm:[e.home,e.away].map(team=>({team,source:'A_OPENFOOTBALL',lastObservedResults:dataset.rows.filter(r=>r.home===team||r.away===team).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5),
     completeRecentForm:false,warning:'OBSERVED_SOURCE_ONLY_G6_G7_MISSING_DO_NOT_TREAT_AS_LATEST_FORM'})),
    checks:Object.fromEntries(categories.map(k=>[k,{state:'REVIEW_PENDING',absenceOfNewsMeansAvailable:false}])),
    providerBindingPending:!e.fixtureId,contextComplete:false,operationallyUsable:false,probabilityAdjustmentsApplied:false};
  }),counts:{prepared:10,operationallyComplete:0},forecastProduced:false,actualStakeEUR:0};
}
