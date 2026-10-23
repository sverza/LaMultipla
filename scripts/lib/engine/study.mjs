import {trainingBefore} from '../goals/data.mjs';
import {fitPoisson,baselines,marketsFromGrid} from '../goals/model.mjs';
import {truth,metrics,rng,quantile} from '../goals/metrics.mjs';
import {fitGoals,predictGrid,temper} from './model.mjs';
export const EXPERIMENT=Object.freeze({version:'goals-engine-v2',registeredAtUtc:'2026-10-10T19:57:35Z',earliestKickoffUtc:'2026-10-13T00:00:00Z',
  tuning:['2022-23'],calibration:['2023-24'],forbiddenValidation:['2024-25','2025-26','2026-27'],temperatures:[.8,1,1.2],
  minProspective:500,confirmatoryRounds:60,minCoverage:.9,minResultCoverage:.95,bootstrapReplicates:1000,seed:20261010});
export const configurations=['dc','bivariate'].flatMap(kind=>[365,730].flatMap(halfLife=>[5,20].map(ridge=>({kind,halfLife,ridge}))));
export function walkForward(rows,seasons,config,{reference=false}={}) {
  if(seasons.some(s=>!['2022-23','2023-24'].includes(s)))throw new Error('Consumed test seasons forbidden for v2 development');
  // Only pre-July2024 scores can be touched during selection/calibration.
  const development=rows.filter(r=>r.date<'2024-07-01'),targets=development.filter(r=>seasons.includes(r.season)),cache=new Map(),records=[],excluded=[],fits=[];
  for(const r of targets){const cutoff=r.date.slice(0,7)+'-01T00:00:00.000Z';
    if(!cache.has(cutoff)){const train=trainingBefore(development,cutoff),fit=reference?fitPoisson(train,cutoff,{halfLife:365,ridge:5,rho:-.1}):fitGoals(train,cutoff,config);
      cache.set(cutoff,{fit,base:baselines(train)});fits.push({cutoff,trainingRows:train.length,converged:fit.converged,iterations:fit.iterations,rho:fit.rho??(reference?-.1:null),sharedRate:fit.sharedRate??null,gradientMax:fit.gradientMax??null});}
    const {fit,base}=cache.get(cutoff),grid=predictGrid(fit,r.home,r.away);
    if(!grid){excluded.push({key:r.key,reason:fit.converged?'insufficient_history_or_invalid_distribution':'fit_not_converged'});continue;}
    records.push({key:r.key,date:r.date,season:r.season,goals:r.goals,y:truth(r),grid,model:marketsFromGrid(grid),...base});
  }
  return {records,excluded,fits,planned:targets.length};
}
const gridScore=r=>-Math.log(Math.max(r.grid[r.goals[0]]?.[r.goals[1]]??0,1e-15));
export const fullLogLoss=records=>records.length?records.reduce((s,r)=>s+gridScore(r),0)/records.length:null;
export function gridMoments(grid){let home=0,away=0,hh=0,aa=0,ha=0;grid.forEach((r,h)=>r.forEach((p,a)=>{home+=h*p;away+=a*p;hh+=h*h*p;aa+=a*a*p;ha+=h*a*p;}));
  return {home,away,varianceHome:hh-home*home,varianceAway:aa-away*away,covariance:ha-home*away,p00:grid[0][0],p11:grid[1][1]};}
