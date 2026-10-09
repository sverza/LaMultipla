import { SafeError } from './safe-error.mjs';
import { createHash } from 'node:crypto';

export const BOOKMAKER = 'bet365.it';
export const TOURNAMENT_ID = 23;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const entries = value => object(value) ? Object.entries(value) : [];
const flag = value => typeof value === 'boolean' ? value : null;
const label = value => typeof value === 'string' ? value : '';
const time = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function catalogArray(raw) {
  const values = Array.isArray(raw) ? raw.flat(Infinity) : raw?.markets ?? raw?.data;
  if (!Array.isArray(values) || values.some(m => !object(m) || m.marketId == null)) throw new SafeError('Catalogo mercati non riconosciuto');
  return values;
}

export function fixturesArray(raw) {
  if (object(raw) && raw.fixtureId) return [raw];
  const values = Array.isArray(raw) ? raw.flat(Infinity) : raw?.fixtures ?? raw?.data ?? (object(raw) ? Object.values(raw) : null);
  if (!Array.isArray(values) || values.some(f => !object(f) || !f.fixtureId)) throw new SafeError('Risposta quote non riconosciuta: nessuna interpretazione implicita');
  return values;
}

export function validateRound(round) {
  if (!object(round) || !/^\d{4}\/\d{2}$/.test(round.season)
      || Number(round.season.slice(5)) !== (Number(round.season.slice(0, 4)) + 1) % 100
      || !Number.isInteger(round.matchday) || round.matchday < 1 || round.matchday > 38
      || !time(round.fromUtc) || !time(round.toUtc) || Date.parse(round.toUtc) <= Date.parse(round.fromUtc)
      || Date.parse(round.toUtc) - Date.parse(round.fromUtc) > 14 * 86400000) throw new SafeError('Manifest giornata non valido: stagione, giornata e intervallo UTC obbligatori (massimo 14 giorni)');
  const year = Number(round.season.slice(0, 4));
  if (Date.parse(round.fromUtc) < Date.UTC(year, 6, 1) || Date.parse(round.toUtc) > Date.UTC(year + 1, 6, 1)) {
    throw new SafeError('Intervallo fuori dalla stagione dichiarata');
  }
  if (round.fixtureIds !== undefined && (!Array.isArray(round.fixtureIds) || round.fixtureIds.length !== 10
      || round.fixtureIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(round.fixtureIds).size !== 10)) {
    throw new SafeError('Conferma giornata: fornire esattamente 10 fixtureIds distinti');
  }
  return { season: round.season, matchday: round.matchday, fromUtc: round.fromUtc, toUtc: round.toUtc,
    fixtureIds: round.fixtureIds ?? null };
}

function italianUrl(raw) {
  try { const u = new URL(raw); return u.protocol === 'https:' && (u.hostname === 'bet365.it' || u.hostname.endsWith('.bet365.it')) ? u.origin + u.pathname + u.hash : null; }
  catch { return null; }
}

// Tags aid screening, never rewrite provider settlement semantics (especially Bookings).
function tags(definition) {
  const name = String(definition?.marketName ?? '').toLowerCase();
  return ['corner', 'booking', 'card', 'shot', 'goal', 'foul', 'tackle', 'assist', 'handicap', 'multigoal', 'builder']
    .filter(word => name.includes(word));
}

