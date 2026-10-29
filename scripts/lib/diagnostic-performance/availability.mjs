// Availability semantics copied without policy changes; invariant report hash supplied by the per-call context.
import {digest as fingerprint} from '../prospective/store.mjs';
import {quoteIdentity} from '../availability.mjs';
export function effectiveAvailabilityCached(report, q, v, clock, maxAgeMinutes, context) {
  const provider = { active: q.active, marketActive: q.marketActive,
    bookmakerIsActive: q.bookmakerIsActive, suspended: q.suspended, availability: q.availability };
  const validTime = typeof v?.verifiedAtUtc === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v.verifiedAtUtc)
    && Number.isFinite(Date.parse(v.verifiedAtUtc)) && Date.parse(v.verifiedAtUtc) <= clock
    && clock - Date.parse(v.verifiedAtUtc) <= maxAgeMinutes * 60000
    && Date.parse(v.verifiedAtUtc) >= Date.parse(report.fetchedAtUtc);
  const basic = v?.domain === 'bet365.it' && v.quoteId === q.quoteId && v.observedPrice === q.price && validTime;
  const exact = Boolean(basic && v.schema === 'lamultipla-bet365-verification-v2'
    && v.reportSha256 === context.reportSha256 && v.origin === 'manual_bet365_it'
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
