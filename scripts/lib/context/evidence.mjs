import {canonicalTeam} from '../goals/data.mjs';
import {digest} from '../prospective/store.mjs';
import {CONTEXT_POLICY,finiteTime} from './policy.mjs';
export function validateBundle(input,now){
  const clock=Date.parse(now);if(!Number.isFinite(clock)||input?.schema!=='lamultipla-context-evidence-v1'||!Array.isArray(input.sources)||!Array.isArray(input.facts)||!Array.isArray(input.reviews)||!Array.isArray(input.calendar))throw new Error('Structured context evidence required');
  if(/"(?:probabilities|price|expectedValuePerUnit|probabilityAdjustment|articleBody|rawHtml)"\s*:/.test(JSON.stringify(input)))throw new Error('Probabilities/prices/article bodies are not context evidence');
  for(const field of ['sources','facts','reviews','calendar'])if(input[field].some(x=>typeof x.id!=='string'||!x.id.trim())||new Set(input[field].map(x=>x.id)).size!==input[field].length)throw new Error('Duplicate/missing context identity');
  for(const s of input.sources){let url;try{url=new URL(s.url);}catch{throw new Error('Source URL required');}
    if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(k=>/token|key|password|auth/i.test(k)))throw new Error('Private/unsafe source URL refused');
    if(!['club','league','editorial','calendar','other'].includes(s.authority)||s.authorityVerified!==true||s.scope!=='men_first_team'
      ||!finiteTime(s.reviewedAtUtc)||Date.parse(s.reviewedAtUtc)>clock||!s.reviewedBy?.trim()
      ||s.rights?.mode!=='private_selective_fact_notes'||!s.rights.basis?.trim()||s.rights.automatedExtraction!==false||s.rights.publicationAllowed!==false)throw new Error('Reviewed private source scope/rights required; no bulk scraper');
    if(s.authority==='club'&&(typeof s.team!=='string'||!s.team.trim()))throw new Error('Club authority must identify its team');
  }
  return input;
}
export function evidenceIssues(f,entry,sources,clock){
  const reasons=[],s=sources.get(f.sourceId),category=f.category;
  if(!s||!Object.hasOwn(CONTEXT_POLICY.maxAgeHours,category)||f.fixtureId!==entry.fixtureId||![entry.home,entry.away].includes(canonicalTeam(f.team))||f.competition!=='ITA_SERIE_A')reasons.push('context_fact_identity_or_scope_mismatch');
  if(!finiteTime(f.capturedAtUtc)||!finiteTime(f.statusAsOfUtc)||Date.parse(f.capturedAtUtc)>clock||Date.parse(f.statusAsOfUtc)>Date.parse(f.capturedAtUtc)
    ||Date.parse(f.capturedAtUtc)>=Date.parse(entry.kickoffUtc))reasons.push('context_fact_not_observed_before_decision_and_kickoff');
  if(f.publishedAtUtc!=null&&(!finiteTime(f.publishedAtUtc)||Date.parse(f.publishedAtUtc)>Date.parse(f.capturedAtUtc)))reasons.push('context_publication_time_invalid');
  const ttl=category==='lineups'&&f.data?.kind==='confirmed'?CONTEXT_POLICY.confirmedLineupAgeHours:CONTEXT_POLICY.maxAgeHours[category];
  if(!Number.isFinite(ttl)||clock-Date.parse(f.statusAsOfUtc)>ttl*3600000)reasons.push('context_fact_stale');
  if(s?.authority==='club'&&canonicalTeam(s.team)!==canonicalTeam(f.team))reasons.push('club_source_team_mismatch');
  const d=f.data;
  if(['injuries','suspensions'].includes(category)&&(!d||!['out','doubtful','available','unknown'].includes(d.status)||!d.playerId?.trim()||!d.playerName?.trim()))reasons.push('player_availability_identity_missing');
  if(category==='suspensions'&&(s?.authority!=='league'||s.competition!=='ITA_SERIE_A'))reasons.push('suspension_not_official_competition_evidence');
  if(category==='lineups'&&(!d||!['probable','confirmed'].includes(d.kind)||!Array.isArray(d.players)||d.players.length!==11
    ||new Set(d.players.map(p=>p.id)).size!==11||d.players.some(p=>!p.id?.trim()||!p.name?.trim())||(d.kind==='confirmed'&&!['club','league'].includes(s?.authority))))reasons.push('lineup_not_exact_or_official');
  if(category==='calendar'&&(!finiteTime(d?.kickoffUtc)||!['scheduled','postponed','cancelled'].includes(d?.status)))reasons.push('calendar_fact_incomplete');
  if(category==='turnover'&&(!d||!['reported_expected','confirmed_changes','unknown'].includes(d.kind)||d.kind==='confirmed_changes'&&(!Number.isInteger(d.changes)||d.changes<0||d.changes>11||!d.comparedFixtureId)))reasons.push('turnover_basis_missing');
  if(['coach','other'].includes(category)&&(!d||typeof d.note!=='string'||!d.note.trim()||d.note.length>240))reasons.push('context_note_missing_or_excessive');
  return [...new Set(reasons)];
}
export function topicReview(bundle,entry,team,category,observations,clock){
  const matching=bundle.reviews.filter(r=>r.fixtureId===entry.fixtureId&&canonicalTeam(r.team)===team&&r.category===category),sources=new Map(bundle.sources.map(s=>[s.id,s]));
  if(matching.length!==1)return {status:'REVIEW_REQUIRED',reasons:[matching.length?'conflicting_topic_reviews':'topic_not_reviewed']};
  const r=matching[0],reasons=[];
  if(!finiteTime(r.reviewedAtUtc)||Date.parse(r.reviewedAtUtc)>clock||Date.parse(r.reviewedAtUtc)>=Date.parse(entry.kickoffUtc)||clock-Date.parse(r.reviewedAtUtc)>CONTEXT_POLICY.maxAgeHours[category]*3600000
    ||!r.reviewer?.trim()||r.status!=='checked'||!Array.isArray(r.sourceIds)||!r.sourceIds.length||r.sourceIds.some(id=>!sources.has(id)))reasons.push('topic_review_missing_stale_or_unattributed');
  const relevant=observations.filter(o=>canonicalTeam(o.fact.team)===team&&(o.fact.category===category||category==='other'&&['turnover','coach'].includes(o.fact.category)));
  if(relevant.some(o=>o.reasons.length))reasons.push('topic_contains_unusable_observations');
  if(relevant.some(o=>Date.parse(o.fact.capturedAtUtc)>Date.parse(r.reviewedAtUtc)||!r.sourceIds.includes(o.fact.sourceId)))reasons.push('topic_review_precedes_or_omits_evidence');
  if(['injuries','suspensions'].includes(category)){
    const groups=new Map();for(const o of relevant.filter(o=>!o.reasons.length)){const key=o.fact.data.playerId,states=groups.get(key)??new Set();states.add(o.fact.data.status);groups.set(key,states);}
    if([...groups.values()].some(g=>g.size>1))reasons.push('conflicting_player_availability');
  }
  if(category==='injuries'&&!r.sourceIds?.some(id=>sources.get(id)?.authority==='club'&&canonicalTeam(sources.get(id)?.team)===team))reasons.push('club_availability_sources_not_reviewed');
  if(category==='suspensions'&&!r.sourceIds?.some(id=>sources.get(id)?.authority==='league'&&sources.get(id)?.competition==='ITA_SERIE_A'))reasons.push('official_suspension_sources_not_reviewed');
  if(category==='lineups'){
    const valid=relevant.filter(o=>!o.reasons.length);if(!valid.length)reasons.push('lineup_unknown');
    if(new Set(valid.map(o=>digest(o.fact.data.players.map(p=>p.id).sort()))).size>1)reasons.push('conflicting_lineups');
  }
  const warnings=relevant.filter(o=>!o.reasons.length&&(['injuries','suspensions'].includes(category)&&o.fact.data.status!=='available'||category==='lineups'&&o.fact.data.kind==='probable')).map(o=>o.fact.id);
  if((warnings.length||category==='other'&&relevant.length)&&(r.uncertaintyAcknowledged!==true||!r.uncertaintyNote?.trim()))reasons.push('context_uncertainty_not_acknowledged');
  return {status:reasons.length?'REVIEW_REQUIRED':'REVIEWED_PRIVATE',reasons:[...new Set(reasons)],review:r,warningEvidenceIds:warnings,
    limitation:'Reviewer assertion of checked sources, not proof of absence of undisclosed injuries'};
}
