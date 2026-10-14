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
  const q = report.selections[0];
  const forecastPath = path.join(temp, 'experimental-forecast.json');
  await fs.writeFile(forecastPath, JSON.stringify({ schema: 'lamultipla-goals-forecast-v1',
    studySha256: 'synthetic-study', datasetSha256: 'synthetic-dataset', generatedAtUtc: observedAt,
    validationCompletedAtUtc: '2026-10-01T00:00:00Z', model: {converged:true,cutoffUtc:'2026-09-01T00:00:00Z'},
    central: {home:q.fixture[0],away:q.fixture[1],line:2.5,probabilities:{oneXTwo:[.6,.2,.2],btts:.5,over:.5,under:.5}},
    uncertainty:{sufficient:true,replicates:40}, acceptance:{oneXTwo:{retrospectiveAccepted:true,model:{logLoss:.9,n:705}}} }));
  const bridged = await run(['scripts/oddspapi-review.mjs','--report',reportPath,'--quote-ids',q.quoteId,'--forecast',forecastPath]);
  const bridgedPath = bridged.stdout.split('\n')[0].slice('Pacchetto privato di revisione: '.length);
  const packet = JSON.parse(await fs.readFile(bridgedPath,'utf8'));
  assert.equal(packet.assessment.estimates[0].probabilities.win,.6);
  assert.equal(packet.assessment.model.operationallyApproved,false);
  const bridgeResult=await run(['scripts/oddspapi-analysis.mjs','--report',reportPath,'--assessment',bridgedPath]);
  assert.ok(bridgeResult.stdout.includes('NO_BET'));
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

test('model dataset preparation CLI uses only local authorized input, immutable snapshots and no OddsPapi',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-model-cli-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  await fs.cp(path.join(ROOT,'scripts'),path.join(temp,'scripts'),{recursive:true});
  const source=path.join(temp,'source');await fs.mkdir(source);
  await fs.writeFile(path.join(source,'LICENSE.md'),'CC0 1.0 Universal\nSYNTHETIC TEST ONLY');
  for(let year=2013;year<=2026;year++){
    const season=`${year}-${String(year+1).slice(-2)}`;await fs.mkdir(path.join(source,season));
    await fs.writeFile(path.join(source,season,'it.1.json'),JSON.stringify({name:`Italian Serie A ${year}/${String(year+1).slice(-2)}`,
      matches:[{date:`${year}-08-20`,team1:'Synthetic A',team2:'Synthetic B',score:{ft:[1,0]}}]}));
  }
  const result=await execute(process.execPath,['scripts/goals-study.mjs','--source',source,'--prepare-only','--cutoff','2026-10-09T23:00:00Z'],{cwd:temp});
  const filename=result.stdout.trim().slice('Dataset privato: '.length);
  const dataset=JSON.parse(await fs.readFile(filename,'utf8'));assert.equal(dataset.rows.length,14);
  assert.equal(dataset.files.length,14);assert.equal(dataset.license,'CC0-1.0');
  await assert.rejects(fs.stat(path.join(temp,'.local/oddspapi/quota.json')));
  assert.ok(filename.startsWith(path.join(temp,'.local/model/datasets')));
});
