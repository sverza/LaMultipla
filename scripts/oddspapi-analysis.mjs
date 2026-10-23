#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { PRIVATE_DIR, loadJson, saveJson } from './lib/private-store.mjs';
import { analyzeReport } from './lib/analysis.mjs';
const { values } = parseArgs({ options: { report: { type: 'string' }, assessment: { type: 'string' }, help: { type: 'boolean' } }, strict: true });
if (values.help) {
  console.log('node scripts/oddspapi-analysis.mjs --report file [--assessment file]');
  console.log('Senza stime indipendenti/validazione/contesto/verifiche: NO_BET. Nessuna schedina generata.');
} else {
  try {
    if (!values.report) throw new Error('Report richiesto');
    const report = await loadJson(values.report);
    const input = values.assessment ? await loadJson(values.assessment) : {};
    const assessment = input.assessment ?? input;
    const analysis = analyzeReport(report, assessment);
    const filename = path.join(PRIVATE_DIR, 'analysis', analysis.analyzedAtUtc.replace(/[:.]/g, '-') + '-' + randomUUID() + '.json');
    await saveJson(filename, { ...analysis, assessment });
    console.log('Analisi privata:', filename);
    console.log(JSON.stringify({ decision: analysis.decision, ...analysis.counts }));
  } catch { console.error('Analisi fallita: report o assessment non valido. Nessuna pubblicazione.'); process.exitCode = 1; }
}
