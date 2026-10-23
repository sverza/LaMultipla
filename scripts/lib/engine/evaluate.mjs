import {digest} from '../prospective/store.mjs';
import {truth,metrics} from '../goals/metrics.mjs';
import {validateJournal} from './forecast.mjs';
import {EXPERIMENT,comparisonCI} from './study.mjs';
export function evaluateEngine(journal,study,results,{now=new Date()}={}){
  validateJournal(journal,study);const clock=new Date(now).getTime();
  if(!Number.isFinite(clock)||results?.schema!=='lamultipla-result-observations-v1'||results.source!=='openfootball/football.json'||results.license!=='CC0-1.0'
    ||!/^[a-f0-9]{40}$/.test(results.sourceCommit)||!Array.isArray(results.rows)||!Number.isFinite(Date.parse(results.acquiredAtUtc))||Date.parse(results.acquiredAtUtc)>clock)throw new Error('Observed authorized results required');
  const records=[],pending=[],observed=[];
  for(const e of journal.entries){const matches=results.rows.filter(r=>r.season===journal.manifest.season.replace('/','-')&&r.home===e.home&&r.away===e.away);
    if(matches.length>1)throw new Error('Duplicate/conflicting results');const r=matches[0];
    if(!r||r.date!==e.kickoffUtc.slice(0,10)||Date.parse(results.acquiredAtUtc)<=Date.parse(e.kickoffUtc)||!Number.isFinite(Date.parse(r.availableAtUtc))
      ||Date.parse(r.availableAtUtc)!==Date.parse(r.date)+48*3600000||Date.parse(r.availableAtUtc)>Date.parse(results.acquiredAtUtc)){pending.push({fixtureId:e.fixtureId,reason:'result_missing_unobserved_or_rescheduled'});continue;}
    if(!Array.isArray(r.goals)||r.goals.length!==2||r.goals.some(g=>!Number.isInteger(g)||g<0||g>30))throw new Error('Invalid goals');
    observed.push({fixtureId:e.fixtureId,goals:r.goals});
    if(e.status!=='prospective'||!e.referenceV1||!e.forecasts.dc.probabilities||!e.forecasts.bivariate.probabilities)continue;
    records.push({fixtureId:e.fixtureId,date:r.date,season:r.season,goals:r.goals,y:truth(r),dc:e.forecasts.dc.probabilities,bivariate:e.forecasts.bivariate.probabilities,
      v1:e.referenceV1.probabilities,...e.baselines});
  }
  return {schema:'lamultipla-engine-evaluation-v2',journalSha256:digest(journal),studySha256:digest(study),modelVersion:journal.modelVersion,
    journalId:journal.id,evaluatedAtUtc:new Date(clock).toISOString(),resultsSha256:digest(results),sourceCommit:results.sourceCommit,
    planned:journal.counts.planned,forecasted:journal.counts.forecasted,observed,records,pending,
    markets:Object.fromEntries(['dc','bivariate'].map(kind=>[kind,Object.fromEntries(['oneXTwo','btts','over'].map(k=>[k,metrics(records,k,kind)]))])),
    operationallyApproved:false,actualStakeEUR:0};
}
export function acceptance(records,planned,resultCount,kind) {
  return Object.fromEntries(['btts','over'].map(key=>{const paired=records.map(r=>({...r,model:r[kind]})),model=metrics(paired,key),reasons=[];
    const comparisons={v1:comparisonCI(paired,key,'v1',{confidence:.9875}),empirical:comparisonCI(paired,key,'empirical'),leaguePoisson:comparisonCI(paired,key,'leaguePoisson')};
    if(paired.length<EXPERIMENT.minProspective)reasons.push('prospective_sample_below_500');
    if(paired.length/Math.max(planned,1)<EXPERIMENT.minCoverage)reasons.push('coverage_below_90_percent');
    if(resultCount/Math.max(planned,1)<EXPERIMENT.minResultCoverage)reasons.push('source_result_coverage_below_95_percent');
    if(!model||model.calibration.some(c=>c.ece>.08))reasons.push('calibration_failed');
    for(const baseline of ['v1','empirical','leaguePoisson']){const metric=metrics(paired,key,baseline);
      if(!comparisons[baseline]||comparisons[baseline].upper>=0)reasons.push('no_confident_improvement_over_'+baseline);
      if(!model||!metric||model.brier>metric.brier+.005)reasons.push('brier_noninferiority_failed_'+baseline);}
    return [key,{statisticalGatePassed:!reasons.length,promotionRequiresExplicitReview:true,operationallyApproved:false,reasons,model,comparisons}];}));
}
export function engineProgress(journals,evaluations,{now=new Date()}={}){
  const clock=new Date(now).getTime();if(!Number.isFinite(clock))throw new Error('Valid progress clock required');
  const conflicts=[],groups=new Map();
  for(const journal of journals){const versions=evaluations.filter(e=>e.journalSha256===digest(journal)&&e.studySha256===journal.studySha256).sort((a,b)=>a.evaluatedAtUtc.localeCompare(b.evaluatedAtUtc));
    const observed=new Map();for(const v of versions)for(const r of v.observed){const old=observed.get(r.fixtureId);if(old&&digest(old)!==digest(r.goals))conflicts.push({journalId:journal.id,fixtureId:r.fixtureId,reason:'source_result_revision'});observed.set(r.fixtureId,r.goals);}
    const latest=versions.at(-1);if(latest)for(const id of observed.keys())if(!latest.observed.some(r=>r.fixtureId===id))conflicts.push({journalId:journal.id,fixtureId:id,reason:'result_removed'});
    const group=groups.get(journal.studySha256)??{planned:0,forecasts:0,observed:0,records:[],ids:new Set(),conflicted:false,rounds:[]};
    for(const e of journal.entries){if(group.ids.has(e.fixtureId))throw new Error('Duplicate prospective fixture within model cohort');group.ids.add(e.fixtureId);}
    group.planned+=journal.counts.planned;group.forecasts+=journal.counts.forecasted;
    if(conflicts.some(c=>c.journalId===journal.id))group.conflicted=true;else if(latest){group.observed+=latest.observed.length;group.records.push(...latest.records);}
    group.rounds.push({journalId:journal.id,journalSha256:digest(journal),season:journal.manifest.season,matchday:journal.manifest.matchday,
      lastKickoffUtc:journal.entries.map(e=>e.kickoffUtc).sort().at(-1),planned:journal.counts.planned,forecasted:journal.counts.forecasted,
      observed:latest?.observed.length??0,records:latest?.records??[]});
    groups.set(journal.studySha256,group);
  }
  return {schema:'lamultipla-engine-progress-v2',generatedAtUtc:new Date(clock).toISOString(),conflicts,cohorts:Object.fromEntries([...groups].map(([hash,g])=>{
    const frame=g.rounds.sort((a,b)=>a.lastKickoffUtc.localeCompare(b.lastKickoffUtc)).slice(0,EXPERIMENT.confirmatoryRounds);
    const continuous=frame.every((r,i)=>!i|| (frame[i-1].matchday<38?r.season===frame[i-1].season&&r.matchday===frame[i-1].matchday+1:
      Number(r.season.slice(0,4))===Number(frame[i-1].season.slice(0,4))+1&&r.matchday===1));
    const closed=frame.length===EXPERIMENT.confirmatoryRounds&&continuous&&clock>=Date.parse(frame.at(-1).lastKickoffUtc)+48*3600000;
    const paired=frame.flatMap(r=>r.records),planned=frame.reduce((s,r)=>s+r.planned,0),observed=frame.reduce((s,r)=>s+r.observed,0);
    return [hash,{planned:g.planned,forecasted:g.forecasts,observed:g.observed,pairedN:g.records.length,conflicted:g.conflicted,
      monitoringType:'DESCRIPTIVE_ROLLING_NOT_A_CONFIRMATORY_TEST',
      rollingMetrics:Object.fromEntries(['dc','bivariate','v1','empirical','leaguePoisson'].map(k=>[k,Object.fromEntries(['oneXTwo','btts','over'].map(m=>[m,metrics(g.records,m,k)]))])),
      rounds:g.rounds.map(({records,...r})=>({...r,pairedN:records.length})),
      confirmatoryFrame:{roundsRequired:EXPERIMENT.confirmatoryRounds,continuous,closed,planned,pairedN:paired.length,journalSha256s:frame.map(r=>r.journalSha256)},
      acceptance:g.conflicted||!closed?null:Object.fromEntries(['dc','bivariate'].map(k=>[k,acceptance(paired,planned,observed,k)])),
      primaryMarkets:['btts','over2.5'],otherMarketsValidation:'REQUIRES_SEPARATE_LINE_AND_SETTLEMENT_PROTOCOL',operationallyApproved:false}];})),
    operationallyApproved:false,actualStakeEUR:0};
}
