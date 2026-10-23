import {requireRegisteredCode} from '../engine/registry.mjs';
import {validateSchedule,freezeEngine} from '../engine/forecast.mjs';
import {validateCurrentDataset} from '../shadow/registry.mjs';
import {validateAnalysisSchedule} from '../orchestration/analysis-plan.mjs';
import {reconcileCalendar} from '../orchestration/round-manager.mjs';
import {PROGRESSIVE_POLICY} from '../orchestration/progressive-policy.mjs';
import {digest} from '../prospective/store.mjs';
import {DIAGNOSTIC_POLICY} from './multimarket.mjs';
export async function diagnosticPreflight({root,study,dataset,schedule,now=new Date()}){
  const clock=new Date(now).getTime();await requireRegisteredCode(root,study);validateSchedule(schedule,now);validateAnalysisSchedule(schedule,now);
  const current=validateCurrentDataset(dataset,now),first=Math.min(...schedule.events.map(e=>Date.parse(e.kickoffUtc)));
  if(!Number.isFinite(clock)||clock<Date.parse(DIAGNOSTIC_POLICY.registeredAtUtc)||Date.parse(study.generatedAtUtc)>clock)throw new Error('DIAGNOSTIC_CLOCK_OR_STUDY_UNAVAILABLE');
  const opens=first-PROGRESSIVE_POLICY.openBeforeMinutes*60000,closes=first-PROGRESSIVE_POLICY.analysisLeadMinutes*60000;
  return {schema:'lamultipla-multimarket-preflight-v1',checkedAtUtc:new Date(clock).toISOString(),studySha256:digest(study),datasetSha256:current.sha256,scheduleSha256:digest(schedule),
    season:schedule.season,matchday:schedule.matchday,fixtures:schedule.events.length,opensAtUtc:new Date(opens).toISOString(),closesAtUtc:new Date(closes).toISOString(),
    state:clock<opens?'WAITING_FIRST_ORIGINAL_WINDOW':clock>=closes?'ORIGINAL_DIAGNOSTIC_WINDOW_MISSED':'FIRST_ORIGINAL_WINDOW_OPEN',
    officialConfirmationFresh:clock-Date.parse(schedule.source.confirmedAtUtc)<=86400000,providerObservationFresh:clock-Date.parse(schedule.source.providerObservedAtUtc)<3600000,
    datasetObservationFresh:clock-Date.parse(current.dataset.acquiredAtUtc)<=72*3600000,
    validatedMarkets:study.validatedMarkets,modelParameters:study.selected,forecastProduced:false,providerRequests:0,actualStakeEUR:0};
}
export async function freezeIndependentDiagnostic({root,study,dataset,schedule,calendar,clock=()=>new Date(),freeze=freezeEngine}){
  const before=await diagnosticPreflight({root,study,dataset,schedule,now:clock()});
  if(before.state!=='FIRST_ORIGINAL_WINDOW_OPEN')throw new Error('DIAGNOSTIC_NOT_IN_FIRST_ORIGINAL_WINDOW');
  if(!before.datasetObservationFresh)throw new Error('DIAGNOSTIC_DATASET_OBSERVATION_STALE');
  if(!calendar)throw new Error('DIAGNOSTIC_RECONFIRMED_CALENDAR_REQUIRED');
  const reconciled=reconcileCalendar(schedule,calendar,clock());
  if(reconciled.schedule.events.some(e=>e.status!=='scheduled'))throw new Error('DIAGNOSTIC_CALENDAR_DISCREPANCY');
  const boundedClock=()=>{const now=new Date(clock());if(now.getTime()>=Date.parse(before.closesAtUtc)||now.getTime()<Date.parse(before.checkedAtUtc))throw new Error('DIAGNOSTIC_FREEZE_DEADLINE_OR_CLOCK_INVALID');return now;};
  const result=await freeze({root,study,dataset,schedule,clock:boundedClock});
  if(result.journal.generatedAtUtc<DIAGNOSTIC_POLICY.registeredAtUtc||Date.parse(result.journal.generatedAtUtc)>=Date.parse(before.closesAtUtc)
    ||result.journal.datasetSha256!==digest(dataset))throw new Error('DIAGNOSTIC_EXISTING_JOURNAL_CONFLICT');
  return result;
}
