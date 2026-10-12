#!/usr/bin/env node
import { SafeError } from './lib/safe-error.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { PRIVATE_DIR, loadJson, optionalJson, saveJson, withLock } from './lib/private-store.mjs';
import { ApiClient } from './lib/api-client.mjs';
import { buildReport, catalogArray, validateRound, fingerprint } from './lib/odds-report.mjs';
import {readSnapshot,writeExclusive} from './lib/prospective/store.mjs';
export { buildReport } from './lib/odds-report.mjs';

export async function importQuotes({ round, fixtures, markets, observedAt, directory = PRIVATE_DIR, key,
  fetchImpl, clock = () => new Date(), pause, accountOnly = false, acquisitionId } = {}) {
  validateRound(round);
  if (Boolean(fixtures) !== Boolean(markets)) throw new SafeError('Offline: fornire sia fixtures sia markets');
  if (!fixtures && observedAt) throw new SafeError('Non si può retrodatare un’acquisizione live');
  if (accountOnly && fixtures) throw new SafeError('Controllo account disponibile solo in modalità API');
  if(acquisitionId!==undefined&&(!/^[a-f0-9]{64}$/.test(acquisitionId)||fixtures||accountOnly))throw new SafeError('Identità acquisizione live non valida');
  return withLock(directory, async () => {
    const transaction=acquisitionId?path.join(directory,'acquisitions',acquisitionId):null;
    if(transaction){
      try{
        const saved=await readSnapshot(path.join(transaction,'completed.json'));
        if(saved.filename!==path.join(transaction,'report.json'))throw new SafeError('Percorso ricevuta acquisizione incompatibile');
        const report=await loadJson(saved.filename);
        if(saved.roundSha256!==fingerprint(round)||saved.reportSha256!==fingerprint(report)||report.acquisition?.id!==acquisitionId)throw new SafeError('Ricevuta acquisizione incompatibile');
        return {report,filename:saved.filename,reused:true};
      }catch(e){if(e.code!=='ENOENT')throw e;}
      // A run may have committed its complete report immediately before crash.
      // This deterministic location is never replaced or used for a new call.
      const reportFile=path.join(transaction,'report.json'),report=await optionalJson(reportFile);
      if(report){
        if(report.acquisition?.id!==acquisitionId||report.acquisition?.roundSha256!==fingerprint(round))throw new SafeError('Report acquisizione incompatibile');
        await writeExclusive(path.join(transaction,'completed.json'),{filename:reportFile,roundSha256:fingerprint(round),reportSha256:fingerprint(report)});
        return {report,filename:reportFile,reused:true};
      }
      try{await readSnapshot(path.join(transaction,'intent.json'));throw new SafeError('Acquisizione interrotta: nessun nuovo tentativo automatico');}
      catch(e){if(e.code!=='ENOENT')throw e;}
      await writeExclusive(path.join(transaction,'intent.json'),{roundSha256:fingerprint(round),startedAtUtc:clock().toISOString()});
    }
    let rawFixtures = fixtures, catalog = markets, client;
    try {
      if (!fixtures) {
        client = new ApiClient({ key, directory, fetchImpl, clock, pause });
        await client.checkAccount();
        if (accountOnly) {
          const status = { schema: 'lamultipla-private-account-check-v1', account: client.account,
            billableAttempts: 0, requests: client.requests };
          const filename = path.join(directory, 'account-status.json');
          await saveJson(filename, status);
          return { account: client.account, filename };
        }
        const cache = await optionalJson(path.join(directory, 'catalog-cache.json'));
        if (cache && (cache.schema !== 1 || !Number.isFinite(Date.parse(cache.fetchedAtUtc)) || !cache.catalog)) throw new SafeError('Cache catalogo non valida');
        const age = cache ? clock().getTime() - Date.parse(cache.fetchedAtUtc) : Infinity;
        if (age >= 0 && age < 7 * 86400000) catalog = cache.catalog;
        else {
          catalog = await client.get('/markets', { language: 'en' });
          catalogArray(catalog);
          await saveJson(path.join(directory, 'catalog-cache.json'), { schema: 1, fetchedAtUtc: clock().toISOString(), catalog });
        }
        rawFixtures = await client.get('/odds-by-tournaments', { tournamentIds: 23, bookmakers: 'bet365.it', language: 'en', verbosity: 3 });
      }
      const report = buildReport(rawFixtures, catalog, { round, observedAt: observedAt ?? clock(), source: client ? 'api' : 'offline' });
      // Content-addressed catalogs keep older reports reproducible after cache refresh.
      report.source.catalogPath = path.join('catalogs', report.source.catalogSha256 + '.json');
      await saveJson(path.join(directory, report.source.catalogPath), catalog);
      const runId = report.fetchedAtUtc.replace(/[:.]/g, '-') + '-' + fingerprint(rawFixtures).slice(0, 12) + '-' + randomUUID();
      const folder = transaction??path.join(directory, 'runs', runId);
      report.acquisition = { accountBefore: client?.account ?? null,
        billableAttempts: client?.used ?? 0, requests: client?.requests ?? [],
        remainingLowerBound: client ? client.account.remaining - client.used : null, remainingIsEstimate: true };
      if(acquisitionId){report.acquisition.id=acquisitionId;report.acquisition.roundSha256=fingerprint(round);}
      // Never save /account; its api_key is excluded by the whitelist in accountStatus.
      await saveJson(path.join(folder, 'fixtures.json'), rawFixtures);
      await saveJson(path.join(folder, 'report.json'), report);
      await saveJson(path.join(directory, 'latest.json'), { schema: 1, reportPath: path.relative(directory, path.join(folder, 'report.json')), fetchedAtUtc: report.fetchedAtUtc });
      if(transaction)await writeExclusive(path.join(transaction,'completed.json'),{filename:path.join(folder,'report.json'),roundSha256:fingerprint(round),reportSha256:fingerprint(report)});
      return { report, filename: path.join(folder, 'report.json') };
    } catch (error) {
      if (client) await saveJson(path.join(directory, 'last-failure.json'), {
        failedAtUtc: clock().toISOString(), billableAttempts: client.used, requests: client.requests,
        reason: error.safeMessage ?? 'Importazione interrotta durante la validazione o la scrittura privata'
      });
      throw error;
    }
  });
}

