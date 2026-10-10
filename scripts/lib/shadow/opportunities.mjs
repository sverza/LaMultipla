import {fingerprint} from '../odds-report.mjs';
import {effectiveAvailability} from '../availability.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {MODEL_CODE_SHA,MODEL_COMMIT,MODEL_VERSION,PROTOCOL_SHA,CONFIG,probabilityVector} from '../prospective/freeze.mjs';
import {POLICY,valueMetrics,classifyValue,rankValue} from './policy.mjs';
const finiteDate=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const outcomes=['1','X','2'];
const unique=a=>[...new Set(a)];
export function journalIssues(journal,study,clock) {
  const issues=[];
  if(journal?.schema!=='lamultipla-prospective-journal-v1'||journal.modelVersion!==MODEL_VERSION||journal.modelCommit!==MODEL_COMMIT
    ||journal.modelCodeCanonicalSha256!==MODEL_CODE_SHA||journal.protocolCanonicalSha256!==PROTOCOL_SHA||fingerprint(journal.config)!==fingerprint(CONFIG)
    ||journal.fit?.converged!==true||journal.fit.cutoffUtc!==journal.trainingCutoffUtc||fingerprint(journal.fit.config)!==fingerprint(CONFIG))issues.push('unrecognized_frozen_model');
  if(!study||fingerprint(study)!==journal?.provenance?.studySha256||study.acceptance?.oneXTwo?.retrospectiveAccepted!==true)issues.push('historical_validation_evidence_missing');
  if(!finiteDate(journal?.generatedAtUtc)||Date.parse(journal.generatedAtUtc)>clock||clock-Date.parse(journal.generatedAtUtc)>POLICY.maxForecastAgeHours*3600000)issues.push('forecast_expired_or_future');
  if(!finiteDate(journal?.trainingCutoffUtc)||Date.parse(journal.trainingCutoffUtc)>clock)issues.push('training_cutoff_invalid');
  if(!finiteDate(journal?.provenance?.datasetAcquiredAtUtc)||Date.parse(journal.provenance.datasetAcquiredAtUtc)>Date.parse(journal?.generatedAtUtc))issues.push('dataset_not_observed_before_forecast');
  if(!finiteDate(study?.validationCompletedAtUtc)||Date.parse(study.validationCompletedAtUtc)>Date.parse(journal?.generatedAtUtc))issues.push('study_not_completed_before_forecast');
  if(!Array.isArray(journal?.entries)||new Set(journal.entries.map(e=>e.fixtureId)).size!==journal.entries.length)issues.push('duplicate_or_missing_forecasts');
  for(const e of journal?.entries??[]) {const {entrySha256,...content}=e;
    if(fingerprint(content)!==entrySha256)issues.push('forecast_entry_hash_mismatch');
    if(e.generatedAtUtc!==journal.generatedAtUtc||e.season!==journal.manifest?.season||e.matchday!==journal.manifest?.matchday)issues.push('forecast_manifest_identity_mismatch');}
  if(journal?.manifestSha256!==fingerprint(journal?.manifest))issues.push('forecast_manifest_hash_mismatch');
  return unique(issues);
}
export function screenOpportunities({journal,report,study,assessment={},now=new Date()}={}) {
  const clock=new Date(now).getTime();if(!Number.isFinite(clock))throw new Error('Invalid decision clock');
  if(report?.schema!=='lamultipla-oddspapi-private-v2'||!Array.isArray(report.selections)
    ||report.source?.provider!=='OddsPapi'||report.source.bookmaker!=='bet365.it'||report.source.tournamentId!==23)throw new Error('Official bet365.it Serie A report required');
  const globalIssues=journalIssues(journal,study,clock);
  if(!report.round?.verified||report.round.season!==journal?.manifest?.season||report.round.matchday!==journal?.manifest?.matchday)globalIssues.push('round_identity_not_verified');
  if(!finiteDate(report.fetchedAtUtc)||Date.parse(report.fetchedAtUtc)>clock||clock-Date.parse(report.fetchedAtUtc)>POLICY.maxQuoteAgeMinutes*60000)globalIssues.push('report_expired_or_future');
  if(clock<Date.parse(POLICY.registeredAtUtc))globalIssues.push('decision_precedes_policy_registration');
  const estimates=assessment.assessment?.estimates??assessment.estimates??[],verifications=new Map(),duplicateReviews=new Set();
  for(const e of estimates) {if(verifications.has(e.quoteId))duplicateReviews.add(e.quoteId);verifications.set(e.quoteId,e.manualVerification);}
  const quoteIDs=new Map(),boardKeys=new Map();
  for(const q of report.selections){quoteIDs.set(q.quoteId,(quoteIDs.get(q.quoteId)||0)+1);
    const key=fingerprint([q.fixtureId,q.marketId,q.period,q.line,q.playerKey,q.outcome]);boardKeys.set(key,(boardKeys.get(key)||0)+1);}
  const entries=new Map((journal?.entries??[]).map(e=>[e.fixtureId,e])),screening=[];let unsupported=0;
  for(const q of report.selections) {
    if(q.marketType!=='1x2'||q.period!=='fulltime'||q.marketName!=='Full Time Result'){unsupported++;continue;}
    const e=entries.get(q.fixtureId),reasons=[...globalIssues],availability=effectiveAvailability(report,q,verifications.get(q.quoteId),clock,POLICY.maxQuoteAgeMinutes);
    const key=fingerprint([q.fixtureId,q.marketId,q.period,q.line,q.playerKey,q.outcome]);
    if(!e||e.status!=='prospective'||!probabilityVector(e.probabilities))reasons.push('independent_forecast_missing');
    if(!e||!Array.isArray(q.fixture)||q.fixture.length!==2||canonicalTeam(q.fixture[0])!==e.home||canonicalTeam(q.fixture[1])!==e.away
      ||q.kickoffUtc!==e.kickoffUtc||q.line!==0||q.playerProp!==false||q.playerKey!=='0'||q.playerName!=null||!outcomes.includes(q.outcome)
      ||q.quoteId!==fingerprint([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey])||q.marketId==null||q.outcomeId==null
      ||q.issues?.some(v=>['market_identity_incomplete','invalid_line','player_identity_incomplete','event_identity_incomplete','duplicate_fixture_conflict','unexpected_player_in_standard_market'].includes(v)))reasons.push('exact_identity_mismatch');
    if(quoteIDs.get(q.quoteId)!==1||boardKeys.get(key)!==1||duplicateReviews.has(q.quoteId))reasons.push('duplicate_or_conflicting_quote');
    if(q.bookmaker!=='bet365.it'||q.tournamentId!==23||q.suspended!==false||q.bookmakerIsActive!==true||q.marketActive!==true||q.statusId!==0
      ||!Number.isFinite(q.price)||q.price<=1||availability.negative||(q.active!==true&&!availability.override))reasons.push('quote_unavailable_or_reserved');
    if(!finiteDate(q.observedAtUtc)||q.observedAtUtc!==report.fetchedAtUtc||Date.parse(q.observedAtUtc)>clock||clock-Date.parse(q.observedAtUtc)>POLICY.maxQuoteAgeMinutes*60000
      ||!finiteDate(e?.generatedAtUtc)||Math.abs(Date.parse(q.observedAtUtc)-Date.parse(e.generatedAtUtc))>POLICY.maxForecastQuoteLagMinutes*60000)reasons.push('incompatible_quote_forecast_time');
    if(!finiteDate(q.kickoffUtc)||clock>=Date.parse(q.kickoffUtc)-POLICY.freezeBufferMinutes*60000||Date.parse(journal?.trainingCutoffUtc)>=Date.parse(q.kickoffUtc))reasons.push('kickoff_started_or_cutoff_invalid');
    if(finiteDate(q.changedAt)&&Date.parse(q.changedAt)>Date.parse(q.observedAtUtc))reasons.push('provider_change_in_future');
    if((!finiteDate(q.changedAt)||Date.parse(q.observedAtUtc)-Date.parse(q.changedAt)>POLICY.maxChangeAgeHours*3600000)&&!availability.verified)reasons.push('old_or_missing_change_requires_manual_check');
    if(q.bookmakerChangedAt!=null&&(!finiteDate(q.bookmakerChangedAt)||Date.parse(q.bookmakerChangedAt)>Date.parse(q.observedAtUtc)))reasons.push('invalid_bookmaker_timestamp');
    if(e&&(!Number.isInteger(e.uncertainty?.replicates)||e.uncertainty.replicates<POLICY.minReplicates||!Number.isInteger(e.uncertainty.failures)
      ||e.uncertainty.failures<0||e.uncertainty.failures/e.uncertainty.replicates>POLICY.maxFailureRate||e.uncertainty.sufficient!==true))reasons.push('uncertainty_evidence_insufficient');
    const k=outcomes.indexOf(q.outcome),value=valueMetrics(q.price,e?.probabilities?.[k],e?.intervals95?.[k]);
    if(!value)reasons.push('probability_or_interval_missing');
    const classification=reasons.length?'INSUFFICIENT_DATA':classifyValue(value);
    screening.push({quoteId:q.quoteId,fixtureId:q.fixtureId,fixture:q.fixture,kickoffUtc:q.kickoffUtc,marketId:q.marketId,marketType:q.marketType,
      marketName:q.marketName,period:q.period,line:q.line,playerKey:q.playerKey,outcome:q.outcome,price:q.price,
      observedAtUtc:q.observedAtUtc,entrySha256:e?.entrySha256??null,availability,value,classification,reasons:unique(reasons),
      operationalBlockers:['experimental_model_not_operationally_approved','settlement_and_context_require_operational_review',
        ...(!availability.verified?['bet365_playability_not_manually_confirmed']:[])],operationallyApproved:false});
  }
  const baselines=[];
  for(const e of journal?.entries??[]) {
    const groups=new Map();for(const s of screening.filter(s=>s.fixtureId===e.fixtureId)){const a=groups.get(s.marketId)||[];a.push(s);groups.set(s.marketId,a);}
    for(const [marketId,rows] of groups) {
      const ordered=outcomes.map(o=>rows.filter(r=>r.outcome===o));
      const complete=rows.length===3&&ordered.every(a=>a.length===1&&!a[0].reasons.length);
      if(!complete){baselines.push({fixtureId:e.fixtureId,marketId,status:'INCOMPLETE_OR_UNUSABLE',probabilities:null});continue;}
      const board=ordered.map(a=>a[0]),inverse=board.map(s=>1/s.price),sum=inverse.reduce((a,b)=>a+b,0);
      baselines.push({fixtureId:e.fixtureId,marketId,status:'COMPLETE',method:'multiplicative_inverse_odds_normalization',
        prices:board.map(s=>s.price),probabilities:inverse.map(v=>v/sum),overround:sum-1,quoteIds:board.map(s=>s.quoteId),
        manualPlayabilityVerified:board.every(s=>s.availability.verified&&s.availability.verification?.schema==='lamultipla-bet365-verification-v2'),forecastMinusMarket:e.probabilities.map((v,k)=>v-inverse[k]/sum)});
    }
  }
  const candidates=screening.filter(s=>s.classification==='SHADOW_CANDIDATE').sort(rankValue);
  const count=k=>screening.filter(s=>s.classification===k).length;
  return {schema:'lamultipla-shadow-opportunities-v1',screenedAtUtc:new Date(clock).toISOString(),policy:POLICY,
    globalIssues:unique(globalIssues),reportSha256:fingerprint(report),journalSha256:fingerprint(journal),candidates,screening,baselines,
    counts:{examined:screening.length,unsupported,insufficient:count('INSUFFICIENT_DATA'),noValue:count('NO_VALUE'),uncertain:count('UNCERTAIN_VALUE'),candidates:candidates.length},
    state:candidates.length?'CANDIDATES_FOUND':screening.length&&!count('INSUFFICIENT_DATA')?(count('UNCERTAIN_VALUE')?'UNCERTAIN_VALUE':'NO_VALUE'):'INSUFFICIENT_DATA',
    uncertaintyLimitation:'Marginal bootstrap intervals are not simultaneous or proof of profitable value',operationallyApproved:false};
}
