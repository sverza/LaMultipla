import {canonicalTeam,trainingBefore} from '../goals/data.mjs';
import {fitPoisson,baselines,marketsFromGrid} from '../goals/model.mjs';
import {rng} from '../goals/metrics.mjs';
import {digest} from '../prospective/store.mjs';
import {validateCurrentDataset} from '../shadow/registry.mjs';
import {EXPERIMENT,configurations} from './study.mjs';
import {fitGoals,predictGrid} from './model.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readSnapshot,writeExclusive} from '../prospective/store.mjs';
export function validateStudy(study) {
  if(study?.schema!=='lamultipla-engine-development-v2'||digest(study.experiment)!==digest(EXPERIMENT)||study.validFor!=='DEVELOPMENT_AND_CALIBRATION_ONLY'
    ||study.operationallyApproved!==false||!Array.isArray(study.validatedMarkets)||study.validatedMarkets.length||!Number.isFinite(Date.parse(study.generatedAtUtc)))throw new Error('Registered experimental development study required');
  for(const kind of ['dc','bivariate']){const s=study.selected?.[kind];if(!s||s.config?.kind!==kind||!configurations.some(c=>digest(c)===digest(s.config))||!EXPERIMENT.temperatures.includes(s.temperature))throw new Error('Candidate/config not preregistered');}
}
export function validateSchedule(schedule,now) {
  const clock=new Date(now).getTime();
  if(!Number.isFinite(clock)||schedule?.schema!=='lamultipla-prospective-schedule-v1'||!/^\d{4}\/\d{2}$/.test(schedule.season)||!Number.isInteger(schedule.matchday)||schedule.matchday<1||schedule.matchday>38
    ||(schedule.season==='2026/27'&&schedule.matchday<=6)||!Array.isArray(schedule.events)||schedule.events.length!==10
    ||new Set(schedule.events.map(e=>e.fixtureId)).size!==10||new Set(schedule.events.flatMap(e=>[canonicalTeam(e.home),canonicalTeam(e.away)])).size!==20
    ||schedule.events.some(e=>!/^[-A-Za-z0-9_]+$/.test(e.fixtureId)||typeof e.home!=='string'||!e.home.trim()||typeof e.away!=='string'||!e.away.trim()
      ||!Number.isFinite(Date.parse(e.kickoffUtc))||Date.parse(e.kickoffUtc)<=clock+5*60000||Date.parse(e.kickoffUtc)<Date.parse(EXPERIMENT.earliestKickoffUtc)))throw new Error('Ten confirmed future fixtures outside frozen round6 required');
}
export function buildForecast(study,dataset,schedule,{clock=()=>new Date(),replicates=40}={}) {
  const startedAtUtc=new Date(clock()).toISOString();validateStudy(study);validateSchedule(schedule,startedAtUtc);validateCurrentDataset(dataset,startedAtUtc);
  if(Date.parse(study.generatedAtUtc)>Date.parse(startedAtUtc)||!Number.isInteger(replicates)||replicates<40)throw new Error('Study unavailable or insufficient bootstrap');
  const events=schedule.events.map(e=>({...e,home:canonicalTeam(e.home),away:canonicalTeam(e.away)}));
  const cutoff=events.map(e=>e.kickoffUtc.slice(0,7)).sort()[0]+'-01T00:00:00.000Z';if(Date.parse(cutoff)>Date.parse(startedAtUtc))throw new Error('Monthly cutoff in future');
  const train=trainingBefore(dataset.rows,cutoff);
  if(train.some(r=>events.some(e=>r.season.replace('-','/')===schedule.season&&r.home===e.home&&r.away===e.away)))throw new Error('Target result present in training');
  const referenceFit=fitPoisson(train,cutoff,{halfLife:365,ridge:5,rho:-.1}),base=baselines(train),models={};
  const entries=events.map(e=>({...e,status:'prospective',forecasts:{},referenceV1:null,baselines:base,exclusions:[]}));
  for(const [kind,selected] of Object.entries(study.selected)){
    const fit=fitGoals(train,cutoff,selected.config);models[kind]=fit;
    for(const e of entries){const grid=predictGrid(fit,e.home,e.away,selected.temperature);e.forecasts[kind]={grid,bootstrapGrids:[],probabilities:grid?marketsFromGrid(grid):null,temperature:selected.temperature};}
    const groups=new Map();for(const r of train){const key=Math.floor(Date.parse(r.date)/(7*86400000)),g=groups.get(key)??[];g.push(r);groups.set(key,g);}
    const blocks=[...groups.values()],random=rng(EXPERIMENT.seed);
    for(let b=0;b<replicates;b++){const rows=[];for(let k=0;k<blocks.length;k++)rows.push(...blocks[Math.floor(random()*blocks.length)]);
      const boot=fitGoals(rows,cutoff,selected.config);for(const e of entries){const grid=predictGrid(boot,e.home,e.away,selected.temperature);if(grid)e.forecasts[kind].bootstrapGrids.push(grid);}}
    for(const e of entries){const f=e.forecasts[kind];f.uncertainty={replicates,failures:replicates-f.bootstrapGrids.length,seed:EXPERIMENT.seed,sufficient:(replicates-f.bootstrapGrids.length)/replicates<=.1};
      if(!f.grid||!f.uncertainty.sufficient)e.exclusions.push(kind+':history_fit_or_uncertainty_insufficient');}
  }
  const generatedAtUtc=new Date(clock()).toISOString();validateSchedule(schedule,generatedAtUtc);
  if(Date.parse(generatedAtUtc)<Date.parse(startedAtUtc))throw new Error('Forecast clock moved backwards');
  for(const e of entries){const grid=predictGrid(referenceFit,e.home,e.away);e.referenceV1=grid?{grid,probabilities:marketsFromGrid(grid)}:null;
    e.generatedAtUtc=generatedAtUtc;if(e.exclusions.length)e.status='excluded';e.entrySha256=digest(e);}
  const manifest={season:schedule.season,matchday:schedule.matchday,events};
  return {schema:'lamultipla-engine-journal-v2',id:`${schedule.season.replace('/','-')}-round-${schedule.matchday}-${digest(study).slice(0,16)}`,
    modelVersion:EXPERIMENT.version,generatedAtUtc,startedAtUtc,trainingCutoffUtc:cutoff,studySha256:digest(study),datasetSha256:digest(dataset),
    datasetAcquiredAtUtc:dataset.acquiredAtUtc,sourceCommit:dataset.commit,sourceFiles:dataset.files,manifest,manifestSha256:digest(manifest),
    models,referenceFit,entries,counts:{planned:10,forecasted:entries.filter(e=>e.status==='prospective').length,excluded:entries.filter(e=>e.status!=='prospective').length},
    sourceData:study.synthetic||dataset.synthetic?'synthetic_test':'observed_original_results',
    experimental:true,operationallyApproved:false,decision:'NO_BET',reason:'PROSPECTIVE_VALIDATION_PENDING'};
}
export function validateJournal(journal,study){validateStudy(study);
  if(journal?.schema!=='lamultipla-engine-journal-v2'||journal.modelVersion!==EXPERIMENT.version||journal.studySha256!==digest(study)
    ||journal.manifestSha256!==digest(journal.manifest)||!Array.isArray(journal.entries)||journal.entries.length!==10||new Set(journal.entries.map(e=>e.fixtureId)).size!==10
    ||Date.parse(journal.generatedAtUtc)<Date.parse(study.generatedAtUtc)||Date.parse(journal.datasetAcquiredAtUtc)>Date.parse(journal.generatedAtUtc))throw new Error('Experimental journal/study mismatch');
  validateSchedule(journal.manifest&&{...journal.manifest,schema:'lamultipla-prospective-schedule-v1'},new Date(Date.parse(journal.generatedAtUtc)-1));
  for(const e of journal.entries){const {entrySha256,...content}=e;if(entrySha256!==digest(content)||e.generatedAtUtc!==journal.generatedAtUtc||Date.parse(journal.trainingCutoffUtc)>=Date.parse(e.kickoffUtc))throw new Error('Invalid frozen engine entry');}
}
export async function freezeEngine({root,study,dataset,schedule,clock=()=>new Date()}){
  const filename=path.join(root,'.local/model-v2/journals',`${schedule.season?.replace('/','-')}-round-${schedule.matchday}-${digest(study).slice(0,16)}.json`);
  try{await fs.stat(filename);const journal=await readSnapshot(filename);validateJournal(journal,study);
    if(digest(journal.manifest.events)!==digest(schedule.events.map(e=>({...e,home:canonicalTeam(e.home),away:canonicalTeam(e.away)}))))throw new Error('Existing engine forecast/schedule conflict');
    return {filename,journal,reused:true};}catch(e){if(e.code!=='ENOENT')throw e;}
  const journal=buildForecast(study,dataset,schedule,{clock});await writeExclusive(filename,journal);return {filename,journal,reused:false};
}
