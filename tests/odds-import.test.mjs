import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ApiClient, accountStatus } from '../scripts/lib/api-client.mjs';
import { importQuotes } from '../scripts/oddspapi.mjs';
import { saveJson, withLock, loadJson } from '../scripts/lib/private-store.mjs';
import { sample, catalog, round, observedAt, account } from './fixtures/oddspapi.mjs';
const clock = () => new Date(observedAt);
async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lamultipla-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir;
}
function mockApi(responses, calls) {
  return async url => {
    assert.equal(url.hostname, 'api.oddspapi.io');
    const endpoint = url.pathname.slice(3); calls.push(endpoint);
    assert.equal(url.searchParams.get('apiKey'), 'synthetic-secret-never-save');
    const value = responses[endpoint];
    return { ok: true, status: 200, json: async () => value };
  };
}
function clientOptions(dir, fetchImpl) { return { directory: dir, key: 'synthetic-secret-never-save', clock, pause: async () => {}, fetchImpl }; }

test('live mock: two billable requests initially, one with cache; account key never persisted', async t => {
  const dir = await directory(t), calls = [];
  const fetchImpl = mockApi({ '/account': account(), '/markets': catalog, '/odds-by-tournaments': sample() }, calls);
  const first = await importQuotes({ round, ...clientOptions(dir, fetchImpl) });
  assert.equal(first.report.acquisition.billableAttempts, 2);
  const second = await importQuotes({ round, ...clientOptions(dir, fetchImpl) });
  assert.notEqual(first.filename, second.filename); // Never overwrite historical observations.
  assert.equal(second.report.acquisition.billableAttempts, 1);
  assert.deepEqual(calls, ['/account', '/markets', '/odds-by-tournaments', '/account', '/odds-by-tournaments']);
  assert.equal((await loadJson(path.join(dir, 'quota.json'))).attempts.length, 3);
  for (const filename of ['catalog-cache.json', 'quota.json', path.relative(dir, first.filename)]) {
    assert.ok(!(await fs.readFile(path.join(dir, filename), 'utf8')).includes('synthetic-secret-never-save'));
  }
});
test('offline import consumes zero requests and refuses incomplete input or retrodated live runs', async t => {
  const dir = await directory(t);
  const result = await importQuotes({ directory: dir, round, fixtures: sample(), markets: catalog, observedAt });
  assert.equal(result.report.acquisition.billableAttempts, 0);
  assert.equal(result.report.source.mode, 'offline');
  await assert.rejects(importQuotes({ directory: dir, round, fixtures: sample() }));
  await assert.rejects(importQuotes({ directory: dir, round, observedAt }));
});

test('account-only check calls no billable endpoints and saves no API key', async t => {
  const dir = await directory(t), calls = [];
  const result = await importQuotes({ round, accountOnly: true,
    ...clientOptions(dir, mockApi({ '/account': account(18) }, calls)) });
  assert.deepEqual(calls, ['/account']);
  assert.equal(result.report, undefined);
  assert.equal(result.account.requestCount, 18);
  assert.equal(result.account.remaining, 232);
  const saved = await fs.readFile(result.filename, 'utf8');
  assert.ok(!saved.includes('synthetic-secret-never-save'));
  assert.equal(JSON.parse(saved).billableAttempts, 0);
  await assert.rejects(fs.stat(path.join(dir, 'quota.json')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(dir, 'catalog-cache.json')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(dir, 'import.lock')), { code: 'ENOENT' });
});

test('account HTTP 500 diagnostic classifies provider error without persisting secret-containing body', async t => {
  const dir = await directory(t); let count = 0;
  const fetchImpl = async () => { count += 1; return { ok: false, status: 500,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ message: 'Internal server error synthetic-secret-never-save', api_key: 'synthetic-secret-never-save' }) }; };
  await assert.rejects(importQuotes({ round, accountOnly: true, ...clientOptions(dir, fetchImpl) }), /HTTP 500/);
  const saved = await fs.readFile(path.join(dir, 'last-failure.json'), 'utf8');
  assert.ok(!saved.includes('synthetic-secret-never-save'));
  const audit = JSON.parse(saved);
  assert.equal(audit.billableAttempts, 0);
  assert.equal(audit.requests[0].responseBodyFormat, 'json');
  assert.equal(audit.requests[0].errorCategory, 'server_error');
  assert.equal(count, 1);
});

