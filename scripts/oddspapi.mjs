#!/usr/bin/env node
/**
 * OddsPapi -> private local quote observations.
 * This does not publish odds or slips and does not place bets.
 * Node.js >= 22. No third-party packages required.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE_DIR = path.join(ROOT, '.local', 'oddspapi');
const BASE_URL = 'https://api.oddspapi.io/v4';
const BOOKMAKER = 'bet365.it';
const TOURNAMENT_ID = 23;
const MONTHLY_ATTEMPT_CAP = 200; // Safety reserve of 50 vs the advertised Free allowance of 250.
const CATALOG_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function entries(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
}

function catalogArray(value) {
  if (Array.isArray(value)) {
    return value.length === 1 && Array.isArray(value[0]) ? value[0] : value;
  }
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.markets)) return value.markets;
  throw new Error('Formato del catalogo mercati non riconosciuto');
}

function fixturesArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.fixtures)) return value.fixtures;
  if (Array.isArray(value?.data)) return value.data;
  if (value?.fixtureId) return [value];
  throw new Error('Formato della risposta quote non riconosciuto');
}

function normalizePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 1 ? price : null;
}

export function buildReport(rawFixtures, rawCatalog, { observedAt = new Date(), maxFixtures = 10 } = {}) {
  const allFixtures = fixturesArray(rawFixtures);
  const catalog = catalogArray(rawCatalog);
  const marketMap = new Map(catalog.map(m => [String(m.marketId), m]));
  const cutoff = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(cutoff.getTime())) throw new Error('Data di acquisizione non valida');

  // Default: first ten upcoming fixtures only, rather than silently mixing multiple matchdays.
  const futureFixtures = allFixtures
    .filter(f => Date.parse(String(f.startTime)) >= cutoff.getTime())
    .filter(f => Number(f.tournamentId) === TOURNAMENT_ID)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .slice(0, maxFixtures);

  const selections = [];
  const anomalies = [];
  const families = new Map();
  const summary = {
    returnedFixtures: allFixtures.length,
    futureFixtures: futureFixtures.length,
    pricedSelections: 0,
    selectionActiveTrue: 0,
    selectionActiveFalse: 0,
    marketFlagFalseWithSelectionActive: 0,
    candidate: 0,
    review: 0,
    blocked: 0,
    1x2IncompleteFixtures: 0,
    missingMarketDefinitions: 0
  };

  for (const fixture of futureFixtures) {
    const fixtureId = String(fixture.fixtureId || '');
    const b = fixture.bookmakerOdds?.[BOOKMAKER];
    if (!b || b.bookmakerIsActive === false || b.suspended === true) {
      anomalies.push({ fixtureId, issue: 'bookmaker_absent_or_unavailable' });
      continue;
    }

    const active1x2 = new Set();
    for (const [marketId, marketData] of entries(b.markets)) {
      const definition = marketMap.get(String(marketId));
      if (!definition) summary.missingMarketDefinitions += 1;
      const outcomes = new Map((definition?.outcomes || []).map(o => [String(o.outcomeId), o]));

      for (const [outcomeId, outcomeData] of entries(marketData?.outcomes)) {
        for (const [playerKey, selection] of entries(outcomeData?.players)) {
          const price = normalizePrice(selection?.price);
          if (price === null) continue;
          summary.pricedSelections += 1;
          const quoteActive = selection.active === true;
          if (quoteActive) summary.selectionActiveTrue += 1;
          else summary.selectionActiveFalse += 1;
          if (quoteActive && marketData.marketActive === false) {
            summary.marketFlagFalseWithSelectionActive += 1;
          }

          // A quote from a bookmaker feed is not manually verified as playable.
          // marketActive=false alone should trigger review, not silent deletion.
          const availability = !quoteActive
            ? 'blocked'
            : marketData.marketActive !== true || !definition || !outcomes.has(String(outcomeId))
              ? 'review'
              : 'candidate';
          summary[availability] += 1;

          const outcome = outcomes.get(String(outcomeId));
          const marketType = String(definition?.marketType || 'unknown');
          if (quoteActive) families.set(marketType, (families.get(marketType) || 0) + 1);
          if (marketType === '1x2' && definition?.marketName === 'Full Time Result'
              && definition?.period === 'fulltime' && quoteActive && outcome?.outcomeName) {
            active1x2.add(String(outcome.outcomeName));
          }
          selections.push({
            fixtureId,
            fixture: [String(fixture.participant1Name || ''), String(fixture.participant2Name || '')],
            kickoffUtc: String(fixture.startTime || ''),
            bookmaker: BOOKMAKER,
            marketId: String(marketId),
            marketName: String(definition?.marketName || ''),
            marketType,
            period: definition?.period ?? null,
            line: definition?.handicap ?? null,
            playerProp: definition?.playerProp ?? null,
            outcomeId: String(outcomeId),
            outcome: String(outcome?.outcomeName || ''),
            playerKey: String(playerKey),
            bookmakerOutcomeId: selection.bookmakerOutcomeId ?? null,
            price,
            active: quoteActive,
            marketActive: marketData.marketActive ?? null,
            changedAt: selection.changedAt ?? null,
            availability
          });
        }
      }
    }
    const missing = ['1', 'X', '2'].filter(outcome => !active1x2.has(outcome));
    if (missing.length) {
      summary['1x2IncompleteFixtures'] += 1;
      anomalies.push({ fixtureId, issue: 'incomplete_active_1x2', missing });
    }
  }

  return {
    schema: 'lamultipla-oddspapi-private-v1',
    fetchedAtUtc: cutoff.toISOString(),
    source: { provider: 'OddsPapi', bookmaker: BOOKMAKER, tournamentId: TOURNAMENT_ID },
    policy: {
      interpretation: 'candidate is provider-reported only, not bet365 manually confirmed',
      marketFlag: 'marketActive=false is a review signal, never the only filter',
      noBetOnMissingOrInactive: true
    },
    summary,
    marketFamilies: Object.fromEntries([...families].sort((a, b) => b[1] - a[1])),
    anomalies,
    selections
  };
}

async function loadJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}

async function saveJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await fs.writeFile(filename, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

async function readRecentCatalog() {
  const filename = path.join(PRIVATE_DIR, 'catalog.json');
  try {
    const stat = await fs.stat(filename);
    if (Date.now() - stat.mtimeMs <= CATALOG_MAX_AGE_MS) return await loadJson(filename);
  } catch { /* cache is optional */ }
  return null;
}

