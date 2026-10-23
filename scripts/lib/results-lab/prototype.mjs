import {reconcileSupplementalResults} from '../prospective/source-review.mjs';
import {digest} from '../prospective/store.mjs';
import {truth,metrics} from '../goals/metrics.mjs';
import {validateManifest} from './quality.mjs';
const keys=['oneXTwo','btts','over'];
function probability(p,key){return key==='oneXTwo'?Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12:typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;}
// Deliberately accepts only synthetic fixtures/forecasts/evidence. No original journal adapter exists.
export function evaluateSyntheticPairs({manifest,observations,forecasts,now=new Date()}){
 validateManifest(manifest);const at=new Date(now).getTime();
 if(manifest.synthetic!==true||forecasts?.schema!=='lamultipla-synthetic-review-forecasts-v1'||forecasts.sourceData!=='synthetic_test'
  ||!Number.isFinite(at)||!Array.isArray(observations)||observations.some(o=>o.evidence.synthetic!==true)
  ||!Array.isArray(forecasts.models)||forecasts.models.length<2||new Set(forecasts.models.map(m=>m.id)).size!==forecasts.models.length
  ||!Array.isArray(forecasts.entries)||new Set(forecasts.entries.map(e=>e.fixtureId)).size!==forecasts.entries.length)throw Error('RESULT_LAB_SYNTHETIC_ONLY');
 const events=new Map(manifest.events.map(e=>[e.fixtureId,e]));
 for(const m of forecasts.models)if(!/^[-a-zA-Z0-9_]+$/.test(m.id)||['fixtureId','y','__proto__','constructor','prototype'].includes(m.id)||!['reference','challenger','baseline'].includes(m.role)
  ||!Number.isFinite(Date.parse(m.registeredAtUtc)))throw Error('RESULT_LAB_MODEL_METADATA_INVALID');
 if(forecasts.models.filter(m=>m.role==='reference').length!==1||!forecasts.models.some(m=>m.role==='baseline'))throw Error('RESULT_LAB_REFERENCE_BASELINE_REQUIRED');
 for(const e of forecasts.entries){const event=events.get(e.fixtureId),generated=Date.parse(e.generatedAtUtc);
  if(!event||e.home!==event.home||e.away!==event.away||e.kickoffUtc!==event.kickoffUtc||!Number.isFinite(generated)||generated>=Date.parse(event.kickoffUtc)||generated>at
   ||forecasts.models.some(m=>Date.parse(m.registeredAtUtc)>generated)||!e.probabilities)throw Error('RESULT_LAB_NOT_PROSPECTIVE_OR_EXACT_IDENTITY');
  for(const [id,model] of Object.entries(e.probabilities)){
   if(!forecasts.models.some(m=>m.id===id)||!model||typeof model!=='object')throw Error('RESULT_LAB_PROBABILITY_INVALID');
   for(const key of Object.keys(model))if(!keys.includes(key)||!probability(model[key],key))throw Error('RESULT_LAB_PROBABILITY_INVALID');
  }
 }
 const review=reconcileSupplementalResults(manifest,observations,{now}),byId=new Map(review.rows.map(r=>[r.fixtureId,r])),records=[],excluded=[];
 for(const e of manifest.events)if(!forecasts.entries.some(f=>f.fixtureId===e.fixtureId))excluded.push({fixtureId:e.fixtureId,reason:'FORECAST_MISSING_NOT_RECONSTRUCTED'});
 for(const e of forecasts.entries){const r=byId.get(e.fixtureId);if(r.status!=='CORROBORATED_SUPPLEMENTAL'){excluded.push({fixtureId:e.fixtureId,reason:'RESULT_'+r.status});continue;}
  records.push({fixtureId:e.fixtureId,y:truth(r),...Object.fromEntries(forecasts.models.map(m=>[m.id,e.probabilities[m.id]??{}]))});
 }
 const markets=Object.fromEntries(keys.map(key=>{const paired=records.filter(r=>forecasts.models.every(m=>probability(r[m.id][key],key)));
  const skipped=records.filter(r=>!paired.includes(r)).map(r=>({fixtureId:r.fixtureId,reason:'PROBABILITY_MISSING_FOR_COMMON_MODEL_SET'}));
  const scores=Object.fromEntries(forecasts.models.map(m=>[m.id,metrics(paired,key,m.id)]));
  const reference=forecasts.models.find(m=>m.role==='reference').id;
  return [key,{n:paired.length,fixtureIds:paired.map(r=>r.fixtureId),missing:skipped,scores,
   differencesFromReference:Object.fromEntries(forecasts.models.filter(m=>m.id!==reference).map(m=>[m.id,paired.length?{logLoss:scores[m.id].logLoss-scores[reference].logLoss,brier:scores[m.id].brier-scores[reference].brier}:null]))}];
 }));
 return {schema:'lamultipla-synthetic-paired-review-v1',sourceData:'synthetic_test',generatedAtUtc:new Date(at).toISOString(),
  inputHashes:{manifest:digest(manifest),forecasts:digest(forecasts),evidence:observations.map(o=>digest(o.evidence))},review,models:forecasts.models,markets,excluded,
  scoring:{oneXTwoBrier:'sum over three classes',binaryBrier:'(p-y)^2',logLossFloor:1e-15,over:'strictly greater than 2.5 goals',calibration:'10 fixed bins; descriptive Wilson intervals from existing metrics; no independence or promotion claim'},
  inference:'DESCRIPTIVE_SYNTHETIC_ONLY_NO_SIGNIFICANCE_OR_PROMOTION',cohortEligible:false,trainingEligible:false,originalSourceReplaced:false,modelUpdated:false,actualStakeEUR:0};
}
