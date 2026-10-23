import {trainingBefore} from './data.mjs';
import {fitPoisson,predict,baselines} from './model.mjs';
import {metrics,truth,evaluateAcceptance,rng,quantile} from './metrics.mjs';
export const configs= [365,730].flatMap(halfLife=>[5,20].flatMap(ridge=>[-.1,0,.1].map(rho=>({halfLife,ridge,rho}))));
export function backtest(rows,seasons,config){
  const targets=rows.filter(r=>seasons.includes(r.season)), records=[],excluded=[],fits=[];const cache=new Map();
  for(const r of targets){const cutoff=`${r.date.slice(0,7)}-01T00:00:00.000Z`;
    if(!cache.has(cutoff)){const train=trainingBefore(rows,cutoff),model=fitPoisson(train,cutoff,config);
      cache.set(cutoff,{model,base:baselines(train)});fits.push({cutoff,converged:model.converged,iterations:model.iterations,trainingRows:train.length,maxAvailableAtUtc:model.maxResultAvailableAtUtc});}
    const {model,base}=cache.get(cutoff),p=predict(model,r.home,r.away);
    if(!p){excluded.push({key:r.key,reason:model.converged?'team_history_or_distribution_insufficient':'fit_not_converged'});continue;}
    records.push({key:r.key,date:r.date,season:r.season,y:truth(r),model:p.probabilities,...base});
  }return {records,excluded,fits};
}
export function runStudy(rows,audits){
  const tuning=[];
  for(const config of configs){const b=backtest(rows,['2022-23','2023-24'],config);
    const scores=['oneXTwo','btts','over'].map(k=>metrics(b.records,k)?.logLoss??Infinity);
    tuning.push({config,score:scores.reduce((s,v)=>s+v,0)/3,predicted:b.records.length,excluded:b.excluded.length});}
  // Do not reward a configuration for abstaining on difficult fixtures.
  const eligible=tuning.filter(t=>t.predicted===Math.max(...tuning.map(t=>t.predicted))&&Number.isFinite(t.score));
  if(!eligible.length)throw new Error('No converged tuning configuration');
  const selected=[...eligible].sort((a,b)=>a.score-b.score)[0].config;
  const test=backtest(rows,['2024-25','2025-26'],selected),testAudits=audits.filter(a=>['2024-25','2025-26'].includes(a.season));
  const acceptance=evaluateAcceptance(test.records,testAudits.reduce((s,a)=>s+a.results,0),testAudits);
  const shadow=backtest(rows,['2026-27'],selected);
  return {schema:'lamultipla-goals-study-v1',tuning,selected,acceptance,test,shadow,
    bySeason:Object.fromEntries(['2024-25','2025-26','2026-27'].map(s=>[s,Object.fromEntries(['oneXTwo','btts','over'].map(k=>[k,metrics((s==='2026-27'?shadow:test).records.filter(r=>r.season===s),k)]))])),
    limitations:['retrospective_corrected_source_not_point_in_time','availability_date_plus_48h_assumption','no_context_or_lineup_data','no_automatic_operational_approval']};
}
export function forecastWithUncertainty(rows,cutoffUtc,config,home,away,{replicates=40,seed=20261010}={}){
  if(replicates<40)throw new Error('At least 40 uncertainty replicates required');
  const train=trainingBefore(rows,cutoffUtc),model=fitPoisson(train,cutoffUtc,config),central=predict(model,home,away);
  if(!central)return {decision:'NO_BET',cause:'INSUFFICIENT_DATA',model};
  const blocks=new Map();for(const r of train){const a=blocks.get(r.date)||[];a.push(r);blocks.set(r.date,a);}
  const groups=[...blocks.values()],random=rng(seed),samples=[];let failed=0;
  for(let b=0;b<replicates;b++){const boot=[];for(let i=0;i<groups.length;i++)boot.push(...groups[Math.floor(random()*groups.length)]);
    const p=predict(fitPoisson(boot,cutoffUtc,config),home,away);if(p)samples.push(p.probabilities);else failed++;}
  const interval=values=>[quantile(values,.025),quantile(values,.975)];
  return {schema:'lamultipla-goals-forecast-v1',decision:'NO_BET',cause:'EXPERIMENTAL_MODEL_REQUIRES_VALIDATION_REVIEW',
    model,central,uncertainty:{replicates,seed,failed,sufficient:failed/replicates<=.1,
      oneXTwo:[0,1,2].map(k=>interval(samples.map(s=>s.oneXTwo[k]))),btts:interval(samples.map(s=>s.btts)),over25:interval(samples.map(s=>s.over))}};
}
