import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {digest} from '../prospective/store.mjs';
import {fitPoisson,distribution,marketsFromGrid,baselines} from '../goals/model.mjs';
import {rng,quantile} from '../goals/metrics.mjs';

export const REFRESH_POLICY=Object.freeze({version:'goals-v1-data-refresh-research-v1',algorithm:'registered-goals-v1-fixed',halfLife:365,ridge:5,rho:-.1,
  bootstrapReplicates:40,seed:20261021,minHistoryPerTeam:20,maxFailureFraction:.1,trainingWindowYears:4,realForecastEnabled:false});
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(x)&&Number.isFinite(Date.parse(x));
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const requireThat=(test,reason)=>{if(!test)throw Error(reason);};
const identity=r=>`${r.season}:${r.home}:${r.away}`;
function rejectOdds(value){
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){requireThat(!['odds','price','prices','quotes','bookmaker','impliedProbability'].includes(key),'REFRESH_BOOKMAKER_INPUT_FORBIDDEN');rejectOdds(item);}
}

export async function refreshCodeIdentity(){
 const paths=[new URL('./index.mjs',import.meta.url),new URL('../goals/model.mjs',import.meta.url),new URL('../goals/metrics.mjs',import.meta.url),new URL('../goals/data.mjs',import.meta.url)];
 const files=[];for(const url of paths)files.push({path:fileURLToPath(url).replaceAll('\\','/').split('/scripts/')[1],sha256:digest(await fs.readFile(url,'utf8'))});
 return {version:REFRESH_POLICY.version,files,sha256:digest(files)};
}

function validatePlan(plan){
 requireThat(plan?.schema==='lamultipla-refresh-plan-draft-v1'&&plan.registrationStatus==='DRAFT_REQUIRES_APPROVAL'&&iso(plan.createdAtUtc)&&iso(plan.cutoffUtc)
  &&Date.parse(plan.cutoffUtc)<=Date.parse(plan.createdAtUtc)&&plan.realForecastAuthorized===false,'REFRESH_PLAN_DRAFT_REQUIRED');
 requireThat(plan.season==='2026-27'&&plan.targetMatchday===8&&Array.isArray(plan.targetEvents)&&plan.targetEvents.length===10
  &&new Set(plan.targetEvents.map(e=>e.fixtureId)).size===10&&new Set(plan.targetEvents.flatMap(e=>[e.home,e.away])).size===20
  &&plan.targetEvents.every(e=>typeof e.fixtureId==='string'&&e.fixtureId&&typeof e.home==='string'&&e.home&&typeof e.away==='string'&&e.away&&e.home!==e.away
   &&iso(e.kickoffUtc)&&Date.parse(e.kickoffUtc)>Date.parse(plan.createdAtUtc)),'REFRESH_FUTURE_TARGET_REQUIRED');
}

