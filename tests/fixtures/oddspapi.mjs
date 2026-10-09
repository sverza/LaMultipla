// Entirely SYNTHETIC data. Shapes follow OddsPapi v4; these are not actual odds/events.
export const observedAt = '2026-10-09T21:30:00.000Z';
export const round = { season: '2026/27', matchday: 6,
  fromUtc: '2026-10-10T00:00:00Z', toUtc: '2026-10-13T00:00:00Z',
  fixtureIds: Array.from({ length: 10 }, (_, i) => `synthetic-${i}`) };
export const quote = (overrides = {}) => ({ active: true, price: 2.1,
  changedAt: '2026-10-09T20:30:00.000Z', bookmakerChangedAt: null,
  playerName: null, bookmakerOutcomeId: 'synthetic-outcome', mainLine: true, ...overrides });
export const market = (outcomes, overrides = {}) => ({ marketActive: true, bookmakerMarketId: 'synthetic-market',
  outcomes: Object.fromEntries(Object.entries(outcomes).map(([id, players]) => [id, { players }])), ...overrides });
const definition = (id, name, type, outcomes, extra = {}) => ({ marketId: id, marketName: name, marketType: type,
  sportId: 10, playerProp: false, period: 'fulltime', handicap: 0,
  outcomes: outcomes.map(([outcomeId, outcomeName]) => ({ outcomeId, outcomeName })), ...extra });
export const catalog = [
  definition(101, 'Full Time Result', '1x2', [[101, '1'], [102, 'X'], [103, '2']]),
  definition(201, 'Over Under Full Time', 'totals', [[201, 'Over'], [202, 'Under']], { handicap: 2.5 }),
  definition(301, 'Player Shots On Target', 'player-shots', [[301, 'Over'], [302, 'Under']], { playerProp: true, handicap: 1.5 }),
  definition(302, 'Player Shots On Target', 'player-shots', [[303, 'Over'], [304, 'Under']], { playerProp: true, handicap: 2.5 }),
  definition(401, 'Bookings', 'totals', [[401, 'Over'], [402, 'Under']], { handicap: 4.5 }),
  definition(501, 'Corners', 'totals', [[501, 'Over'], [502, 'Under']], { handicap: 8.5 }),
  definition(601, 'Team Goals', 'team-totals', [[601, 'Home Over'], [602, 'Home Under']], { handicap: 1.5 }),
  definition(701, 'Asian Handicap', 'handicap', [[701, '1'], [702, '2']], { handicap: -0.25 }),
  definition(801, 'First Half Result', '1x2', [[801, '1'], [802, 'X'], [803, '2']], { period: '1st-half' }),
  definition(901, 'Player Fouls', 'player-fouls', [[901, 'Over'], [902, 'Under']], { playerProp: true, handicap: 1.5 }),
  definition(1001, 'Player Goals', 'player-goals', [[1001, 'Yes'], [1002, 'No']], { playerProp: true }),
  definition(1101, 'Player Tackles', 'player-tackles', [[1101, 'Over'], [1102, 'Under']], { playerProp: true, handicap: 1.5 }),
  definition(1201, 'Player Assists', 'player-assists', [[1201, 'Yes'], [1202, 'No']], { playerProp: true }),
  definition(1301, 'Double Chance', 'double-chance', [[1301, '1X'], [1302, 'X2'], [1303, '12']]),
  definition(1401, 'Draw No Bet', 'dnb', [[1401, '1'], [1402, '2']]),
  definition(1501, 'Asian Total Goals', 'totals', [[1501, 'Over'], [1502, 'Under']], { handicap: 2.25 }),
];

export function sample() {
  return round.fixtureIds.map((fixtureId, i) => ({ fixtureId, sportId: 10, tournamentId: 23, seasonId: 123,
    participant1Id: i * 2 + 1, participant2Id: i * 2 + 2,
    participant1Name: `Synthetic Home ${i}`, participant2Name: `Synthetic Away ${i}`,
    statusId: 0, hasOdds: true, startTime: '2026-10-10T13:00:00.000Z', updatedAt: observedAt,
    bookmakerOdds: { 'bet365.it': { bookmakerIsActive: true, suspended: false,
      bookmakerFixtureId: `synthetic-book-${i}`, fixturePath: 'https://www.bet365.it/#synthetic-test',
      markets: {
        101: market({ 101: { 0: quote() }, 102: { 0: quote({ price: 3.4 }) }, 103: { 0: quote({ price: 3.7 }) } }),
        201: market({ 201: { 0: quote() }, 202: { 0: quote({ price: 1.8 }) } }),
        301: market({ 301: { 10: quote({ playerName: 'Synthetic Player A' }), 11: quote({ playerName: 'Synthetic Player B' }) } }),
        302: market({ 303: { 10: quote({ playerName: 'Synthetic Player A', price: 3 }) } }),
        401: market({ 401: { 0: quote() } }),
        501: market({ 501: { 0: quote() } }),
        601: market({ 601: { 0: quote() } }),
        701: market({ 701: { 0: quote() } }),
        801: market({ 801: { 0: quote() } }),
        901: market({ 901: { 10: quote({ playerName: 'Synthetic Player A' }) } }),
        1001: market({ 1001: { 10: quote({ playerName: 'Synthetic Player A' }) } }),
        1101: market({ 1101: { 10: quote({ playerName: 'Synthetic Player A' }) } }),
        1201: market({ 1201: { 10: quote({ playerName: 'Synthetic Player A' }) } }),
        1301: market({ 1301: { 0: quote() } }),
        1401: market({ 1401: { 0: quote() } }),
        1501: market({ 1501: { 0: quote() } }),
      } } } }));
}

export const account = (requestCount = 0, overrides = {}) => ({ api_key: 'synthetic-secret-never-save', current_subscription_id: 'synthetic-free',
  subscriptions: [{ subscription_id: 'synthetic-free', price: null, auto_renew: false, valid_until: null, is_active: true,
    bookmakers: { 'bet365.it': { has_live_odds: false, has_player_props: true } }, sport_ids: [10],
    request_limit: 250, request_count: requestCount, ...overrides }] });
