// Diagnostic adapter only: checks mirror the registered reference, never used by shadow.mjs.
import {fingerprint} from '../odds-report.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {quantile} from '../goals/metrics.mjs';
import {effectiveAvailabilityCached} from './availability.mjs';
import {createDiagnosticContext,isDiagnosticContext} from './context.mjs';
import {settlementEV} from '../analysis.mjs';
import {POLICY} from '../shadow/policy.mjs';
import {FAMILIES} from '../engine/markets.mjs';
export function experimentalScreenOptimized({journal,study,report,assessment={},now=new Date()}={},context=null) {
  if(context&&!isDiagnosticContext(context,{journal,study,report,assessment}))throw Error('DIAGNOSTIC_CONTEXT_NOT_ISSUED_FOR_INPUTS');
  if(!context)context=createDiagnosticContext({journal,study,report,assessment,beforeIndex:()=>{
   if(!Number.isFinite(new Date(now).getTime())||report?.schema!=='lamultipla-oddspapi-private-v2'||report.source?.provider!=='OddsPapi'||report.source.bookmaker!=='bet365.it'||report.source.tournamentId!==23)throw new Error('Official local report and valid clock required');
  }});const clock=new Date(now).getTime();
  if(!Number.isFinite(clock)||report?.schema!=='lamultipla-oddspapi-private-v2'||report.source?.provider!=='OddsPapi'||report.source.bookmaker!=='bet365.it'||report.source.tournamentId!==23)throw new Error('Official local report and valid clock required');
  const issues=[];if(!report.round?.verified||report.round.season!==journal.manifest.season||report.round.matchday!==journal.manifest.matchday)issues.push('round_identity_unverified');
  if(!Number.isFinite(Date.parse(journal.generatedAtUtc))||clock-Date.parse(journal.generatedAtUtc)>24*3600000||clock<Date.parse(journal.generatedAtUtc))issues.push('forecast_expired_or_future');
  if(!Number.isFinite(Date.parse(report.fetchedAtUtc))||clock-Date.parse(report.fetchedAtUtc)>30*60000||Date.parse(report.fetchedAtUtc)>clock||Date.parse(report.fetchedAtUtc)<Date.parse(journal.generatedAtUtc))issues.push('report_expired_or_before_forecast');
  const estimates=assessment.assessment?.estimates??assessment.estimates??[],reviews=new Map(),duplicates=new Set();
  for(const e of estimates){if(reviews.has(e.quoteId))duplicates.add(e.quoteId);reviews.set(e.quoteId,e);}
  const counts=new Map(),keys=new Map();for(const q of report.selections){counts.set(q.quoteId,(counts.get(q.quoteId)??0)+1);const key=fingerprint([q.fixtureId,q.marketId,q.period,q.line,q.playerKey,q.outcome]);keys.set(key,(keys.get(key)??0)+1);}
  const records=[];let unsupported=0;
  for(const q of report.selections){const review=reviews.get(q.quoteId),mapping=review?.settlementMapping;
    const mappingBound=mapping?.reportSha256===context.reportSha256&&mapping?.domain==='bet365.it'&&mapping?.origin==='manual_bet365_it'&&mapping?.settlementVerified===true
      &&typeof mapping.reviewer==='string'&&mapping.reviewer.trim()&&Number.isFinite(Date.parse(mapping.verifiedAtUtc))&&Date.parse(mapping.verifiedAtUtc)<=clock
      &&typeof mapping?.evidence==='string'&&mapping.evidence.trim()&&mapping?.identitySha256===fingerprint([q.fixtureId,q.marketId,q.outcomeId,q.period,q.line,q.outcome]);
    const spec=context.quoteSpec(q,mappingBound?mapping:null);if(!spec){unsupported++;continue;}
    const e=context.entries.get(q.fixtureId),reasons=[...issues],availability=effectiveAvailabilityCached(report,q,review?.manualVerification,clock,30,context);
    if(!e||e.status!=='prospective'||canonicalTeam(q.fixture?.[0])!==e.home||canonicalTeam(q.fixture?.[1])!==e.away||q.kickoffUtc!==e.kickoffUtc
      ||q.quoteId!==fingerprint([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey])||q.marketId==null||q.outcomeId==null||q.playerProp!==false
      ||q.issues?.some(v=>['market_identity_incomplete','invalid_line','event_identity_incomplete','duplicate_fixture_conflict','unexpected_player_in_standard_market'].includes(v)))reasons.push('exact_identity_mismatch');
    if(counts.get(q.quoteId)!==1||duplicates.has(q.quoteId)||keys.get(fingerprint([q.fixtureId,q.marketId,q.period,q.line,q.playerKey,q.outcome]))!==1)reasons.push('duplicate_quote_or_review');
    if(q.active!==true&&!availability.override||availability.negative||q.bookmaker!=='bet365.it'||q.tournamentId!==23||q.marketActive!==true||q.bookmakerIsActive!==true||q.suspended!==false||q.statusId!==0||!Number.isFinite(q.price)||q.price<=1)reasons.push('unavailable_or_reserved');
    if(q.observedAtUtc!==report.fetchedAtUtc||clock>=Date.parse(q.kickoffUtc)-5*60000)reasons.push('quote_time_or_kickoff_invalid');
    if(Number.isFinite(Date.parse(q.changedAt))&&Date.parse(q.changedAt)>Date.parse(q.observedAtUtc))reasons.push('future_provider_timestamp');
    if(q.bookmakerChangedAt!=null&&(!Number.isFinite(Date.parse(q.bookmakerChangedAt))||Date.parse(q.bookmakerChangedAt)>Date.parse(q.observedAtUtc)))reasons.push('invalid_bookmaker_timestamp');
    if((!Number.isFinite(Date.parse(q.changedAt))||Date.parse(q.observedAtUtc)-Date.parse(q.changedAt)>24*3600000)&&!availability.verified)reasons.push('old_change_requires_manual_check');
    for(const kind of ['dc','bivariate']){const f=e?.forecasts?.[kind],cached=context.payouts(e,kind,spec),p=cached.probabilities,ev=p?settlementEV(q.price,p):null;
      const samples=cached.samples.map(p=>settlementEV(q.price,p)).filter(Number.isFinite),interval=samples.length?[quantile(samples,.025),quantile(samples,.975)]:null;
      const local=[...reasons];if(!p||!f?.uncertainty?.sufficient||f.uncertainty.replicates<40||samples.length<36)local.push('independent_distribution_or_uncertainty_missing');
      const classification=local.length?'INSUFFICIENT_DATA':ev<=0?'NO_VALUE':ev<POLICY.minPointEV||interval[0]<POLICY.minLowerEV||interval[1]-interval[0]>q.price*POLICY.maxIntervalWidth?'UNCERTAIN_VALUE':'EXPLORATORY_VALUE';
      records.push({quoteId:q.quoteId,fixtureId:q.fixtureId,fixture:q.fixture,kind,spec,marketStatus:spec.family==='oneXTwo'?'EXPERIMENTAL':FAMILIES[spec.family],price:q.price,availability,
        probabilities:p,expectedValuePerUnit:ev,evInterval95:interval,classification,reasons:[...new Set(local)],validationState:'PROSPECTIVE_VALIDATION_PENDING',eligibleForSelector:false,operationallyApproved:false});}
  }
  return {schema:'lamultipla-engine-screen-v2',generatedAtUtc:new Date(clock).toISOString(),journalSha256:context.journalSha256,studySha256:context.studySha256,reportSha256:context.reportSha256,
    records,globalIssues:issues,counts:{quotesExamined:records.length/2,unsupported,byClass:Object.fromEntries(['INSUFFICIENT_DATA','NO_VALUE','UNCERTAIN_VALUE','EXPLORATORY_VALUE'].map(k=>[k,records.filter(r=>r.classification===k).length]))},
    sourceData:journal.sourceData==='synthetic_test'||report.source.mode==='synthetic_test'?'synthetic_test':'original_local_artifacts',
    decision:'NO_BET',cause:'NEW_MARKETS_REQUIRE_PROSPECTIVE_VALIDATION',actualStakeEUR:0,operationallyApproved:false,
    limitation:'Bootstrap EV intervals are sensitivity diagnostics, not simultaneous evidence of profitable value; no new markets enter the selector'};
}