async function guardedGet(endpoint, parameters, apiKey) {
  // A local conservative counter of attempted HTTP requests, not the provider's authoritative usage.
  // Avoid concurrent runs against the same ledger file.
  const month = new Date().toISOString().slice(0, 7);
  const ledgerPath = path.join(PRIVATE_DIR, 'quota-' + month + '.json');
  let ledger = { month, attempted: 0 };
  try { ledger = await loadJson(ledgerPath); } catch { /* first run */ }
  if (ledger.attempted >= MONTHLY_ATTEMPT_CAP) {
    throw new Error('Limite di sicurezza locale: ' + MONTHLY_ATTEMPT_CAP + ' tentativi questo mese');
  }
  ledger.attempted += 1;
  await saveJson(ledgerPath, ledger); // Count before transmission, including possible HTTP errors.

  const u = new URL(BASE_URL + endpoint);
  u.searchParams.set('apiKey', apiKey);
  for (const [key, value] of Object.entries(parameters)) u.searchParams.set(key, String(value));
  let result;
  try {
    result = await fetch(u, { signal: AbortSignal.timeout(25_000), headers: { accept: 'application/json' } });
  } catch {
    throw new Error('Richiesta API non riuscita (rete/blocco); nessun bypass tentato');
  }
  if (!result.ok) {
    // Never expose URLs: the API key is transmitted in a query parameter.
    throw new Error('OddsPapi ha restituito HTTP ' + result.status + '; verifica accesso e dashboard');
  }
  try { return await result.json(); }
  catch { throw new Error('Risposta OddsPapi non JSON'); }
}

function option(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Valore mancante per ' + flag);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Uso: node scripts/oddspapi.mjs [--fixtures file.json --markets file.json] [--max-fixtures 10]');
    console.log('Senza --fixtures: impostare ODDSPAPI_API_KEY; due richieste iniziali, poi una con cache mercati valida.');
    console.log('Report privato sotto .local/oddspapi/. Mai pubblicato nell app o su GitHub Pages.');
    return;
  }

  const maxFixtures = Number(option(args, '--max-fixtures', '10'));
  if (!Number.isInteger(maxFixtures) || maxFixtures < 1 || maxFixtures > 20) {
    throw new Error('--max-fixtures deve essere compreso tra 1 e 20');
  }
  const fixturesPath = option(args, '--fixtures', null);
  const marketsPath = option(args, '--markets', null);
  let fixtures, catalog;
  if (fixturesPath) {
    if (!marketsPath) throw new Error('Modalita offline: fornire anche --markets');
    fixtures = await loadJson(fixturesPath);
    catalog = await loadJson(marketsPath);
  } else {
    const key = process.env.ODDSPAPI_API_KEY;
    if (!key) throw new Error('Impostare ODDSPAPI_API_KEY nell ambiente locale, mai nel sorgente');
    catalog = await readRecentCatalog();
    if (!catalog) {
      catalog = await guardedGet('/markets', { language: 'en' }, key);
      await saveJson(path.join(PRIVATE_DIR, 'catalog.json'), catalog);
    }
    fixtures = await guardedGet('/odds-by-tournaments', {
      tournamentIds: TOURNAMENT_ID,
      bookmakers: BOOKMAKER,
      language: 'en',
      verbosity: 3
    }, key);
  }

  const report = buildReport(fixtures, catalog, { maxFixtures });
  const destination = path.join(PRIVATE_DIR, 'reports', report.fetchedAtUtc.replace(/[:.]/g, '-') + '.json');
  await saveJson(destination, report);
  console.log('Quote importate in un report PRIVATO LOCALE:', destination);
  console.log('Partite future:', report.summary.futureFixtures);
  console.log('Prezzi totali:', report.summary.pricedSelections);
  console.log('Selezioni active=true:', report.summary.selectionActiveTrue);
  console.log('Flag mercato inattivo ma selezione active=true:', report.summary.marketFlagFalseWithSelectionActive);
  console.log('Partite con 1X2 incompleto:', report.summary['1x2IncompleteFixtures']);
  console.log('Nessuna schedina generata/pubblicata. Nessuna quota considerata verificata su bet365.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('IMPORT FALLITO:', error.message);
    process.exitCode = 1;
  });
}