export function diagnostics(records){if(!records.length)return null;const moments=records.map(r=>gridMoments(r.grid)),mean=(a)=>a.reduce((s,v)=>s+v,0)/a.length;
  const home=mean(records.map(r=>r.goals[0])),away=mean(records.map(r=>r.goals[1]));
  return {observed:{home,away,varianceHome:mean(records.map(r=>r.goals[0]**2))-home**2,varianceAway:mean(records.map(r=>r.goals[1]**2))-away**2,
    covariance:mean(records.map(r=>r.goals[0]*r.goals[1]))-home*away,p00:mean(records.map(r=>Number(r.goals[0]===0&&r.goals[1]===0))),p11:mean(records.map(r=>Number(r.goals[0]===1&&r.goals[1]===1)))},
    predicted:Object.fromEntries(Object.keys(moments[0]).map(k=>[k,mean(moments.map(m=>m[k]))])),interpretation:'Descriptive development diagnostics, not causal identification'};
}
export function runDevelopment(rows,{progress=()=>{}}={}) {
  const tuning=[];for(const config of configurations){progress(`Tuning ${JSON.stringify(config)}`);const result=walkForward(rows,EXPERIMENT.tuning,config);
    tuning.push({config,n:result.records.length,excluded:result.excluded.length,fullGoalLogLoss:fullLogLoss(result.records),fits:result.fits});}
  const selected={},calibration={},reference=walkForward(rows,EXPERIMENT.calibration,null,{reference:true});
  for(const kind of ['dc','bivariate']) {
    const candidates=tuning.filter(t=>t.config.kind===kind),coverage=Math.max(...candidates.map(c=>c.n));
    const best=candidates.filter(c=>c.n===coverage&&c.fullGoalLogLoss!==null).sort((a,b)=>a.fullGoalLogLoss-b.fullGoalLogLoss)[0];if(!best)throw new Error('No converged development candidate');
    progress(`Calibration ${kind}`);const raw=walkForward(rows,EXPERIMENT.calibration,best.config);
    const trials=EXPERIMENT.temperatures.map(temperature=>{const records=raw.records.map(r=>({...r,grid:temper(r.grid,temperature)}));return {temperature,fullGoalLogLoss:fullLogLoss(records)};});
    const chosen=[...trials].sort((a,b)=>a.fullGoalLogLoss-b.fullGoalLogLoss)[0];selected[kind]={config:best.config,temperature:chosen.temperature};
    const records=raw.records.map(r=>{const grid=temper(r.grid,chosen.temperature);return {...r,grid,model:marketsFromGrid(grid)};});
    const original=new Map(reference.records.map(r=>[r.key,r])),paired=records.filter(r=>original.has(r.key)).map(r=>({...r,v1:original.get(r.key).model}));
    calibration[kind]={n:records.length,planned:raw.planned,excluded:raw.excluded,temperatureTrials:trials,fullGoalLogLoss:fullLogLoss(records),
      fullGoalLogLossV1SameEvents:fullLogLoss(paired.map(r=>original.get(r.key))),fits:raw.fits,diagnostics:diagnostics(records),
      markets:Object.fromEntries(['oneXTwo','btts','over'].map(k=>[k,{pairedN:paired.length,model:metrics(paired,k),v1:metrics(paired,k,'v1'),empirical:metrics(paired,k,'empirical'),leaguePoisson:metrics(paired,k,'leaguePoisson')}]))};
  }
  return {schema:'lamultipla-engine-development-v2',experiment:EXPERIMENT,tuning,selected,calibration,
    validFor:'DEVELOPMENT_AND_CALIBRATION_ONLY',validatedMarkets:[],operationallyApproved:false,
    limitations:['calibration_sample_used_for_temperature_selection_not_holdout','historical_source_can_have_posterior_corrections','consumed_test_never_reused','prospective_500_required']};
}
export function comparisonCI(records,key,baseline,{confidence=.95,replicates=1000}={}) {
  if(!records.length)return null;const groups=new Map();
  const loss=(p,y)=>-Math.log(Math.max(Array.isArray(p)?p[y]:y?p:1-p,1e-15));
  for(const r of records){const week=Math.floor(Date.parse(r.date)/(7*86400000)),a=groups.get(week)??[];a.push(loss(r.model[key],r.y[key])-loss(r[baseline][key],r.y[key]));groups.set(week,a);}
  const blocks=[...groups.values()],random=rng(EXPERIMENT.seed),samples=[];
  for(let b=0;b<replicates;b++){let sum=0,n=0;for(let i=0;i<blocks.length;i++){const block=blocks[Math.floor(random()*blocks.length)];for(const d of block){sum+=d;n++;}}samples.push(sum/n);}
  return {lower:quantile(samples,(1-confidence)/2),upper:quantile(samples,1-(1-confidence)/2),confidence,replicates,blocks:blocks.length,seed:EXPERIMENT.seed};
}
