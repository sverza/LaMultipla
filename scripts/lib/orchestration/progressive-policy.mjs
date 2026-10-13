import {digest} from '../prospective/store.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {assertFutureRound} from '../decision/policy.mjs';
export const PROGRESSIVE_POLICY=Object.freeze({version:'analysis-progressive-v1',registeredAtUtc:'2026-10-13T18:16:47.000Z',
  protocolPath:'docs/protocollo-analisi-progressive-v1.md',openBeforeMinutes:360,analysisLeadMinutes:150,
  queueLeadMinutes:135,deliveryLeadMinutes:120,technicalBufferMinutes:5,maxQuoteAgeMinutes:30,
  minAcquisitionIntervalMinutes:360,calendarMaxAgeMinutes:60,calendarBackgroundIntervalMinutes:360,
  maxNominalStakeEUR:3,actualStakeEUR:0,operationallyApproved:false});
export const fail=code=>{throw Object.assign(new Error(code),{code});};
export const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function validateRoundIdentity(schedule){
  assertFutureRound(schedule);
  if(schedule?.schema!=='lamultipla-prospective-schedule-v1'||!/^\d{4}\/\d{2}$/.test(schedule.season)
    ||Number(schedule.season.slice(5))!==(Number(schedule.season.slice(0,4))+1)%100
    ||!Number.isInteger(schedule.matchday)||schedule.matchday<1||schedule.matchday>38
    ||!Array.isArray(schedule.events)||schedule.events.length!==10||new Set(schedule.events.map(e=>e.fixtureId)).size!==10
    ||new Set(schedule.events.flatMap(e=>[canonicalTeam(e.home),canonicalTeam(e.away)])).size!==20
    ||schedule.events.some(e=>typeof e.fixtureId!=='string'||!/^[-A-Za-z0-9_]+$/.test(e.fixtureId)
      ||typeof e.home!=='string'||!e.home.trim()||typeof e.away!=='string'||!e.away.trim()||!instant(e.kickoffUtc)
      ||Date.parse(e.kickoffUtc)<=Date.parse(PROGRESSIVE_POLICY.registeredAtUtc)))fail('PROGRESSIVE_ROUND_IDENTITY_INVALID');
  return {season:schedule.season,matchday:schedule.matchday,events:schedule.events.map(e=>({
    fixtureId:e.fixtureId,home:canonicalTeam(e.home),away:canonicalTeam(e.away)})).sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId))};
}
export function timing(schedule,now){
  validateRoundIdentity(schedule);const at=new Date(now).getTime();if(!Number.isFinite(at)||at<Date.parse(PROGRESSIVE_POLICY.registeredAtUtc))fail('PROGRESSIVE_CLOCK_INVALID');
  const eligible=schedule.events.filter(e=>(e.status??'scheduled')==='scheduled'&&Date.parse(e.kickoffUtc)>at+PROGRESSIVE_POLICY.analysisLeadMinutes*60000);
  const slots=[...new Set(schedule.events.filter(e=>(e.status??'scheduled')==='scheduled').map(e=>e.kickoffUtc))].sort()
    .map(k=>({id:digest({kickoffUtc:k}),opensAtUtc:new Date(Date.parse(k)-PROGRESSIVE_POLICY.openBeforeMinutes*60000).toISOString(),
      closesAtUtc:new Date(Date.parse(k)-PROGRESSIVE_POLICY.analysisLeadMinutes*60000).toISOString()}));
  const active=slots.filter(s=>Date.parse(s.opensAtUtc)<=at&&at<Date.parse(s.closesAtUtc)).at(-1)??null;
  const next=slots.find(s=>Date.parse(s.opensAtUtc)>at)?.opensAtUtc??null;
  const unresolved=schedule.events.some(e=>['postponed','unknown'].includes(e.status));
  return {eligibleFixtureIds:eligible.map(e=>e.fixtureId),slots,active,nextWindowAtUtc:next,
    exhausted:!unresolved&&eligible.length<2&&!next,unresolved};
}
export function validateAttemptMetadata(p,journal,now){
  const at=new Date(now).getTime();
  if(p?.schema!=='lamultipla-progressive-attempt-v1'||p.protocolSha256!==digest(PROGRESSIVE_POLICY)
    ||!/^\d{4}$/.test(p.attemptId)||!/^\d+$/.test(String(p.revision))||Number(p.attemptId)!==p.revision
    ||!Array.isArray(p.eligibleFixtureIds)||new Set(p.eligibleFixtureIds).size!==p.eligibleFixtureIds.length
    ||!['roundIdentitySha256','scheduleSha256','scientificJournalSha256','inputSha256','protocolDocumentSha256'].every(k=>/^[a-f0-9]{64}$/.test(p[k]))
    ||!instant(p.plannedAtUtc)||Date.parse(p.plannedAtUtc)>at||Date.parse(p.plannedAtUtc)<Date.parse(PROGRESSIVE_POLICY.registeredAtUtc)
    ||p.eligibleFixtureIds.some(id=>!journal.manifest.events.some(e=>e.fixtureId===id))
    ||journal.provenance?.cohortEligible===false&&journal.provenance.scientificJournalSha256!==p.scientificJournalSha256)fail('PROGRESSIVE_ATTEMPT_INVALID');
  validateRoundIdentity({schema:'lamultipla-prospective-schedule-v1',...journal.manifest});
  if(p.roundIdentitySha256!==digest(validateRoundIdentity({schema:'lamultipla-prospective-schedule-v1',...journal.manifest})))fail('PROGRESSIVE_ATTEMPT_ROUND_MISMATCH');
  return p;
}
export function proposalExpiry(payload){
  const generated=Date.parse(payload.generatedAtUtc);
  if(payload.schema==='lamultipla-app-round-state-v1')return new Date(generated+(payload.final?1440:30)*60000).toISOString();
  const lead=payload.source?.generalProtocolVersion===PROGRESSIVE_POLICY.version?PROGRESSIVE_POLICY.deliveryLeadMinutes:5;
  return new Date(Math.min(generated+30*60000,...payload.selections.map(s=>Date.parse(s.identity.kickoffUtc)-lead*60000))).toISOString();
}