export function buildReport(rawFixtures, rawCatalog, { round, observedAt = new Date(), source = 'offline', maxChangeAgeHours = 24 } = {}) {
  const target = validateRound(round);
  const now = new Date(observedAt);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(maxChangeAgeHours) || maxChangeAgeHours <= 0) throw new SafeError('Data/criterio temporale non valido');
  const catalog = catalogArray(rawCatalog);
  const definitions = new Map();
  const conflictingDefinitions = new Set();
  for (const m of catalog) {
    const key = String(m.marketId);
    if (definitions.has(key) && fingerprint(definitions.get(key)) !== fingerprint(m)) conflictingDefinitions.add(key);
    else definitions.set(key, m);
  }
  const all = fixturesArray(rawFixtures);
  const fixtures = new Map();
  const conflictingFixtures = new Set();
  const anomalies = [];
  for (const f of all) {
    const id = String(f.fixtureId);
    if (fixtures.has(id)) {
      if (fingerprint(fixtures.get(id)) !== fingerprint(f)) { conflictingFixtures.add(id); anomalies.push({ fixtureId: id, issue: 'duplicate_fixture_conflict' }); }
    } else fixtures.set(id, f);
  }
  const candidates = [...fixtures.values()].filter(f => Number(f.tournamentId) === TOURNAMENT_ID
    && time(f.startTime) && Date.parse(f.startTime) >= Date.parse(target.fromUtc) && Date.parse(f.startTime) < Date.parse(target.toUtc));
  // Without fixtureIds this is discovery only, never a silently inferred matchday.
  const selected = candidates.filter(f => !target.fixtureIds || target.fixtureIds.includes(String(f.fixtureId)))
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || String(a.fixtureId).localeCompare(String(b.fixtureId)));
  const missingFixtureIds = target.fixtureIds?.filter(id => !selected.some(f => String(f.fixtureId) === id)) ?? [];
  const roundVerified = Boolean(target.fixtureIds && !missingFixtureIds.length && selected.length === 10 && !conflictingFixtures.size);
  if (!roundVerified) anomalies.push({ issue: 'round_not_confirmed_or_partial', missingFixtureIds, found: selected.length });
  const selections = [], coverage = [], familyCounts = new Map();
  for (const f of selected) {
    const fixtureId = String(f.fixtureId), b = f.bookmakerOdds?.[BOOKMAKER];
    const eventIssues = [];
    if (!time(f.startTime) || Date.parse(f.startTime) <= now.getTime() || ![0, 1].includes(f.statusId)) eventIssues.push('not_confirmed_pregame');
    if (Number(f.sportId) !== 10 || !label(f.participant1Name) || !label(f.participant2Name)) eventIssues.push('event_identity_incomplete');
    if (conflictingFixtures.has(fixtureId)) eventIssues.push('duplicate_fixture_conflict');
    if (!b) anomalies.push({ fixtureId, issue: 'bookmaker_absent' });
    const active1x2 = new Set();
    const marketCount = entries(b?.markets).length;
    const startIndex = selections.length;
    for (const [marketId, market] of entries(b?.markets)) {
      const d = definitions.get(marketId);
      const outcomeIds = Array.isArray(d?.outcomes) ? d.outcomes.map(o => String(o?.outcomeId)) : [];
      const ambiguousOutcomes = outcomeIds.length !== new Set(outcomeIds).size;
      const outcomes = new Map(Array.isArray(d?.outcomes) ? d.outcomes.map(o => [String(o.outcomeId), o]) : []);
      for (const [outcomeId, outcome] of entries(market?.outcomes)) {
        const players = entries(outcome?.players);
        if (!players.length) anomalies.push({ fixtureId, marketId, outcomeId, issue: 'missing_players_or_quote' });
        for (const [playerKey, s] of players) {
          const o = outcomes.get(outcomeId);
          const numeric = (typeof s?.price === 'number' || typeof s?.price === 'string') && String(s.price).trim() !== '' ? Number(s.price) : NaN;
          const price = Number.isFinite(numeric) && numeric > 1 ? numeric : null;
          const issues = [...eventIssues];
          if (!roundVerified) issues.push('round_unconfirmed');
          if (price === null) issues.push('invalid_decimal_price');
          if (!d || !o || !label(d.marketName) || !label(d.marketType) || !label(o.outcomeName) || !label(d.period)
              || typeof d.playerProp !== 'boolean' || Number(d.sportId) !== 10 || conflictingDefinitions.has(marketId) || ambiguousOutcomes) issues.push('market_identity_incomplete');
          if (d?.handicap != null && (typeof d.handicap !== 'number' || !Number.isFinite(d.handicap))) issues.push('invalid_line');
          if (d?.playerProp === true && (playerKey === '0' || !label(s?.playerName))) issues.push('player_identity_incomplete');
          if (d?.playerProp === false && playerKey !== '0') issues.push('unexpected_player_in_standard_market');
          if (flag(market?.marketActive) !== true) issues.push('market_flag_false_or_unknown');
          if (flag(s?.active) === null) issues.push('selection_status_unknown');
          if (flag(b?.bookmakerIsActive) === null || flag(b?.suspended) === null) issues.push('bookmaker_status_unknown');
          const changeTime = time(s?.changedAt) ? Date.parse(s.changedAt) : null;
          if (changeTime === null) issues.push('change_timestamp_missing_or_invalid');
          else if (changeTime > now.getTime()) issues.push('change_timestamp_in_future');
          else if (now.getTime() - changeTime > maxChangeAgeHours * 3600000) issues.push('old_change_requires_verification');
          if (s?.bookmakerChangedAt != null && (!time(s.bookmakerChangedAt) || Date.parse(s.bookmakerChangedAt) > now.getTime())) issues.push('bookmaker_timestamp_invalid');
          if (/booking/i.test(d?.marketName ?? '')) issues.push('bookings_settlement_unverified');
          if (/builder|multi.?goal|combination|combo/i.test(d?.marketName ?? '')) issues.push('combination_settlement_unverified');
          const blocked = price === null || flag(s?.active) === false || b?.suspended === true || b?.bookmakerIsActive === false || eventIssues.includes('not_confirmed_pregame');
          const availability = blocked ? 'blocked' : issues.length ? 'review' : 'candidate';
          const identity = [fixtureId, BOOKMAKER, marketId, outcomeId, playerKey];
          const row = {
            quoteId: fingerprint(identity), fixtureId, fixture: [label(f.participant1Name), label(f.participant2Name)],
            participantIds: [f.participant1Id ?? null, f.participant2Id ?? null], kickoffUtc: f.startTime,
            tournamentId: TOURNAMENT_ID, seasonId: f.seasonId ?? null, statusId: f.statusId ?? null,
            bookmaker: BOOKMAKER, bookmakerFixtureId: b?.bookmakerFixtureId ?? null,
            fixtureUrl: italianUrl(b?.fixturePath), bookmakerIsActive: flag(b?.bookmakerIsActive), suspended: flag(b?.suspended),
            marketId, bookmakerMarketId: market?.bookmakerMarketId ?? null,
            marketName: label(d?.marketName), marketType: label(d?.marketType) || 'unknown',
            period: d?.period ?? null, line: d?.handicap ?? null, playerProp: flag(d?.playerProp), tags: tags(d),
            outcomeId, outcome: label(o?.outcomeName), playerKey, playerName: s?.playerName ?? null,
            bookmakerOutcomeId: s?.bookmakerOutcomeId ?? null, mainLine: flag(s?.mainLine),
            price, active: flag(s?.active), marketActive: flag(market?.marketActive),
            observedAtUtc: now.toISOString(), changedAt: s?.changedAt ?? null,
            bookmakerChangedAt: s?.bookmakerChangedAt ?? null, fixtureUpdatedAt: f.updatedAt ?? null,
            availability, issues, manuallyVerified: false
          };
          selections.push(row);
          if (row.active === true && price !== null) familyCounts.set(row.marketType, (familyCounts.get(row.marketType) ?? 0) + 1);
          if (row.active === true && price !== null && !blocked && d?.marketType === '1x2' && d.period === 'fulltime'
              && d.marketName === 'Full Time Result' && d.playerProp === false && playerKey === '0' && !conflictingDefinitions.has(marketId) && !ambiguousOutcomes) active1x2.add(row.outcome);
        }
      }
    }
    const missing = ['1', 'X', '2'].filter(name => !active1x2.has(name));
    if (missing.length) anomalies.push({ fixtureId, issue: 'incomplete_active_1x2', missing });
    const rows = selections.slice(startIndex);
    coverage.push({ fixtureId, fixture: [label(f.participant1Name), label(f.participant2Name)], kickoffUtc: f.startTime,
      marketCount, selections: rows.length, active: rows.filter(r => r.active === true).length,
      candidate: rows.filter(r => r.availability === 'candidate').length, missing1x2: missing,
      marketTypes: [...new Set(rows.map(r => r.marketType))].sort() });
  }
  const summary = { returnedFixtures: all.length, scopedFixtures: selected.length, expectedFixtures: 10,
    pricedSelections: selections.filter(s => s.price !== null).length, selections: selections.length,
    selectionActiveTrue: selections.filter(s => s.active === true).length,
    selectionActiveFalse: selections.filter(s => s.active === false).length,
    selectionActiveUnknown: selections.filter(s => s.active === null).length,
    marketFlagFalseWithSelectionActive: selections.filter(s => s.active === true && s.marketActive === false).length,
    candidate: selections.filter(s => s.availability === 'candidate').length,
    review: selections.filter(s => s.availability === 'review').length,
    blocked: selections.filter(s => s.availability === 'blocked').length,
    '1x2IncompleteFixtures': coverage.filter(f => f.missing1x2.length).length };
  return { schema: 'lamultipla-oddspapi-private-v2', fetchedAtUtc: now.toISOString(),
    source: { provider: 'OddsPapi', bookmaker: BOOKMAKER, tournamentId: TOURNAMENT_ID, mode: source,
      fixturesSha256: fingerprint(rawFixtures), catalogSha256: fingerprint(rawCatalog) },
    round: { ...target, verified: roundVerified, missingFixtureIds },
    policy: { maxChangeAgeHours, changedAtIsNotSyncTime: true, providerFlagIsNotPlayabilityProof: true,
      missingOddsAreNeverFilled: true, marketActiveFalseNeedsReview: true, noCombinedPrices: true },
    summary, marketFamilies: Object.fromEntries([...familyCounts].sort(([a], [b]) => a.localeCompare(b))), coverage, anomalies, selections };
}
