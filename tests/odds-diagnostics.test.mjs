import test from 'node:test';
import assert from 'node:assert/strict';
import { errorDetails } from '../scripts/lib/error-diagnostics.mjs';

test('nested error descriptions are useful while credential/account fields are excluded', () => {
  const key = 'synthetic-secret-never-save';
  const result = errorDetails({ api_key: key, subscriptions: [{ api_key: key }],
    error: { code: 'NO_ACCOUNT', message: 'Account lookup failed', details: [{ reason: 'Subscription not found' }] } }, key);
  assert.deepEqual(result, ['NO_ACCOUNT', 'Account lookup failed', 'Subscription not found']);
});

test('raw, URL-encoded and base64 keys, URLs and other long tokens are redacted', () => {
  const key = 'synthetic-key/with+punctuation';
  const result = errorDetails({ message: `${key} ${encodeURIComponent(key)} ${Buffer.from(key).toString('base64')} https://example.test?apiKey=${key}`,
    details: 'token=short-secret password="other-secret" other-long-secret-token-123456789' }, key).join(' ');
  for (const secret of [key, encodeURIComponent(key), Buffer.from(key).toString('base64'), 'https://', 'short-secret', 'other-secret', 'other-long-secret-token-123456789']) assert.ok(!result.includes(secret));
  assert.ok(result.includes('[redacted]'));
});

test('error diagnostic is bounded and ignores unknown fields and control characters', () => {
  const result = errorDetails({ unrelated: 'private', errors: Array.from({ length: 100 }, () => ({ message: 'Problem\n' + 'a '.repeat(1000) })) }, 'synthetic-key');
  assert.ok(result.length <= 6);
  assert.ok(result.every(x => x.length <= 400 && !x.includes('\n') && !x.includes('private')));
});
