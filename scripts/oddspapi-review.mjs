#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { PRIVATE_DIR, loadJson, saveJson } from './lib/private-store.mjs';
import { fingerprint } from './lib/odds-report.mjs';
const { values } = parseArgs({ options: { report: { type: 'string' }, 'quote-ids': { type: 'string' }, help: { type: 'boolean' } }, strict: true });
if (values.help) {
  console.log('node scripts/oddspapi-review.mjs --report file --quote-ids id1,id2');
  console.log('Prepara un assessment privato vuoto per massimo 30 selezioni, senza inventare stime o verifiche.');
} else {
  try {
    if (!values.report || !values['quote-ids']) throw new Error('Report e quote IDs richiesti');
    const report = await loadJson(values.report);
    const ids = values['quote-ids'].split(',');
    if (report.schema !== 'lamultipla-oddspapi-private-v2' || ids.length > 30 || new Set(ids).size !== ids.length) throw new Error('Formato non valido');
    const selected = ids.map(id => report.selections.find(q => q.quoteId === id));
    if (selected.some(q => !q)) throw new Error('Selezione assente: non si possono riparare esiti mancanti');
    const assessment = {
      schema: 'lamultipla-private-assessment-v1', reportSha256: fingerprint(report), dependencyReview: '',
      model: { id: '', version: '', probabilitySource: '', trainingCutoffUtc: null, methodologyArtifact: '', validatedMarketTypes: [],
        calibration: { artifact: '', metric: '', value: null, sampleSize: null, outOfSample: false, evaluatedAtUtc: null } },
      estimates: selected.map(q => ({ quoteId: q.quoteId, estimatedAtUtc: null,
        probabilities: { win: null, halfWin: null, push: null, halfLoss: null, loss: null },
        settlementVerified: false, settlementRules: '',
        context: { absences: '', form: '', calendar: '', tacticalContext: '', dataSources: '', lineupAndMinutes: '' },
        manualVerification: null }))
    };
    const filename = path.join(PRIVATE_DIR, 'reviews', report.fetchedAtUtc.replace(/[:.]/g, '-') + '-' + randomUUID() + '.json');
    await saveJson(filename, { reportSha256: fingerprint(report), selections: selected, assessment });
    // The provider quote and an empty assessment are kept together for a local human review.
    console.log('Pacchetto privato di revisione:', filename);
    console.log('Compilare assessment nel pacchetto e passarlo a odds:analyze; nessuna selezione approvata.');
  } catch { console.error('Revisione fallita: controllare report e quote IDs. Nessuna pubblicazione.'); process.exitCode = 1; }
}
