#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { PRIVATE_DIR, loadJson, saveJson } from './lib/private-store.mjs';
import { quoteProbabilities } from './lib/goals/bridge.mjs';
import { verificationTemplate } from './lib/availability.mjs';
import {settlementTemplate} from './lib/decision/gates.mjs';
import { fingerprint } from './lib/odds-report.mjs';
const { values } = parseArgs({ options: { report: { type: 'string' }, 'quote-ids': { type: 'string' }, forecast: { type: 'string' }, help: { type: 'boolean' } }, strict: true });
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
        settlementVerified: false, settlementRules: '',settlementVerification:settlementTemplate(report,q),
        context: { absences: '', form: '', calendar: '', tacticalContext: '', dataSources: '', lineupAndMinutes: '' },
        manualVerification: verificationTemplate(report, q) }))
    };
    if (values.forecast) {
      const forecast = await loadJson(values.forecast);
      if (forecast.schema !== 'lamultipla-goals-forecast-v1' || !forecast.studySha256 || !forecast.datasetSha256
          || !forecast.validationCompletedAtUtc || !forecast.generatedAtUtc) throw new Error('Forecast incompleto');
      const acceptance = forecast.acceptance;
      const mappings = { oneXTwo: '1x2', btts: 'bothteamsscore', over: 'totals' };
      const valid = Object.entries(mappings).filter(([k]) => acceptance?.[k]?.retrospectiveAccepted).map(([,v]) => v);
      const metric = acceptance?.oneXTwo?.model;
      assessment.model = { id: 'lamultipla-goals-v1', version: 'protocol-v1', probabilitySource: 'independent_model',
        trainingCutoffUtc: forecast.model.cutoffUtc, methodologyArtifact: 'docs/protocollo-modello-gol-v1.md',
        validatedMarketTypes: valid, operationallyApproved: false, forecastSha256: fingerprint(forecast),
        datasetSha256: forecast.datasetSha256, studySha256: forecast.studySha256,
        calibration: { artifact: values.forecast, metric: 'out_of_sample_logloss_1x2', value: metric?.logLoss,
          sampleSize: metric?.n, outOfSample: true, evaluatedAtUtc: forecast.validationCompletedAtUtc } };
      for (let i = 0; i < selected.length; i++) {
        const probabilities = quoteProbabilities(forecast, selected[i]);
        if (probabilities) Object.assign(assessment.estimates[i], { probabilities, estimatedAtUtc: forecast.generatedAtUtc,
          experimentalForecast: true, uncertainty: forecast.uncertainty });
      }
    }
    const filename = path.join(PRIVATE_DIR, 'reviews', report.fetchedAtUtc.replace(/[:.]/g, '-') + '-' + randomUUID() + '.json');
    await saveJson(filename, { reportSha256: fingerprint(report), selections: selected, assessment });
    // The provider quote and an empty assessment are kept together for a local human review.
    console.log('Pacchetto privato di revisione:', filename);
    console.log('Compilare assessment nel pacchetto e passarlo a odds:analyze; nessuna selezione approvata.');
  } catch { console.error('Revisione fallita: controllare report e quote IDs. Nessuna pubblicazione.'); process.exitCode = 1; }
}
