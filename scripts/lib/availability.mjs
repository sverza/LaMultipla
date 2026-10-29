import { fingerprint } from './odds-report.mjs';

export function quoteIdentity(q) {
  return Object.fromEntries(['fixtureId', 'fixture', 'participantIds', 'kickoffUtc', 'tournamentId', 'seasonId', 'bookmakerFixtureId', 'marketId', 'marketName', 'marketType', 'period', 'line',
    'playerKey', 'playerName', 'outcomeId', 'outcome'].map(k => [k, q[k] ?? null]));
}
export function verificationTemplate(report, q) {
  return { schema: 'lamultipla-bet365-verification-v2', reportSha256: fingerprint(report),
    domain: 'bet365.it', origin: 'manual_bet365_it', quoteId: q.quoteId,
    identity: quoteIdentity(q), availability: null, observedPrice: null,
    verifiedAtUtc: null, reviewer: '', evidence: '' };
}
export function effectiveAvailability(report, q, v, clock, maxAgeMinutes) {
  const provider = { active: q.active, marketActive: q.marketActive,
    bookmakerIsActive: q.bookmakerIsActive, suspended: q.suspended, availability: q.availability };
  const validTime = typeof v?.verifiedAtUtc === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v.verifiedAtUtc)
    && Number.isFinite(Date.parse(v.verifiedAtUtc)) && Date.parse(v.verifiedAtUtc) <= clock
    && clock - Date.parse(v.verifiedAtUtc) <= maxAgeMinutes * 60000
    && Date.parse(v.verifiedAtUtc) >= Date.parse(report.fetchedAtUtc);
  const basic = v?.domain === 'bet365.it' && v.quoteId === q.quoteId && v.observedPrice === q.price && validTime;
  const exact = Boolean(basic && v.schema === 'lamultipla-bet365-verification-v2'
    && v.reportSha256 === fingerprint(report) && v.origin === 'manual_bet365_it'
    && typeof v.reviewer === 'string' && v.reviewer.trim().length > 0
    && typeof v.evidence === 'string' && v.evidence.trim().length > 0
    && v.identity && typeof v.identity === 'object' && fingerprint(v.identity) === fingerprint(quoteIdentity(q)));
  const positive = exact && v.availability === 'available';
  const negative = exact && v.availability === 'unavailable';
  // Existing v1 attestations remain valid only for provider-active selections.
  const legacy = basic && !v.schema && q.active === true;
  const verified = positive || legacy;
  const override = positive && q.active === false;
  return { provider, state: negative ? 'manually_unavailable' : override ? 'manually_available_provider_inactive'
    : verified ? 'manually_available' : q.active !== true ? 'reserved_observation' : 'provider_active_unverified',
    verified, override, negative, verification: exact ? structuredClone(v) : null,
    verificationSha256: exact ? fingerprint(v) : null };
}
