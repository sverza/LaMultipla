import { metrics, truth } from '../goals/metrics.mjs';
import { probabilityVector } from './freeze.mjs';
import { digest } from './store.mjs';

export function score1X2(p, outcome) {
  if (!probabilityVector(p) || !Number.isInteger(outcome) || outcome<0 || outcome>2) throw new Error('Invalid scoring inputs');
  return {assignedProbability:p[outcome],logLoss:-Math.log(Math.max(p[outcome],1e-15)),
    brier:p.reduce((sum,v,i)=>sum+(v-Number(i===outcome))**2,0)};
}
export function evaluateJournal(journal, results, {evaluatedAtUtc=new Date().toISOString(),markets=[]}={}) {
  if(journal.provenance?.cohortEligible===false)throw new Error('Shadow revision excluded from original scientific cohort');
  if (journal.schema!=='lamultipla-prospective-journal-v1' || results.schema!=='lamultipla-result-observations-v1'
    || results.license!=='CC0-1.0' || results.source!=='openfootball/football.json' || !/^[a-f0-9]{40}$/.test(results.sourceCommit)
    || !Number.isFinite(Date.parse(results.acquiredAtUtc)) || !Number.isFinite(Date.parse(evaluatedAtUtc))
    || Date.parse(results.acquiredAtUtc)>Date.parse(evaluatedAtUtc)) throw new Error('Invalid journal/results');
  const records=[],pending=[],marketPairs=[];
  for (const entry of journal.entries) {
    const {entrySha256,...content}=entry;
    if (digest(content)!==entrySha256) throw new Error('Forecast entry hash mismatch');
    if (entry.status!=='prospective') continue;
    if (!Number.isFinite(Date.parse(entry.generatedAtUtc)) || !Number.isFinite(Date.parse(entry.kickoffUtc))
      || Date.parse(entry.generatedAtUtc)>=Date.parse(entry.kickoffUtc)) throw new Error('Not a prospective forecast');
    const matches=results.rows.filter(r=>r.season===entry.season.replace('/','-')&&r.home===entry.home&&r.away===entry.away);
    if (matches.length>1) throw new Error('Conflicting/duplicate final results');
    const r=matches[0];
    if (!r) {pending.push({fixtureId:entry.fixtureId,reason:'result_missing'});continue;}
    if (r.date!==entry.kickoffUtc.slice(0,10)) {pending.push({fixtureId:entry.fixtureId,reason:'result_date_mismatch_requires_reschedule_evidence'});continue;}
    if (!Number.isFinite(Date.parse(r.availableAtUtc)) || Date.parse(results.acquiredAtUtc)<Date.parse(r.availableAtUtc)
      || Date.parse(r.availableAtUtc)>Date.parse(evaluatedAtUtc)||Date.parse(results.acquiredAtUtc)<=Date.parse(entry.kickoffUtc)) {
      pending.push({fixtureId:entry.fixtureId,reason:'result_not_observed_after_event'});continue;
    }
    if (!Array.isArray(r.goals)||r.goals.length!==2||r.goals.some(g=>!Number.isInteger(g)||g<0||g>30)) throw new Error('Invalid final score');
    const outcome=truth(r).oneXTwo;
    const scored={fixtureId:entry.fixtureId,date:r.date,goals:r.goals,outcome:['1','X','2'][outcome],entrySha256,
      y:{oneXTwo:outcome},model:{oneXTwo:entry.probabilities},empirical:{oneXTwo:entry.baselines.empirical},leaguePoisson:{oneXTwo:entry.baselines.leaguePoisson},
      scores:{model:score1X2(entry.probabilities,outcome),empirical:score1X2(entry.baselines.empirical,outcome),leaguePoisson:score1X2(entry.baselines.leaguePoisson,outcome)}};
    records.push(scored);
    const market=markets.find(m=>m.fixtureId===entry.fixtureId);
    if (market && market.journalId===journal.id && market.entrySha256===entrySha256 && market.compatible===true
      && probabilityVector(market.probabilities)) marketPairs.push({...scored,market:{oneXTwo:market.probabilities},marketSnapshotSha256:digest(market)});
  }
  return {schema:'lamultipla-prospective-evaluation-v1',journalId:journal.id,journalSha256:digest(journal),modelVersion:journal.modelVersion,
    resultsSha256:digest(results),evaluatedAtUtc,sourceVerification:'community_fulltime_results_not_officially_certified',
    counts:{planned:journal.entries.length,forecasted:journal.counts.prospective,excluded:journal.counts.excluded,settled:records.length,pending:pending.length,marketPaired:marketPairs.length},
    records,pending,marketPairs,metrics:Object.fromEntries(['model','empirical','leaguePoisson'].map(k=>[k,metrics(records,'oneXTwo',k)])),
    marketComparison:{sameEventsOnly:true,n:marketPairs.length,model:metrics(marketPairs,'oneXTwo'),market:metrics(marketPairs,'oneXTwo','market')},
    operationallyApproved:false,smallSampleNotValidation:true};
}
export function progressiveMetrics(journals,evaluations) {
  const seen=new Set(),records=[],marketRecords=[],rounds=[],conflicts=[];
  for (const journal of [...journals].sort((a,b)=>a.generatedAtUtc.localeCompare(b.generatedAtUtc))) {
    if(journal.provenance?.cohortEligible===false)throw new Error('Shadow revision cannot enter scientific progression');
    const versions=evaluations.filter(e=>e.journalId===journal.id&&e.journalSha256===digest(journal)).sort((a,b)=>a.evaluatedAtUtc.localeCompare(b.evaluatedAtUtc));
    const settled=new Map();
    for (const ev of versions) for (const r of ev.records) {
      if (settled.has(r.fixtureId)&&digest(settled.get(r.fixtureId).goals)!==digest(r.goals)) conflicts.push({journalId:journal.id,fixtureId:r.fixtureId,reason:'result_source_revision_requires_review'});
      else if (!settled.has(r.fixtureId))settled.set(r.fixtureId,r);
    }
    const accepted=[...settled.values()].filter(r=>!conflicts.some(c=>c.journalId===journal.id&&c.fixtureId===r.fixtureId));
    for (const r of accepted) {
      const key=`${journal.modelVersion}:${journal.manifest.season}:${r.fixtureId}`;
      if (seen.has(key))throw new Error('Duplicate prospective fixture across journals');seen.add(key);records.push(r);
      const paired=versions.flatMap(v=>v.marketPairs||[]).find(p=>p.fixtureId===r.fixtureId&&digest(p.goals)===digest(r.goals));
      if(paired)marketRecords.push(paired);
    }
    rounds.push({journalId:journal.id,matchday:journal.manifest.matchday,forecasted:journal.counts.prospective,
      scored:accepted.length,cumulative:records.length,roundMetrics:Object.fromEntries(['model','empirical','leaguePoisson'].map(k=>[k,metrics(accepted,'oneXTwo',k)])),marketPaired:marketRecords.length,
      marketComparison:{model:metrics(marketRecords,'oneXTwo'),market:metrics(marketRecords,'oneXTwo','market')},metrics:Object.fromEntries(['model','empirical','leaguePoisson'].map(k=>[k,metrics(records,'oneXTwo',k)]))});
  }
  return {schema:'lamultipla-prospective-progress-v1',rounds,conflicts,operationallyApproved:false,
    note:'Each fixture counted once; conflicting source corrections withheld pending explicit review'};
}