test('HTTP success with invalid JSON is distinguished from server error; padded key makes no request', async t => {
  const dir = await directory(t);
  const c = new ApiClient(clientOptions(dir, async () => ({ ok: true, status: 200, json: async () => { throw new Error('secret body fragment'); } })));
  await assert.rejects(c.checkAccount(), /risposta non JSON/);
  assert.equal(c.requests[0].responseBodyFormat, 'invalid_json');
  assert.equal(c.requests[0].status, 200);
  assert.equal(c.used, 0);
  assert.throws(() => new ApiClient({ ...clientOptions(dir, async () => { assert.fail('must not call'); }), key: ' padded-key ' }), /spazi esterni/);
});
test('free-only account check refuses paid, expiring, unsupported or ambiguous subscriptions', () => {
  assert.equal(accountStatus(account(7)).remaining, 243);
  for (const override of [{ price: 1 }, { auto_renew: true }, { valid_until: '2026-10-10T00:00:00Z' },
    { request_limit: 1000 }, { request_count: '0' }, { bookmakers: { bet365: {} } }, { sport_ids: [11] }]) {
    assert.throws(() => accountStatus(account(0, override)));
  }
});
test('reserve uses authoritative shared account count, not just this PC’s attempts', async t => {
  const dir = await directory(t), calls = [];
  const c = new ApiClient(clientOptions(dir, mockApi({ '/account': account(200) }, calls)));
  await c.checkAccount(); await assert.rejects(c.get('/markets', {}), /Riserva/);
  assert.deepEqual(calls, ['/account']);
});
test('200 attempts in rolling 31 days stop requests even across calendar boundary', async t => {
  const dir = await directory(t), calls = [];
  await saveJson(path.join(dir, 'quota.json'), { schema: 1, attempts: Array.from({ length: 200 }, () => ({ atUtc: '2026-09-30T12:00:00Z', endpoint: '/odds' })) });
  const c = new ApiClient(clientOptions(dir, mockApi({ '/account': account() }, calls)));
  await c.checkAccount(); await assert.rejects(c.get('/markets', {}), /Riserva/);
  assert.equal(calls.length, 1);
});
test('corrupt ledger fails closed instead of resetting consumption to zero', async t => {
  const dir = await directory(t);
  await fs.writeFile(path.join(dir, 'quota.json'), '{not JSON secret fragment');
  const c = new ApiClient(clientOptions(dir, mockApi({ '/account': account() }, [])));
  await c.checkAccount(); await assert.rejects(c.get('/markets', {}), /JSON privato/);
  await fs.writeFile(path.join(dir, 'quota.json'), JSON.stringify({ schema: 1, attempts: [{}] }));
  await assert.rejects(c.get('/markets', {}), /corrotto/);
});
test('HTTP 403/429/500 and timeout count once, hide key/body, stop without retry, save audit', async t => {
  for (const status of [403, 429, 500, null]) {
    const dir = await directory(t); let count = 0;
    const fetchImpl = async url => {
      count += 1;
      if (url.pathname === '/v4/account') return { ok: true, status: 200, json: async () => account() };
      if (status === null) throw new Error('secret URL ' + url);
      return { ok: false, status, json: async () => { throw new Error('must not inspect body'); } };
    };
    await assert.rejects(importQuotes({ round, ...clientOptions(dir, fetchImpl) }), e => !e.message.includes('synthetic-secret') && !e.message.includes('apiKey'));
    assert.equal(count, 2);
    assert.equal((await loadJson(path.join(dir, 'quota.json'))).attempts.length, 1);
    const audit = await loadJson(path.join(dir, 'last-failure.json'));
    assert.equal(audit.requests[1].status, status);
    assert.equal(audit.billableAttempts, 1);
    assert.ok(!JSON.stringify(audit).includes('synthetic-secret'));
  }
});
test('quota exhaustion during a run preserves reserve and the per-run limit is 15', async t => {
  const dir = await directory(t), calls = [];
  const c = new ApiClient(clientOptions(dir, mockApi({ '/account': account(199), '/odds': {} }, calls)));
  await c.checkAccount(); await c.get('/odds', {}); await assert.rejects(c.get('/odds', {}), /Riserva/);
  const other = await directory(t);
  const c2 = new ApiClient(clientOptions(other, mockApi({ '/account': account(), '/odds': {} }, [])));
  await c2.checkAccount(); for (let i = 0; i < 15; i++) await c2.get('/odds', {});
  await assert.rejects(c2.get('/odds', {}), /15 richieste/);
});
test('lock rejects concurrent writes; failure releases lock; stale lock requires human check', async t => {
  const dir = await directory(t);
  await withLock(dir, async () => { await assert.rejects(withLock(dir, async () => {}), /già in corso/); });
  await assert.rejects(withLock(dir, async () => { throw new Error('synthetic'); }));
  await withLock(dir, async () => {});
  await fs.writeFile(path.join(dir, 'import.lock'), '');
  await assert.rejects(withLock(dir, async () => {}));
});
test('atomic private write rejects credential fields and malformed API response cannot replace latest', async t => {
  const dir = await directory(t);
  await assert.rejects(saveJson(path.join(dir, 'secret.json'), { api_key: 'do-not-save' }), /credenziale/);
  const first = await importQuotes({ round, directory: dir, fixtures: sample(), markets: catalog, observedAt });
  const before = await fs.readFile(path.join(dir, 'latest.json'), 'utf8');
  await assert.rejects(importQuotes({ round, ...clientOptions(dir, mockApi({ '/account': account(), '/markets': catalog, '/odds-by-tournaments': { error: 'not fixture data' } }, [])) }));
  assert.equal(await fs.readFile(path.join(dir, 'latest.json'), 'utf8'), before);
  assert.equal(first.report.round.verified, true);
});