async function main() {
  const { values } = parseArgs({ options: {
    help: { type: 'boolean' }, round: { type: 'string' }, fixtures: { type: 'string' },
    markets: { type: 'string' }, 'observed-at': { type: 'string' }, 'account-only': { type: 'boolean' }
  }, strict: true, allowPositionals: false });
  if (values.help) {
    console.log('node scripts/oddspapi.mjs --round .local/oddspapi/round.json [--fixtures file --markets file --observed-at UTC]');
    console.log('Live: ODDSPAPI_API_KEY nell’ambiente. 2 chiamate conteggiate iniziali, poi 1 con cache valida; account non conteggiato.');
    console.log('Dati solo sotto .local/oddspapi; nessuna schedina o pubblicazione.');
    console.log('--account-only: una sola chiamata non conteggiata a /account, senza catalogo o quote.');
    return;
  }
  if (!values.round) throw new SafeError('Fornire --round con il manifest privato della giornata');
  const { report, account, filename } = await importQuotes({ round: await loadJson(values.round),
    fixtures: values.fixtures ? await loadJson(values.fixtures) : undefined,
    markets: values.markets ? await loadJson(values.markets) : undefined,
    observedAt: values['observed-at'], key: process.env.ODDSPAPI_API_KEY, accountOnly: values['account-only'] });
  if (account) {
    console.log('Stato account privato:', filename);
    console.log(JSON.stringify({ requestLimit: account.requestLimit, requestCount: account.requestCount,
      remaining: account.remaining, playerProps: account.playerProps, billableAttempts: 0 }));
    return;
  }
  console.log('Report privato:', filename);
  console.log(JSON.stringify({ roundVerified: report.round.verified, ...report.summary, billableAttempts: report.acquisition.billableAttempts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.safeMessage ?? 'Importazione fallita: controllare manifest, JSON, account/quota o accesso API. Nessun retry automatico; dettagli riservati non stampati.'); process.exitCode = 1; });
}
