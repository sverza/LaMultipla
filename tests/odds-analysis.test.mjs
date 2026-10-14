import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, fingerprint } from '../scripts/lib/odds-report.mjs';
import { analyzeReport, settlementEV } from '../scripts/lib/analysis.mjs';
import { sample, catalog, round, observedAt } from './fixtures/oddspapi.mjs';
const report = () => buildReport(sample(), catalog, { round, observedAt });
const analyze = (r, a) => analyzeReport(r, a, { now: observedAt });
function assessment(r, q = r.selections[0]) {
  return { reportSha256: fingerprint(r), dependencyReview: 'SYNTHETIC review; no real selections',
    model: { id: 'synthetic-independent-test-model', version: 'test-only', probabilitySource: 'independent_model',
      methodologyArtifact: 'synthetic/test-only', validatedMarketTypes: [q.marketType],
      trainingCutoffUtc: '2026-09-01T00:00:00Z', calibration: { artifact: 'synthetic/test-only', metric: 'Brier', value: 0.2, sampleSize: 100,
        outOfSample: true, evaluatedAtUtc: '2026-10-01T00:00:00Z' } },
    estimates: [{ quoteId: q.quoteId, estimatedAtUtc: observedAt, probabilities: { win: 0.6, halfWin: 0, push: 0, halfLoss: 0, loss: 0.4 },
      context: { absences: 'synthetic', form: 'synthetic', calendar: 'synthetic', tacticalContext: 'synthetic', dataSources: 'synthetic', lineupAndMinutes: 'synthetic' },
      settlementVerified: true, settlementRules: 'synthetic fulltime',
      manualVerification: { domain: 'bet365.it', quoteId: q.quoteId, observedPrice: q.price, verifiedAtUtc: observedAt } }] };
}
test('no independently validated estimates means NO_BET across all markets', () => {
  const r = report(), a = analyze(r, {});
  assert.equal(a.decision, 'NO_BET'); assert.equal(a.counts.examined, r.selections.length);
  assert.ok(a.screening.every(x => x.expectedValuePerUnit === null));
  assert.equal(a.rules.maxStakeEUR, 3); assert.equal(a.rules.maxSlipsPerMatchday, 1); assert.equal(a.rules.maxSelections, 6);
});
test('valid independent synthetic evidence produces human review only, never a slip', () => {
  const r = report(), result = analyze(r, assessment(r));
  assert.equal(result.decision, 'REVIEW_REQUIRED'); assert.equal(result.shortlist.length, 1);
  assert.ok(Math.abs(result.shortlist[0].expectedValuePerUnit - 0.26) < 1e-9);
  assert.equal(result.rules.jointProbabilityNotComputed, true);
  assert.equal(result.slip, undefined);
});
test('price-implied probabilities, missing context, changed price or mismatched report cannot pass', () => {
  const r = report();
  for (const change of [a => { a.model.probabilitySource = 'implied_odds'; }, a => { delete a.estimates[0].context.form; },
    a => { a.estimates[0].manualVerification.observedPrice = 9; }, a => { a.reportSha256 = 'other-report'; },
    a => { a.model.calibration = null; }, a => { a.model.validatedMarketTypes = []; },
    a => { a.estimates[0].probabilities.win = NaN; }]) {
    const a = assessment(r); change(a); assert.equal(analyze(r, a).decision, 'NO_BET');
  }
});
test('marketActive=false can pass only with exact manual verification; inactive cannot', () => {
  const f = sample(); f[0].bookmakerOdds['bet365.it'].markets[101].marketActive = false;
  const r = buildReport(f, catalog, { round, observedAt });
  assert.equal(r.selections[0].availability, 'review');
  assert.equal(analyze(r, assessment(r)).decision, 'REVIEW_REQUIRED');
  r.selections[0].active = false; assert.equal(analyze(r, assessment(r)).decision, 'NO_BET');
});
test('all player/statistic markets are eligible for evidence-based screening', () => {
  const r = report();
  for (const id of ['301', '901', '1001', '1101', '1201', '501', '601', '701', '1301', '1401', '1501']) {
    const q = r.selections.find(q => q.marketId === id); assert.equal(analyze(r, assessment(r, q)).decision, 'REVIEW_REQUIRED');
  }
  const a = assessment(r, r.selections.find(q => q.marketId === '301')); delete a.estimates[0].context.lineupAndMinutes;
  assert.equal(analyze(r, a).decision, 'NO_BET');
});
test('refund and Asian quarter-line EV uses settlement probabilities, not binary win/loss', () => {
  assert.ok(Math.abs(settlementEV(2, { win: 0.4, halfWin: 0.1, push: 0.2, halfLoss: 0.1, loss: 0.2 }) - 0.2) < 1e-9);
  assert.equal(settlementEV(2, { win: 1, halfWin: 0, push: 1, halfLoss: 0, loss: 0 }), null);
});
test('stale observations and duplicate assessments cannot be promoted', () => {
  const r = report(), a = assessment(r); a.estimates.push(structuredClone(a.estimates[0]));
  assert.equal(analyze(r, a).decision, 'NO_BET');
  assert.equal(analyzeReport(r, assessment(r), { now: '2026-10-09T22:30:00Z' }).decision, 'NO_BET');
});

