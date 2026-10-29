import {timestamp} from './contracts.mjs';
import {PROTOTYPE_POLICY} from './prototype-policy.mjs';
import {timing} from '../orchestration/progressive-policy.mjs';

// Observation/review instants only: future kickoffs and calendar review windows
// are intentional and MUST NOT be treated as observations from the future.
export function temporalPreflight(input,atUtc,notBefore){
 if(!timestamp(atUtc)||Date.parse(atUtc)<notBefore)throw Error('MM3B_SIMULATION_CLOCK_ROLLBACK');
 const d=input.data,clock=Date.parse(atUtc),context=d.context;
 const observed=[d.atUtc,d.boards.source.observedAtUtc,d.journal.generatedAtUtc,d.journal.datasetAcquiredAtUtc,
  d.diagnostic.provenance.freezeCompletedAtUtc,context?.generatedAtUtc,context?.datasetAcquiredAtUtc,
  d.calendar?.officialObservedAtUtc,d.calendar?.providerObservedAtUtc,
  ...(d.selectionReviews??[]).flatMap(r=>[r.reviewedAtUtc,r.rules?.reviewedAtUtc]),...(d.ticketReviews??[]).map(r=>r.reviewedAtUtc),
  ...(context?.evidence?.sources??[]).map(r=>r.reviewedAtUtc),...(context?.evidence?.facts??[]).flatMap(r=>[r.capturedAtUtc,r.statusAsOfUtc,r.publishedAtUtc]),
  ...(context?.evidence?.reviews??[]).map(r=>r.reviewedAtUtc),...(context?.evidence?.calendar??[]).map(r=>r.capturedAtUtc)];
 if(observed.some(v=>timestamp(v)&&Date.parse(v)>clock))throw Error('MM3C_EVIDENCE_AFTER_CLOCK');
 if(!timing({...d.journal.manifest,schema:'lamultipla-prospective-schedule-v1'},atUtc).active)throw Error('MM3B_SIMULATION_WINDOW_CLOSED');
 if(clock-Date.parse(d.journal.generatedAtUtc)>PROTOTYPE_POLICY.maxForecastAgeHours*3600000)throw Error('MM3C_FORECAST_EXPIRED');
 if(clock-Date.parse(d.boards.source.observedAtUtc)>PROTOTYPE_POLICY.maxQuoteAgeMinutes*60000)throw Error('MM3C_QUOTES_EXPIRED');
 if([d.calendar?.officialObservedAtUtc,d.calendar?.providerObservedAtUtc].some(v=>timestamp(v)&&clock-Date.parse(v)>PROTOTYPE_POLICY.maxCalendarAgeMinutes*60000))throw Error('MM3C_CALENDAR_EXPIRED');
 if([...(d.selectionReviews??[]),...(d.ticketReviews??[])].some(r=>timestamp(r.reviewedAtUtc)&&clock-Date.parse(r.reviewedAtUtc)>PROTOTYPE_POLICY.maxQuoteAgeMinutes*60000))throw Error('MM3C_REVIEW_EXPIRED');
 return atUtc;
}
