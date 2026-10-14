import {canonicalTeam,sha256} from '../goals/data.mjs';
import {digest} from './store.mjs';
import {contextManifest} from '../context/dossier.mjs';

// Quarantine only. No adapter to the registered evaluator or training dataset.
const time=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash;}catch{return false;}};
const fail=()=>{throw new Error('Supplemental evidence invalid; private contents withheld');};
export function validateSupplementalEvidence(input,raw,{now=new Date()}={}){
  const clock=new Date(now).getTime(),s=input?.source;
  if(input?.schema!=='lamultipla-supplemental-results-v1'||!Number.isFinite(clock)
    ||!/^\d{4}\/\d{2}$/.test(input.season)||!Number.isInteger(input.matchday)||input.matchday<1||input.matchday>38
    ||!s||!['lega-official','football-data.org'].includes(s.id)||!url(s.url)||!url(s.termsUrl)
    ||!text(s.documentId)||!hex(s.rawSha256)||sha256(raw)!==s.rawSha256
    ||!Number.isFinite(time(s.acquiredAtUtc))||time(s.acquiredAtUtc)>clock
    ||s.publishedAtUtc!=null&&(!Number.isFinite(time(s.publishedAtUtc))||time(s.publishedAtUtc)>time(s.acquiredAtUtc))
    ||!['unverified','authorized'].includes(s.rights?.status)||s.rights.status==='authorized'&&!text(s.rights.evidence)
    ||!Array.isArray(input.entries)||input.entries.length>10
    ||new Set(input.entries.map(e=>e.fixtureId)).size!==input.entries.length)fail();
  const host=new URL(s.url).hostname;
  if(s.id==='lega-official'&&host!=='legaseriea.it'&&!host.endsWith('.legaseriea.it')
    ||s.id==='football-data.org'&&host!=='api.football-data.org')fail();
  for(const e of input.entries){
    if(!text(e.fixtureId)||!text(e.home)||!text(e.away)||canonicalTeam(e.home)===canonicalTeam(e.away)
      ||!['finished','awarded','postponed','suspended','cancelled','pending'].includes(e.status)
      ||!text(e.sourceLocator)||!text(e.reviewer)||!Number.isFinite(time(e.reviewedAtUtc))
      ||time(e.reviewedAtUtc)<time(s.acquiredAtUtc)||time(e.reviewedAtUtc)>clock
      ||!Number.isFinite(time(e.kickoffUtc))||e.date!==new Date(time(e.kickoffUtc)).toISOString().slice(0,10)
      ||e.status==='finished'&&(time(s.acquiredAtUtc)<=time(e.kickoffUtc)||!Array.isArray(e.goals)||e.goals.length!==2||e.goals.some(g=>!Number.isInteger(g)||g<0||g>30))
      ||e.status!=='finished'&&e.goals!==null)fail();
  }
  return input;
}
export function reconcileSupplementalResults(manifest,observations,{originalResults=null,now=new Date()}={}){
  const identity=contextManifest(manifest),byId=new Map(identity.events.map(e=>[e.fixtureId,e]));
  const validated=observations.map(({evidence,raw})=>validateSupplementalEvidence(evidence,raw,{now}));
  if(validated.some(s=>s.season!==identity.season||s.matchday!==identity.matchday
    ||s.entries.some(e=>!byId.has(e.fixtureId))))fail();
  const rows=identity.events.map(event=>{
    const candidates=validated.flatMap(s=>s.entries.filter(e=>e.fixtureId===event.fixtureId).map(e=>({e,s})));
    const reasons=[],accepted=[];
    for(const {e,s} of candidates){
      if(canonicalTeam(e.home)!==event.home||canonicalTeam(e.away)!==event.away)reasons.push('identity_conflict');
      else if(s.source.rights.status!=='authorized')reasons.push('rights_not_verified');
      else if(e.kickoffUtc!==event.kickoffUtc)reasons.push('reschedule_evidence_required');
      else if(e.status!=='finished')reasons.push('status_'+e.status);
      else accepted.push(e);
    }
    if(new Set(accepted.map(e=>digest(e.goals))).size>1)reasons.push('source_correction_or_conflict');
    const original=originalResults?.rows?.filter(r=>r.season===identity.season.replace('/','-')&&r.home===event.home&&r.away===event.away)??[];
    if(original.length>1)reasons.push('original_duplicate_requires_review');
    if(accepted.length&&original.length===1&&(original[0].date!==event.kickoffUtc.slice(0,10)||digest(original[0].goals)!==digest(accepted[0].goals)))reasons.push('original_source_conflict');
    const status=reasons.length?'WITHHELD':accepted.length?'CORROBORATED_SUPPLEMENTAL':'PENDING';
    return {fixtureId:event.fixtureId,status,reasons:[...new Set(reasons.length?reasons:accepted.length?[]:['evidence_missing'])],
      goals:status==='CORROBORATED_SUPPLEMENTAL'?accepted[0].goals:null,
      // Acquisition, never publication/date+48h, is the conservative observation time.
      observedAtUtc:status==='CORROBORATED_SUPPLEMENTAL'?new Date(Math.max(...candidates.map(c=>time(c.s.source.acquiredAtUtc)))).toISOString():null,
      evidenceSha256:candidates.map(c=>digest(c.s))};
  });
  return {schema:'lamultipla-supplemental-result-review-v1',reviewedAtUtc:new Date(now).toISOString(),roundSha256:digest(identity),rows,
    counts:{planned:10,corroborated:rows.filter(r=>r.status==='CORROBORATED_SUPPLEMENTAL').length,withheld:rows.filter(r=>r.status==='WITHHELD').length,pending:rows.filter(r=>r.status==='PENDING').length},
    cohortEligible:false,trainingEligible:false,originalSourceReplaced:false,
    limitation:'Offline review only; corrections/reschedules/rights require evidence. No scientific scoring or automated source adoption.'};
}
