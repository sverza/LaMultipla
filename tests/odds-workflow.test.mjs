import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { ROOT } from '../scripts/lib/private-store.mjs';
import { sample, catalog, round, observedAt } from './fixtures/oddspapi.mjs';
const execute = promisify(execFile);

test('actual offline CLI -> review package -> NO_BET, with no change to public feed or history', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lamultipla-cli-'));
  // Copy only the scripts: npm test must never touch the user's real .local data.
  await fs.cp(path.join(ROOT, 'scripts'), path.join(temp, 'scripts'), { recursive: true });
  const input = sample(); input[0].bookmakerOdds['bet365.it'].bookmakerFixtureId = 'synthetic-cli-' + Date.now();
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  for (const [name, value] of Object.entries({ fixtures: input, markets: catalog, round })) await fs.writeFile(path.join(temp, name + '.json'), JSON.stringify(value));
  const protectedPaths = ['public/latest-slip.json', 'app/data/historical-v3-patches.json'];
  const before = await Promise.all(protectedPaths.map(p => fs.readFile(path.join(ROOT, p), 'utf8')));
  const env = { ...process.env }; delete env.ODDSPAPI_API_KEY;
  const run = args => execute(process.execPath, args, { cwd: temp, env });
  const imported = await run(['scripts/oddspapi.mjs', '--round', path.join(temp, 'round.json'), '--fixtures', path.join(temp, 'fixtures.json'),
    '--markets', path.join(temp, 'markets.json'), '--observed-at', observedAt]);
  const reportPath = imported.stdout.split('\n')[0].slice('Report privato: '.length);
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  t.after(() => fs.rm(path.dirname(reportPath), { recursive: true, force: true }));
  assert.equal(report.acquisition.billableAttempts, 0);
  const review = await run(['scripts/oddspapi-review.mjs', '--report', reportPath, '--quote-ids', report.selections[0].quoteId]);
  const reviewPath = review.stdout.split('\n')[0].slice('Pacchetto privato di revisione: '.length);
  t.after(() => fs.rm(reviewPath, { force: true }));
  const reviewed = JSON.parse(await fs.readFile(reviewPath, 'utf8'));
  assert.equal(reviewed.assessment.estimates[0].probabilities.win, null);
  const result = await run(['scripts/oddspapi-analysis.mjs', '--report', reportPath, '--assessment', reviewPath]);
  assert.ok(result.stdout.includes('NO_BET'));
  const analysisPath = result.stdout.split('\n')[0].slice('Analisi privata: '.length);
  t.after(() => fs.rm(analysisPath, { force: true }));
  assert.ok(analysisPath.startsWith(path.join(temp, '.local/oddspapi') + path.sep));
  assert.deepEqual(await Promise.all(protectedPaths.map(p => fs.readFile(path.join(ROOT, p), 'utf8'))), before);
});

test('private directory is ignored and application never imports the API client', async () => {
  const ignored = await execute('git', ['check-ignore', '.local/oddspapi/round.json'], { cwd: ROOT });
  assert.ok(ignored.stdout.includes('.local/oddspapi'));
  for (const filename of ['app/page.tsx', 'app/lib/model.ts', 'app/lib/storage.ts']) {
    const source = await fs.readFile(path.join(ROOT, filename), 'utf8');
    assert.ok(!/ODDSPAPI_API_KEY|api\.oddspapi\.io|scripts\/lib/.test(source));
  }
});
