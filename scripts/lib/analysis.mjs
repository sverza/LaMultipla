import { SafeError } from './safe-error.mjs';
import { fingerprint } from './odds-report.mjs';
import { effectiveAvailability } from './availability.mjs';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const date = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

export function settlementEV(price, probabilities) {
  const names = ['win', 'halfWin', 'push', 'halfLoss', 'loss'];
  if (!probabilities || names.some(k => !Number.isFinite(probabilities[k]) || probabilities[k] < 0 || probabilities[k] > 1)
      || Math.abs(names.reduce((sum, k) => sum + probabilities[k], 0) - 1) > 1e-6) return null;
  return probabilities.win * price + probabilities.halfWin * (1 + (price - 1) / 2)
    + probabilities.push + probabilities.halfLoss / 2 - 1;
}

export function analyzeReport(report, assessment = {}, { now = new Date(), maxObservationAgeMinutes = 30 } = {}) {
  if (report?.schema !== 'lamultipla-oddspapi-private-v2' || !Array.isArray(report.selections)
      || report.source?.bookmaker !== 'bet365.it' || report.source?.tournamentId !== 23) throw new SafeError('Report privato v2 bet365.it Serie A richiesto');
  const clock = new Date(now).getTime();
  if (!Number.isFinite(clock) || !Number.isFinite(maxObservationAgeMinutes) || maxObservationAgeMinutes <= 0) throw new SafeError('Orologio/policy analisi non valido');
  const globalIssues = [];
  if (assessment.reportSha256 !== fingerprint(report)) globalIssues.push('assessment_not_bound_to_this_report');
  if (!report.round?.verified) globalIssues.push('round_not_verified');
  if (!date(report.fetchedAtUtc) || clock - Date.parse(report.fetchedAtUtc) > maxObservationAgeMinutes * 60000
      || Date.parse(report.fetchedAtUtc) > clock) globalIssues.push('observation_expired_or_invalid');
  if (!nonempty(assessment.dependencyReview)) globalIssues.push('cross_match_dependencies_not_reviewed');
  const model = assessment.model;
  if (!model || model.probabilitySource !== 'independent_model' || !nonempty(model.id) || !nonempty(model.version)
      || !nonempty(model.methodologyArtifact) || !Array.isArray(model.validatedMarketTypes)
      || !date(model.trainingCutoffUtc) || Date.parse(model.trainingCutoffUtc) > clock
      || !nonempty(model.calibration?.artifact) || !nonempty(model.calibration?.metric)
      || model.calibration.outOfSample !== true || !date(model.calibration.evaluatedAtUtc)
      || Date.parse(model.calibration.evaluatedAtUtc) > clock
      || !Number.isFinite(model.calibration?.value) || !Number.isInteger(model.calibration?.sampleSize) || model.calibration.sampleSize < 1) {
    globalIssues.push('independent_model_and_validation_evidence_required');
  }
  if (model?.id === 'lamultipla-goals-v1' && model.operationallyApproved !== true)
    globalIssues.push('independent_model_requires_operational_review');
  const estimates = new Map(), duplicateIds = new Set();
  for (const item of Array.isArray(assessment.estimates) ? assessment.estimates : []) {
    if (estimates.has(item.quoteId)) duplicateIds.add(item.quoteId);
    estimates.set(item.quoteId, item);
  }
  const screening = report.selections.map(q => {
    const e = estimates.get(q.quoteId), reasons = [...globalIssues];
    if (!e) reasons.push('no_independent_estimate');
    if (!model?.validatedMarketTypes?.includes(q.marketType)) reasons.push('model_not_validated_for_market_type');
    if (duplicateIds.has(q.quoteId)) reasons.push('conflicting_estimates');
    const availability = effectiveAvailability(report, q, e?.manualVerification, clock, maxObservationAgeMinutes);
    if ((q.active !== true && !availability.override) || (q.availability === 'blocked' && !availability.override)
        || availability.negative || q.bookmaker !== 'bet365.it' || q.tournamentId !== 23 || !Number.isFinite(q.price) || q.price <= 1 || q.suspended !== false
        || q.bookmakerIsActive !== true || ![0, 1].includes(q.statusId)
        || !date(q.kickoffUtc) || Date.parse(q.kickoffUtc) <= clock) reasons.push('selection_not_usable');
    if (!availability.verified) reasons.push('exact_quote_manual_verification_required');
    if (q.issues?.some(issue => ['market_identity_incomplete', 'invalid_line', 'player_identity_incomplete',
      'event_identity_incomplete', 'duplicate_fixture_conflict', 'unexpected_player_in_standard_market'].includes(issue))) reasons.push('unresolved_identity');
    if (!e?.settlementVerified || !nonempty(e?.settlementRules)) reasons.push('settlement_rules_not_verified');
    if (q.playerProp && !nonempty(e?.context?.lineupAndMinutes)) reasons.push('player_lineup_minutes_missing');
    if (['absences', 'form', 'calendar', 'tacticalContext', 'dataSources'].some(k => !nonempty(e?.context?.[k]))) reasons.push('context_evidence_missing');
    if (!date(e?.estimatedAtUtc) || Date.parse(e.estimatedAtUtc) > clock
        || clock - Date.parse(e.estimatedAtUtc) > 24 * 3600000) reasons.push('estimate_time_missing_or_old');
    if (model && date(model.trainingCutoffUtc) && Date.parse(model.trainingCutoffUtc) >= Date.parse(q.kickoffUtc)) reasons.push('model_training_after_event');
    const ev = q.price > 1 ? settlementEV(q.price, e?.probabilities) : null;
    if (ev === null) reasons.push('settlement_probabilities_invalid_or_missing');
    if (ev !== null && ev <= 0) reasons.push('no_positive_expected_value');
    return { quoteId: q.quoteId, fixtureId: q.fixtureId, marketType: q.marketType,
      assessmentPresent: Boolean(e), noBetCause: reasons.some(r => r !== 'no_positive_expected_value')
        ? 'INSUFFICIENT_EVIDENCE' : reasons.length ? 'NO_VALUE' : null,
      availability, expectedValuePerUnit: ev, inversePrice: q.price > 1 ? 1 / q.price : null,
      reasons: [...new Set(reasons)], eligibleForHumanReview: reasons.length === 0 };
  });
  const shortlist = screening.filter(s => s.eligibleForHumanReview).sort((a, b) => b.expectedValuePerUnit - a.expectedValuePerUnit);
  return { schema: 'lamultipla-private-analysis-v1', analyzedAtUtc: new Date(clock).toISOString(),
    reportSha256: fingerprint(report), assessmentSha256: fingerprint(assessment),
    decision: shortlist.length ? 'REVIEW_REQUIRED' : 'NO_BET',
    noBetCause: shortlist.length ? null : screening.some(s => s.assessmentPresent) && screening.filter(s => s.assessmentPresent).every(s => s.noBetCause === 'NO_VALUE')
      ? 'NO_VALUE' : 'INSUFFICIENT_EVIDENCE',
    rules: { maxStakeEUR: 3, maxSlipsPerMatchday: 1, maxSelections: 6,
      noAutomaticSlip: true, noAutomaticPublication: true, jointProbabilityNotComputed: true,
      probabilitiesAreModelInputsNotPriceDerived: true, calibrationEvidenceIsNotAutomaticallyCertified: true },
    counts: { examined: screening.length, withEstimates: estimates.size, eligibleForHumanReview: shortlist.length },
    globalIssues, shortlist, screening };
}
