import { SafeError } from './safe-error.mjs';
import path from 'node:path';
import { optionalJson, saveJson } from './private-store.mjs';
import { errorDetails } from './error-diagnostics.mjs';

const BILLABLE = new Set(['/markets', '/odds-by-tournaments', '/odds']);
const DAY = 86400000;

export function accountStatus(raw, now = new Date()) {
  const subscriptions = raw?.subscriptions;
  const active = Array.isArray(subscriptions) ? subscriptions.filter(s => s.is_active === true) : [];
  const s = active.find(s => s.subscription_id === raw.current_subscription_id)
    ?? (active.length === 1 ? active[0] : null);
  if (!s || !s.subscription_id || ![null, 0].includes(s.price) || s.auto_renew !== false) {
    throw new SafeError('Account non riconosciuto come gratuito senza rinnovo a pagamento');
  }
  if (s.valid_until !== null || !s.bookmakers?.['bet365.it'] || !s.sport_ids?.includes(10)) {
    throw new SafeError('Piano permanente o accesso a bet365.it/calcio non confermato');
  }
  if (!Number.isInteger(s.request_count) || s.request_count < 0
      || !Number.isInteger(s.request_limit) || s.request_limit !== 250) {
    throw new SafeError('Quota Free 250 non riconosciuta: nessuna acquisizione');
  }
  // Whitelist only: /account itself contains api_key and must NEVER be persisted.
  return { subscriptionId: String(s.subscription_id), checkedAtUtc: now.toISOString(),
    requestCount: s.request_count, requestLimit: s.request_limit,
    remaining: s.request_limit - s.request_count,
    playerProps: s.bookmakers['bet365.it'].has_player_props === true };
}

export class ApiClient {
  constructor({ key, directory, fetchImpl = fetch, clock = () => new Date(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    if (!key) throw new SafeError('Impostare ODDSPAPI_API_KEY solo nell’ambiente locale');
    if (typeof key === 'string' && /[\u0000-\u001f\u007f]/.test(key)) {
      throw new SafeError('La chiave contiene caratteri di controllo: possibile incolla non riuscito nel prompt protetto. Usare il metodo di incolla verificato localmente; nessuna richiesta inviata');
    }
    if (typeof key !== 'string' || key.trim() !== key || /[\r\n]/.test(key)) {
      throw new SafeError('La chiave contiene spazi esterni o ritorni a capo: copiarla nuovamente nel prompt protetto');
    }
    this.key = key; this.directory = directory; this.fetchImpl = fetchImpl; this.clock = clock; this.pause = pause;
    this.requests = []; this.used = 0; this.lastAt = null; this.stopped = false;
  }
  async checkAccount() {
    this.account = accountStatus(await this.get('/account', {}), this.clock());
    return this.account;
  }
  async get(endpoint, parameters) {
    if (this.stopped) throw new SafeError('Client fermato dopo un errore; nessun retry automatico');
    if (endpoint !== '/account' && !BILLABLE.has(endpoint)) throw new SafeError('Endpoint non consentito');
    const billable = BILLABLE.has(endpoint);
    if (billable) {
      if (!this.account) throw new SafeError('Verificare l’account prima delle richieste conteggiate');
      if (this.used >= 15) throw new SafeError('Limite per esecuzione: 15 richieste conteggiate');
      const filename = path.join(this.directory, 'quota.json');
      const ledger = await optionalJson(filename) ?? { schema: 1, attempts: [] };
      if (ledger.schema !== 1 || !Array.isArray(ledger.attempts)
          || ledger.attempts.some(a => !a || !Number.isFinite(Date.parse(a.atUtc)) || !BILLABLE.has(a.endpoint))) {
        throw new SafeError('Contatore locale corrotto: acquisizione bloccata');
      }
      const now = this.clock();
      if (ledger.attempts.some(a => Date.parse(a.atUtc) > now.getTime())) throw new SafeError('Orologio precedente al contatore locale');
      ledger.attempts = ledger.attempts.filter(a => now.getTime() - Date.parse(a.atUtc) < 31 * DAY);
      // Rolling window avoids assuming the provider resets on the first of a calendar month.
      if (ledger.attempts.length >= 200 || this.account.requestCount + this.used >= 200) {
        throw new SafeError('Riserva protetta: tetto 200 tentativi/31 giorni e almeno 50 richieste Free residue');
      }
      ledger.attempts.push({ atUtc: now.toISOString(), endpoint });
      await saveJson(filename, ledger); // Before transmission; failures are conservatively counted.
      this.used += 1;
    }
    if (this.lastAt !== null) await this.pause(Math.max(0, 1100 - (this.clock().getTime() - this.lastAt)));
    this.lastAt = this.clock().getTime();
    const url = new URL('https://api.oddspapi.io/v4' + endpoint);
    url.searchParams.set('apiKey', this.key);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
    const audit = { endpoint, parameters, requestedAtUtc: this.clock().toISOString(), billable, status: null };
    this.requests.push(audit);
    try {
      const response = await this.fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(25000), headers: { accept: 'application/json' } });
      audit.status = response.status;
      if (!response.ok) {
        // Store only bounded, redacted error descriptions, never the raw body.
        audit.responseBodyFormat = response.headers?.get?.('content-type')?.includes('text/html') ? 'html' : 'unknown';
        try {
          const body = await response.json();
          audit.responseBodyFormat = 'json';
          audit.errorDetails = errorDetails(body, this.key);
          const message = audit.errorDetails.join(' ').toLowerCase();
          audit.errorCategory = /invalid.{0,20}(?:api.?key|credential)|unauthori[sz]ed|authentication/.test(message) ? 'authentication'
            : /quota|request.limit|rate.limit/.test(message) ? 'quota_or_rate_limit'
              : /internal.server|server.error/.test(message) ? 'server_error' : 'unspecified';
        } catch { /* Metadata alone is sufficient; parsing errors must not expose body fragments. */ }
        throw new SafeError('HTTP');
      }
      try { return await response.json(); }
      catch { audit.responseBodyFormat = 'invalid_json'; throw new SafeError('JSON'); }
    } catch {
      this.stopped = true;
      // No URL, response body, nested cause, or key in the error/log.
      const reason = audit.responseBodyFormat === 'invalid_json' ? 'risposta non JSON'
        : audit.status ? `HTTP ${audit.status}` : 'rete/timeout/blocco';
      const error = new Error(`OddsPapi ${reason}; nessun retry/bypass`);
      error.safeMessage = error.message;
      throw error;
    }
  }
}
