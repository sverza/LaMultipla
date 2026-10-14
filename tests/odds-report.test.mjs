import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, validateRound } from '../scripts/lib/odds-report.mjs';
import { sample, catalog, round, observedAt, quote } from './fixtures/oddspapi.mjs';
const report = (fixtures = sample(), markets = catalog, target = round) => buildReport(fixtures, markets, { round: target, observedAt });
const book = f => f.bookmakerOdds['bet365.it'];

test('scopes a confirmed round; IDs preserve player, line and period independently', () => {
  const r = report();
  assert.equal(r.round.verified, true);
  assert.equal(r.coverage.length, 10);
  assert.equal(r.summary['1x2IncompleteFixtures'], 0);
  assert.equal(new Set(r.selections.map(q => q.quoteId)).size, r.selections.length);
  const props = r.selections.filter(q => q.fixtureId === 'synthetic-0' && q.playerProp);
  assert.equal(props.find(q => q.marketId === '301').playerName, 'Synthetic Player A');
  assert.deepEqual(props.filter(q => q.playerKey === '10' && q.marketType === 'player-shots').map(q => q.line), [1.5, 2.5]);
  assert.equal(r.selections.find(q => q.marketId === '701').line, -0.25);
  assert.equal(r.selections.find(q => q.marketId === '801').period, '1st-half');
  assert.ok(r.marketFamilies['player-fouls']);
  assert.ok(r.marketFamilies['player-goals']);
  assert.ok(r.marketFamilies['player-tackles']);
  assert.ok(r.marketFamilies['player-assists']);
});
test('marketActive=false retains active quote for review; inactive selection stays blocked', () => {
  const f = sample(); book(f[0]).markets[201].marketActive = false;
  book(f[0]).markets[101].outcomes[101].players[0].active = false;
  const r = report(f);
  const q = r.selections.find(q => q.fixtureId === 'synthetic-0' && q.marketId === '201');
  assert.equal(q.active, true); assert.equal(q.marketActive, false); assert.equal(q.availability, 'review');
  assert.equal(r.summary.marketFlagFalseWithSelectionActive, 2);
  assert.deepEqual(r.coverage[0].missing1x2, ['1']);
  assert.equal(r.selections[0].availability, 'blocked');
});
test('missing 1X2 is not repaired by an inactive stale single-event price', () => {
  const f = sample(); delete book(f[0]).markets[101].outcomes[101];
  const bulk = report(f);
  assert.deepEqual(bulk.coverage[0].missing1x2, ['1']);
  book(f[0]).markets[101].outcomes[101] = { players: { 0: quote({ active: false, price: 1.14, changedAt: '2026-09-30T12:00:00Z' }) } };
  const single = report(f[0]);
  assert.equal(single.selections.find(q => q.outcomeId === '101').availability, 'blocked');
  assert.deepEqual(single.coverage[0].missing1x2, ['1']);
  assert.equal(bulk.selections.filter(q => q.fixtureId === 'synthetic-0').length + 1, single.selections.length);
});
test('discovery and incomplete round remain unconfirmed, never first-ten truncation', () => {
  const f = sample(); const withoutIds = { ...round }; delete withoutIds.fixtureIds;
  assert.equal(report(f, catalog, withoutIds).round.verified, false);
  assert.equal(report(f.slice(0, 9)).round.verified, false);
  f.push({ ...f[0], fixtureId: 'other-matchday' });
  assert.equal(report(f).coverage.length, 10);
  assert.equal(report(f, catalog, withoutIds).coverage.length, 11);
  assert.ok(report(f, catalog, withoutIds).selections.every(q => q.availability !== 'candidate'));
});
test('different tournament, live or past matches and international bet365 cannot be promoted', () => {
  const f = sample(); f[0].tournamentId = 17; f[1].statusId = 2; f[2].startTime = '2026-10-09T12:00:00Z';
  f[3].bookmakerOdds = { bet365: book(f[3]) };
  const r = report(f);
  assert.equal(r.coverage.length, 8);
  assert.ok(r.selections.filter(q => q.fixtureId === 'synthetic-1').every(q => q.availability === 'blocked'));
  assert.ok(!r.selections.some(q => q.fixtureId === 'synthetic-3'));
});
test('duplicate identical fixtures deduplicate; conflicts are flagged and cannot be candidates', () => {
  const f = sample(); assert.equal(report([...f, structuredClone(f[0])]).selections.length, report(f).selections.length);
  const conflict = structuredClone(f[0]); book(conflict).markets[101].outcomes[101].players[0].price = 9;
  const r = report([...f, conflict]);
  assert.equal(r.round.verified, false);
  assert.ok(r.anomalies.some(a => a.issue === 'duplicate_fixture_conflict'));
});
test('unknown definitions, unknown flags, missing names and invalid quotes stay visible', () => {
  const f = sample(); const b = book(f[0]);
  b.markets[9999] = structuredClone(b.markets[201]);
  delete b.markets[201].outcomes[201].players[0].active;
  b.markets[201].outcomes[202].players[0].price = 'NaN';
  b.markets[301].outcomes[301].players[10].playerName = null;
  const r = report(f);
  assert.equal(r.summary.selectionActiveUnknown, 1);
  assert.equal(r.selections.find(q => q.fixtureId === 'synthetic-0' && q.outcomeId === '202').price, null);
  assert.ok(r.selections.filter(q => q.marketId === '9999').every(q => q.availability === 'review'));
  assert.ok(r.selections.find(q => q.fixtureId === 'synthetic-0' && q.playerKey === '10').issues.includes('player_identity_incomplete'));
});
test('timestamps are observation/change metadata, not certified synchronization', () => {
  const f = sample(); const players = book(f[0]).markets[101].outcomes;
  players[101].players[0].changedAt = null;
  players[102].players[0].changedAt = '2026-10-10T12:00:00Z';
  players[103].players[0].changedAt = '2026-09-30T12:00:00Z';
  const r = report(f);
  assert.ok(r.selections.slice(0, 3).every(q => q.availability === 'review'));
  assert.equal(r.policy.changedAtIsNotSyncTime, true);
});
test('Bookings is preserved without converting it to card count or inventing combined prices', () => {
  const r = report();
  assert.equal(r.selections.find(q => q.marketId === '401').availability, 'review');
  assert.equal(r.selections.find(q => q.marketId === '401').marketName, 'Bookings');
  assert.ok(!r.selections.some(q => /builder|multigoal/i.test(q.marketName)));
});
test('accept documented object, array, wrappers and nested arrays; reject malformed payloads', () => {
  const f = sample();
  for (const shape of [f, [f], { fixtures: f }, { data: f }, Object.fromEntries(f.map(x => [x.fixtureId, x]))]) assert.equal(report(shape, [catalog]).coverage.length, 10);
  assert.equal(report(f[0]).coverage.length, 1);
  assert.throws(() => report({ message: 'error' }));
  assert.throws(() => report(f, { message: 'error' }));
});
test('conflicting catalog identities are not trusted; unsafe bookmaker links are discarded', () => {
  const f = sample(); book(f[0]).fixturePath = 'https://bet365.com/#event';
  const r = report(f, [...catalog, { ...catalog[0], marketName: 'Other result' }]);
  assert.ok(r.selections.filter(q => q.marketId === '101').every(q => q.issues.includes('market_identity_incomplete')));
  assert.equal(r.selections[0].fixtureUrl, null);
});
test('validate season and explicit IDs before acquisition', () => {
  for (const change of [{ season: '2026/28' }, { matchday: 39 }, { fixtureIds: ['x'] }, { fromUtc: '2025-10-10T00:00:00Z' }, { fromUtc: '2026-10-10' }]) assert.throws(() => validateRound({ ...round, ...change }));
});