/** Build a separate mixed-source research dataset. No fetch, write, fit or original-data mutation. */
export function buildRefreshDataset({base,supplement,approval,plan}){
 rejectOdds({base,supplement,approval,plan});
 validatePlan(plan);const cutoff=Date.parse(plan.cutoffUtc);
 requireThat(base?.schema==='lamultipla-refresh-base-v1'&&base.sourceId==='openfootball'&&base.license==='CC0-1.0'&&iso(base.acquiredAtUtc)
  &&Date.parse(base.acquiredAtUtc)<=cutoff&&hash(base.snapshotSha256)&&base.rowsSha256===digest(base.rows)&&Array.isArray(base.rows),'REFRESH_BASE_PROVENANCE_REQUIRED');
 requireThat(approval?.schema==='lamultipla-source-training-approval-v1'&&approval.status==='APPROVED'&&approval.privateTrainingPermitted===true
  &&approval.privateSnapshotRetentionPermitted===true&&hash(approval.termsEvidenceSha256)&&hash(approval.userApprovalEvidenceSha256)
  &&iso(approval.approvedAtUtc)&&Date.parse(approval.approvedAtUtc)<=cutoff&&approval.sourceId===supplement?.sourceId,'REFRESH_SOURCE_TRAINING_NOT_APPROVED');
 requireThat(supplement?.schema==='lamultipla-refresh-supplement-v1'&&typeof supplement.sourceId==='string'&&supplement.sourceId&&supplement.sourceId!=='openfootball'
  &&hash(supplement.snapshotSha256)&&iso(supplement.acquiredAtUtc)&&Date.parse(supplement.acquiredAtUtc)<=cutoff&&supplement.recordsSha256===digest(supplement.records)
  &&Array.isArray(supplement.records)&&supplement.records.length===20&&supplement.reconciliation?.status==='VERIFIED'
  &&supplement.reconciliation.recordsSha256===supplement.recordsSha256&&hash(supplement.reconciliation.manifestSha256),'REFRESH_SUPPLEMENT_UNVERIFIED');
 const planned=supplement.reconciliation.events;
 requireThat(Array.isArray(planned)&&planned.length===20&&digest(planned)===supplement.reconciliation.manifestSha256
  &&new Set(planned.map(e=>e.fixtureId)).size===20&&planned.every(e=>e.season===plan.season&&[6,7].includes(e.matchday))
  &&[6,7].every(d=>{const group=planned.filter(e=>e.matchday===d),teams=group.flatMap(e=>[e.home,e.away]),targetTeams=plan.targetEvents.flatMap(e=>[e.home,e.away]);
   return group.length===10&&new Set(teams).size===20&&digest([...teams].sort())===digest([...targetTeams].sort());}),'REFRESH_TWENTY_VERIFIED_FIXTURES_REQUIRED');
 const plannedById=new Map(planned.map(e=>[e.fixtureId,e])),seenSupplement=new Set(),rows=[],seen=new Set();
 function append(row,sourceId){
  const firstYear=Number(row.season?.slice(0,4)),seasonEnd=`${firstYear+1}-${row.season==='2019-20'?'09':'07'}-01`;
  requireThat(typeof row.key==='string'&&row.key&&typeof row.season==='string'&&/^\d{4}-\d{2}$/.test(row.season)
   &&row.season===`${firstYear}-${String(firstYear+1).slice(-2)}`&&row.date>=`${firstYear}-07-01`&&row.date<seasonEnd
   &&typeof row.home==='string'&&row.home&&typeof row.away==='string'&&row.away&&row.home!==row.away
   &&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&new Date(row.date).toISOString().slice(0,10)===row.date&&iso(row.availableAtUtc)
   &&Date.parse(row.availableAtUtc)<cutoff&&Date.parse(row.date)<=Date.parse(row.availableAtUtc)&&Date.parse(row.date)<cutoff
   &&Array.isArray(row.goals)&&row.goals.length===2&&row.goals.every(g=>Number.isInteger(g)&&g>=0&&g<=30),'REFRESH_INVALID_OR_FUTURE_ROW');
  requireThat(!plan.targetEvents.some(e=>row.fixtureId===e.fixtureId||(row.season===plan.season&&row.home===e.home&&row.away===e.away)),'REFRESH_TARGET_LEAKAGE');
  const id=identity(row);requireThat(!seen.has(id),'REFRESH_DUPLICATE_OR_REVISION_REQUIRES_REVIEW');seen.add(id);
  // Preserve discarded history in its source snapshot; only the declared four-year window enters this fit.
  if(Date.parse(row.date)>=cutoff-REFRESH_POLICY.trainingWindowYears*365.25*86400000)rows.push({...row,goals:[...row.goals],dataSourceId:sourceId});
 }
 for(const row of base.rows)append(row,base.sourceId);
 for(const r of supplement.records){
  const e=plannedById.get(r.fixtureId);
  requireThat(e&&!seenSupplement.has(r.fixtureId)&&r.season===e.season&&r.matchday===e.matchday&&r.home===e.home&&r.away===e.away
   &&r.kickoffUtc===e.kickoffUtc&&iso(r.kickoffUtc)&&r.status==='FINISHED'&&r.duration==='REGULAR'&&r.awarded===false
   &&r.revisionConflict===false&&r.observedAtUtc===supplement.acquiredAtUtc&&Date.parse(r.kickoffUtc)+90*60000<=Date.parse(r.observedAtUtc)
   &&iso(r.verifiedAtUtc)&&Date.parse(r.verifiedAtUtc)>=Date.parse(r.observedAtUtc)&&Date.parse(r.verifiedAtUtc)<cutoff,'REFRESH_RESULT_IDENTITY_OR_STATUS_UNVERIFIED');
  seenSupplement.add(r.fixtureId);
  append({key:identity(r),fixtureId:r.fixtureId,season:r.season,date:r.kickoffUtc.slice(0,10),home:r.home,away:r.away,goals:r.goals,
   availableAtUtc:r.verifiedAtUtc},supplement.sourceId);
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
 const value={schema:'lamultipla-refresh-dataset-v1',version:REFRESH_POLICY.version,synthetic:base.synthetic===true&&supplement.synthetic===true,
  cutoffUtc:plan.cutoffUtc,planSha256:digest(plan),baseSnapshotSha256:base.snapshotSha256,baseRowsSha256:base.rowsSha256,
  supplementarySnapshotSha256:supplement.snapshotSha256,supplementaryRecordsSha256:supplement.recordsSha256,approvalSha256:digest(approval),
  sourceIds:[base.sourceId,supplement.sourceId],sourceClass:'MIXED_ORIGINAL_AND_APPROVED_SUPPLEMENT_NEVER_ORIGINAL_CC0',
  requiredSupplementaryResults:20,verifiedSupplementaryResults:20,rows};
 return {...value,datasetSha256:digest(value)};
}

export async function challengerDraft(plan){
 validatePlan(plan);const code=await refreshCodeIdentity();
 return {schema:'lamultipla-refresh-registration-draft-v1',id:`${REFRESH_POLICY.version}-${digest(plan).slice(0,16)}`,status:'DRAFT_REQUIRES_APPROVAL',
  plan,planSha256:digest(plan),policy:REFRESH_POLICY,code,requires:['SOURCE_TRAINING_APPROVAL','DATA_RECONCILIATION','COHORT_APPROVAL','FORECAST_AUTHORIZATION'],
  evaluation:{pairedFutureEventsOnly:true,metrics:['logLoss','brier','calibration','coverage'],retainNegativeExperiments:true,automaticPromotion:false},
  experimental:true,operationallyApproved:false,realStakeEuro:0};
}

/** Development-only execution. Deliberately refuses all observed datasets and exposes no real forecast CLI. */
export async function runSyntheticRefresh(input){
 requireThat(input.base?.synthetic===true&&input.supplement?.synthetic===true,'REFRESH_REAL_FORECAST_NOT_AUTHORIZED');
 const dataset=buildRefreshDataset(input),draft=await challengerDraft(input.plan),fit=fitPoisson(dataset.rows,dataset.cutoffUtc,REFRESH_POLICY);
 requireThat(fit.converged,'REFRESH_FIT_NOT_CONVERGED');
 const entries=input.plan.targetEvents.map(e=>({...e,grid:null,probabilities:null,intervals:null,bootstrapGrids:[],status:'excluded',reasons:[]}));
 const gridFor=(model,e)=>{const n=model.teams.length,i=model.teams.indexOf(e.home),j=model.teams.indexOf(e.away),x=model.coefficients;
  if(!model.converged||i<0||j<0||model.counts[e.home]<REFRESH_POLICY.minHistoryPerTeam||model.counts[e.away]<REFRESH_POLICY.minHistoryPerTeam)return null;
  return distribution(Math.exp(x[0]+x[1]+x[2+i]+x[2+n+j]),Math.exp(x[0]+x[2+j]+x[2+n+i]),model.config.rho);};
 for(const e of entries){e.grid=gridFor(fit,e);e.probabilities=e.grid?marketsFromGrid(e.grid):null;
  e.totalProbabilities=e.grid?Object.fromEntries([1.5,2.5,3.5].map(line=>{const p=marketsFromGrid(e.grid,line);return [line,{over:p.over,under:p.under,push:p.push}];})):null;}
 const groups=new Map();for(const row of dataset.rows){const week=Math.floor(Date.parse(row.date)/(7*86400000));if(!groups.has(week))groups.set(week,[]);groups.get(week).push(row);}
 const blocks=[...groups.values()],random=rng(REFRESH_POLICY.seed);let failedFits=0;
 for(let b=0;b<REFRESH_POLICY.bootstrapReplicates;b++){
  const rows=[];for(let i=0;i<blocks.length;i++)rows.push(...blocks[Math.floor(random()*blocks.length)]);
  let boot;try{boot=fitPoisson(rows,dataset.cutoffUtc,REFRESH_POLICY);}catch{failedFits++;continue;}
  if(!boot.converged){failedFits++;continue;}
  for(const e of entries){const grid=gridFor(boot,e);if(grid)e.bootstrapGrids.push(grid);}
 }
 for(const e of entries){
  const failures=REFRESH_POLICY.bootstrapReplicates-e.bootstrapGrids.length;
  e.uncertainty={replicates:REFRESH_POLICY.bootstrapReplicates,failures,sufficient:failures/REFRESH_POLICY.bootstrapReplicates<=REFRESH_POLICY.maxFailureFraction,
   seed:REFRESH_POLICY.seed,method:'weekly-block-bootstrap-percentile-marginal-not-simultaneous'};
  if(!e.grid)e.reasons.push('FIT_HISTORY_OR_GRID_INSUFFICIENT');if(!e.uncertainty.sufficient)e.reasons.push('BOOTSTRAP_FAILURE_FRACTION_EXCEEDED');
  if(!e.reasons.length){const samples=e.bootstrapGrids.map(g=>marketsFromGrid(g)),interval=arr=>[quantile(arr,.025),quantile(arr,.975)];
   e.intervals={oneXTwo:[0,1,2].map(i=>interval(samples.map(p=>p.oneXTwo[i]))),btts:interval(samples.map(p=>p.btts)),
    totals:Object.fromEntries([1.5,2.5,3.5].map(line=>[line,{over:interval(e.bootstrapGrids.map(g=>marketsFromGrid(g,line).over)),under:interval(e.bootstrapGrids.map(g=>marketsFromGrid(g,line).under))}]))};
   e.status='synthetic_research_only';}
  e.entrySha256=digest(e);
 }
 const modelIdentity={version:REFRESH_POLICY.version,codeSha256:draft.code.sha256,datasetSha256:dataset.datasetSha256,planSha256:draft.planSha256,policySha256:digest(REFRESH_POLICY)};
 const value={schema:'lamultipla-refresh-synthetic-experiment-v1',modelId:`${REFRESH_POLICY.version}-${digest(modelIdentity).slice(0,24)}`,modelIdentity,registrationDraftId:draft.id,version:REFRESH_POLICY.version,code:draft.code,planSha256:draft.planSha256,
  datasetSha256:dataset.datasetSha256,cutoffUtc:dataset.cutoffUtc,fit,baseline:baselines(dataset.rows),entries,
  bootstrap:{replicates:REFRESH_POLICY.bootstrapReplicates,failedFits},sourceData:'synthetic_test',comparisonConclusion:'NOT_EVALUATED_NO_CLAIM_OF_IMPROVEMENT',
  retainRegardlessOfOutcome:true,eligibleForSelector:false,operationallyApproved:false,realStakeEuro:0};
 return {...value,experimentSha256:digest(value)};
}
