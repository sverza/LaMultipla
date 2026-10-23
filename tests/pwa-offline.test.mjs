import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const code = await fs.readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const html = '<link rel="stylesheet" href="_next/static/chunks/style.css"><script src="_next/static/chunks/app.js"></script>';

function worker(base = 'http://127.0.0.1:3001/', unavailable = '') {
  const handlers = {}, stores = new Map(), requests = [];
  let offline = false, activated = false;
  const key = value => new URL(typeof value === 'string' ? value : value.url, base).href;
  const fetch = async value => {
    const url = key(value); requests.push(url);
    if (offline) throw new Error('Offline');
    if (url.endsWith(unavailable) && unavailable) return new Response('Missing', {status: 404});
    return new Response(url === base ? html : url.endsWith('.css') ? 'body{background:green}' : url.endsWith('.js') ? 'window.ready=true' : '{}');
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(request, response) { entries.set(key(request), response.clone()); },
        async match(request) { return entries.get(key(request))?.clone(); },
        async addAll(values) {
          const responses = await Promise.all(values.map(fetch));
          if (responses.some(response => !response.ok)) throw new Error('Precache failed');
          values.forEach((value, i) => entries.set(key(value), responses[i].clone()));
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const entries of stores.values()) if (entries.has(key(request))) return entries.get(key(request)).clone();
    }
  };
  vm.runInNewContext(code, {URL, Request, Response, caches, fetch,
    self: {registration: {scope: base}, addEventListener: (name, fn) => {handlers[name] = fn;},
      skipWaiting: async () => {activated = true;}, clients: {claim: async () => {}}}});
  async function dispatch(name, request) {
    const waits = []; let response;
    handlers[name]({request, waitUntil: promise => waits.push(promise), respondWith: promise => {response = promise;}});
    const result = await response; await Promise.all(waits); return result;
  }
  return {base, stores, requests, caches, dispatch, offline: () => {offline = true;}, activated: () => activated,
    request: (suffix, mode = 'cors') => ({url: new URL(suffix, base).href, method: 'GET', mode})};
}

test('first installation includes CSS/JS before any controlled reload, also under Pages base path', async () => {
  for (const base of ['http://127.0.0.1:3001/', 'https://example.test/LaMultipla/']) {
    const w = worker(base); await w.dispatch('install'); w.offline();
    for (const file of ['_next/static/chunks/style.css', '_next/static/chunks/app.js']) {
      const response = await w.dispatch('fetch', w.request(file));
      assert.equal(response.status, 200);
      assert.doesNotMatch(await response.text(), /<link|<script/);
    }
    assert.equal(w.activated(), true);
    assert.match(await (await w.dispatch('fetch', w.request('', 'navigate'))).text(), /stylesheet/);
  }
});

test('a missing compiled asset prevents activation and preserves the previous cache', async () => {
  const w = worker(undefined, 'app.js'); await w.caches.open('la-multipla-v8');
  await assert.rejects(w.dispatch('install'), /Precache failed/);
  assert.equal(w.activated(), false); assert.ok(w.stores.has('la-multipla-v8'));
});

test('HTML fallback is limited to navigations, never missing JS/CSS/JSON', async () => {
  const w = worker(); await w.dispatch('install'); w.offline();
  for (const file of ['missing.js', 'missing.css', 'missing.json']) {
    const response = await w.dispatch('fetch', w.request(file));
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /<script|<link/);
  }
  assert.match(await (await w.dispatch('fetch', w.request('unvisited/', 'navigate'))).text(), /stylesheet/);
});

test('offline decision/version requests do not reuse stale data or HTML', async () => {
  const w = worker(); await w.dispatch('install');
  await (await w.caches.open('la-multipla-v9')).put(w.request('latest-slip.json'), new Response('{"available":true}'));
  w.offline();
  for (const file of ['latest-slip.json', 'app-version.json']) assert.equal((await w.dispatch('fetch', w.request(file))).status, 503);
});

test('activation leaves caches belonging to other applications intact', async () => {
  const w = worker(); await w.caches.open('other-app'); await w.caches.open('la-multipla-v8');
  await w.dispatch('install'); await w.dispatch('activate');
  assert.ok(w.stores.has('other-app')); assert.equal(w.stores.has('la-multipla-v8'), false);
});

test('network responses are cached through the event lifetime; failed responses are not cached', async () => {
  const w = worker(undefined, 'bad.js'); await w.dispatch('install');
  assert.equal((await w.dispatch('fetch', w.request('extra.js'))).status, 200);
  assert.equal((await w.dispatch('fetch', w.request('bad.js'))).status, 404);
  w.offline();
  assert.equal((await w.dispatch('fetch', w.request('extra.js'))).status, 200);
  assert.equal((await w.dispatch('fetch', w.request('bad.js'))).status, 503);
});