test('inactive exact manual confirmation passes without changing original provider flags', async () => {
  const { verificationTemplate } = await import('../scripts/lib/availability.mjs');
  const r = report(), q = r.selections[0]; q.active = false; q.availability = 'blocked';
  q.changedAt = '2026-09-01T00:00:00Z'; q.issues.push('old_change_requires_verification');
  const a = assessment(r);
  a.estimates[0].manualVerification = { ...verificationTemplate(r, q), availability: 'available',
    observedPrice: q.price, verifiedAtUtc: observedAt, reviewer: 'synthetic', evidence: 'synthetic observation' };
  const before = structuredClone(r), result = analyze(r, a);
  assert.equal(result.decision, 'REVIEW_REQUIRED'); assert.deepEqual(r, before);
  assert.equal(result.shortlist[0].availability.state, 'manually_available_provider_inactive');
  assert.equal(result.shortlist[0].availability.provider.active, false);
  for (const field of ['fixtureId', 'bookmakerFixtureId', 'marketId', 'period', 'line', 'playerKey', 'playerName', 'outcomeId', 'outcome']) {
    const bad = structuredClone(a); bad.estimates[0].manualVerification.identity[field] = 'wrong';
    assert.equal(analyze(r, bad).decision, 'NO_BET', field);
  }
  for (const change of [v => { v.reportSha256 = 'wrong'; }, v => { v.availability = 'unavailable'; },
    v => { v.domain = 'bet365.com'; }, v => { v.origin = 'api'; }, v => { v.observedPrice += 0.01; },
    v => { v.verifiedAtUtc = '2026-09-01T00:00:00Z'; }, v => { v.reviewer = ''; }]) {
    const bad = structuredClone(a); change(bad.estimates[0].manualVerification); assert.equal(analyze(r, bad).decision, 'NO_BET');
  }
  for (const change of [q => { q.suspended = true; }, q => { q.bookmakerIsActive = false; },
    q => { q.statusId = 2; }, q => { q.price = null; }, q => { q.issues.push('invalid_line'); }]) {
    const bad = structuredClone(r); change(bad.selections[0]); const b = structuredClone(a); b.reportSha256 = fingerprint(bad);
    b.estimates[0].manualVerification.reportSha256 = fingerprint(bad);
    assert.equal(analyze(bad, b).decision, 'NO_BET');
  }
});
test('negative manual observation blocks an otherwise active selection', async () => {
  const { verificationTemplate } = await import('../scripts/lib/availability.mjs');
  const r = report(), q = r.selections[0], a = assessment(r);
  a.estimates[0].manualVerification = { ...verificationTemplate(r, q), availability: 'unavailable',
    observedPrice: q.price, verifiedAtUtc: observedAt, reviewer: 'synthetic', evidence: 'synthetic' };
  assert.equal(analyze(r, a).decision, 'NO_BET');
});

test('NO_VALUE differs from incomplete evidence on the selections actually assessed',()=>{
  const r=report(),a=assessment(r);a.estimates[0].probabilities={win:.1,halfWin:0,push:0,halfLoss:0,loss:.9};
  assert.equal(analyze(r,a).noBetCause,'NO_VALUE');
  delete a.estimates[0].settlementRules;assert.equal(analyze(r,a).noBetCause,'INSUFFICIENT_EVIDENCE');
});

test('actual experimental goals model remains gated pending operational evidence review',()=>{
  const r=report(),a=assessment(r);a.model.id='lamultipla-goals-v1';a.model.operationallyApproved=false;
  assert.ok(analyze(r,a).globalIssues.includes('independent_model_requires_operational_review'));
  assert.equal(analyze(r,a).decision,'NO_BET');
});
