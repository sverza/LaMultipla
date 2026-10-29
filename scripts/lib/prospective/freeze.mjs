import { canonicalTeam, trainingBefore } from '../goals/data.mjs';
import { fitPoisson, predict, baselines } from '../goals/model.mjs';
import { rng, quantile } from '../goals/metrics.mjs';
import { digest } from './store.mjs';

export const MODEL_VERSION = 'goals-v1-b630b78';
export const MODEL_COMMIT = 'b630b78caa4ab83363e71c14d7e8fe89336a9f70';
export const MODEL_CODE_SHA = '9f3164d585f686ee7ebfcb7a87e415a6fedde6992d1ab4104349a860c054ff11';
export const PROTOCOL_SHA = '8fa215bc08008e86c90d834b666de42a50235940f000167cc1a7e0b721c0977b';
export const CONFIG = { halfLife: 365, ridge: 5, rho: -0.1 };
export const probabilityVector = p => Array.isArray(p) && p.length === 3 && p.every(v => Number.isFinite(v) && v >= 0 && v <= 1)
  && Math.abs(p.reduce((a,b) => a+b,0)-1) < 1e-8;

export function validateReproduction(study, dataset, identity) {
  if (study.schema !== 'lamultipla-goals-study-v1' || dataset.schema !== 'lamultipla-results-dataset-v1'
    || dataset.license !== 'CC0-1.0' || digest(dataset) !== study.datasetSha256
    || digest(dataset.files) !== digest(study.sourceFiles)
    || digest(dataset.files) !== 'cba3153dea8c6430cc5223422649d12ea7f3aa99d1f057793067d05a933e969e'
    || dataset.licenseSha256 !== '36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673'
    || study.codeSha256 !== identity.codeRawSha256 || identity.codeCanonicalSha256 !== MODEL_CODE_SHA
    || study.protocolSha256 !== identity.protocolRawSha256 || identity.protocolCanonicalSha256 !== PROTOCOL_SHA
    || dataset.commit !== 'e6744429ee395bc86f247348c6184bb08d4eb361'
    || study.cutoffUtc !== '2026-10-09T23:00:00Z' || dataset.rows.length !== 4980
    || study.test.records.length !== 705 || study.test.excluded.length !== 45
    || Object.keys(CONFIG).some(k => study.selected[k] !== CONFIG[k])) throw new Error('Study/dataset/model does not match frozen v1 reference');
  const expected = [0.9809919813532423, 0.5860859777711311, 1.0874723600042104, 1.0869370003778915];
  const actual = [study.acceptance.oneXTwo.model.logLoss, study.acceptance.oneXTwo.model.brier,
    study.acceptance.oneXTwo.empirical.logLoss, study.acceptance.oneXTwo.leaguePoisson.logLoss];
  if (actual.some((v,i) => !Number.isFinite(v) || Math.abs(v-expected[i]) > 1e-9)) throw new Error('Historical metrics mismatch');
}
export function manifestFromReport(report, schedule) {
  if (schedule.schema !== 'lamultipla-prospective-schedule-v1' || !/^\d{4}\/\d{2}$/.test(schedule.season)
    || !Number.isInteger(schedule.matchday) || schedule.matchday<1 || schedule.matchday>38 || report.schema !== 'lamultipla-oddspapi-private-v2' || !report.round?.verified
    || report.source?.tournamentId !== 23 || report.round.season !== schedule.season
    || report.round.matchday !== schedule.matchday || report.coverage.length !== 10
    || !Array.isArray(schedule.events) || schedule.events.length !== 10) throw new Error('Confirmed ten-fixture round required');
  const ids = new Set();
  const events = schedule.events.map(event => {
    const row = report.coverage.find(r => r.fixtureId === event.fixtureId);
    if (!row || !/^[A-Za-z0-9_-]+$/.test(event.fixtureId) || !Number.isFinite(Date.parse(event.kickoffUtc)) || ids.has(event.fixtureId) || canonicalTeam(row.fixture[0]) !== canonicalTeam(event.home)
      || canonicalTeam(row.fixture[1]) !== canonicalTeam(event.away) || row.kickoffUtc !== event.kickoffUtc) throw new Error('Schedule/report identity mismatch');
    ids.add(event.fixtureId);
    return { fixtureId: event.fixtureId, home: canonicalTeam(event.home), away: canonicalTeam(event.away),
      kickoffUtc: event.kickoffUtc, season: schedule.season, matchday: schedule.matchday };
  });
  return { schema: 'lamultipla-round-manifest-v1', season: schedule.season, matchday: schedule.matchday,
    scheduleSource: schedule.scheduleSource, reportSha256: digest(report), events };
}
export function journalId(manifest) {
  return `${manifest.season.replace('/','-')}-round-${String(manifest.matchday).padStart(2,'0')}-${MODEL_VERSION}`;
}
export function batchForecast(rows, cutoffUtc, manifest, {replicates=40, seed=20261010}={}) {
  if (!Number.isInteger(replicates) || replicates < 40) throw new Error('Minimum 40 replicates required');
  const train = trainingBefore(rows, cutoffUtc);
  if (manifest.events.some(e => Date.parse(cutoffUtc) >= Date.parse(e.kickoffUtc))
    || train.some(r => manifest.events.some(e => r.season.replace('-','/') === e.season
      && r.home === e.home && r.away === e.away))) throw new Error('Target result in training');
  // One original monthly fit for the entire round. Bootstrap refits quantify uncertainty only.
  const model = fitPoisson(train, cutoffUtc, CONFIG), base = baselines(train);
  const central = manifest.events.map(e => predict(model, e.home, e.away));
  const samples = central.map(() => []), failures = central.map(() => 0);
  const blocks = new Map();
  for (const row of train) { const block = blocks.get(row.date) || []; block.push(row); blocks.set(row.date, block); }
  const groups = [...blocks.values()], random = rng(seed);
  for (let b=0;b<replicates;b++) {
    const boot = [];
    for (let i=0;i<groups.length;i++) boot.push(...groups[Math.floor(random()*groups.length)]);
    const fitted = fitPoisson(boot, cutoffUtc, CONFIG);
    manifest.events.forEach((e,i) => {
      const p = predict(fitted, e.home, e.away);
      if (p) samples[i].push(p.probabilities.oneXTwo); else failures[i]++;
    });
  }
  const forecasts = manifest.events.map((event,i) => ({ ...event, central: central[i]?.probabilities.oneXTwo ?? null,
    intervals95: central[i] && samples[i].length ? [0,1,2].map(k => [quantile(samples[i].map(s=>s[k]),.025),quantile(samples[i].map(s=>s[k]),.975)]) : null,
    uncertainty: {replicates,seed,failures:failures[i],sufficient:failures[i]/replicates<=.1},
    baselines: {empirical: base.empirical.oneXTwo, leaguePoisson: base.leaguePoisson.oneXTwo} }));
  return {model,forecasts};
}
export function sealJournal(batch, manifest, provenance, generatedAtUtc, legacyForecasts=[]) {
  const now = Date.parse(generatedAtUtc);
  if (!Number.isFinite(now)) throw new Error('Generation timestamp required');
  const entries = batch.forecasts.map(f => {
    let reason = null;
    if (!Number.isFinite(Date.parse(f.kickoffUtc)) || now >= Date.parse(f.kickoffUtc)-5*60000) reason='kickoff_started_or_within_freeze_buffer';
    else if (!f.central || !batch.model.converged) reason='team_history_or_fit_insufficient';
    else if (!f.uncertainty.sufficient) reason='uncertainty_insufficient';
    if (reason) return {fixtureId:f.fixtureId,home:f.home,away:f.away,kickoffUtc:f.kickoffUtc,season:f.season,matchday:f.matchday,
      status:'excluded',reason,generatedAtUtc,probabilities:null};
    if (!probabilityVector(f.central) || !probabilityVector(f.baselines.empirical) || !probabilityVector(f.baselines.leaguePoisson)) throw new Error('Invalid 1X2 distribution');
    return {...f,generatedAtUtc,status:'prospective',probabilities:f.central};
  }).map(e => ({...e,entrySha256:digest(e)}));
  return {schema:'lamultipla-prospective-journal-v1',id:journalId(manifest),modelVersion:MODEL_VERSION,modelCommit:MODEL_COMMIT,
    modelCodeCanonicalSha256:MODEL_CODE_SHA,protocolCanonicalSha256:PROTOCOL_SHA,config:CONFIG,
    generatedAtUtc,trainingCutoffUtc:batch.model.cutoffUtc,manifestSha256:digest(manifest),manifest,
    provenance,fit:batch.model,legacyForecasts,
    operationallyApproved:false,decision:'NO_BET',freezeBufferMinutes:5,entries,
    counts:{planned:entries.length,prospective:entries.filter(e=>e.status==='prospective').length,excluded:entries.filter(e=>e.status==='excluded').length}};
}
