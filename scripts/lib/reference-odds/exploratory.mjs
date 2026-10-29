// Pure international-reference diagnostics. Not a selector or a decision writer.
import {hashValue,uniqueSorted,timestamp} from '../mm-simulator-v1/contracts.mjs';
import {projectFrozenFamily} from '../mm-simulator-v1/probabilities.mjs';
import {validateSchedule} from '../engine/forecast.mjs';
import {verifyScientificDistributions} from '../mm-simulator-v1/prospective-archive.mjs';
import {frechet} from '../shadow/combinations.mjs';
import {REFERENCE_BOARD_SCHEMA} from './moviodds-offline.mjs';
import {timing} from '../orchestration/progressive-policy.mjs';
import {validatePublicCalendar} from '../orchestration/calendar-discovery.mjs';
import {canonicalTeam} from '../goals/data.mjs';

export const EXPLORATION_SCHEMA='lamultipla-international-exploration-v1';
export const REFERENCE_LIMITS=Object.freeze({forecastHours:24,quoteMinutes:30,leadMinutes:150,
 minLegs:2,maxLegs:4,maxCombinations:20000,maxNodes:100000,ordering:'STABLE_IDENTIFIERS_NOT_EV_RANKING'});
const fail=c=>{throw Error(c);},same=(a,b)=>hashValue(a)===hashValue(b);
const safety=()=>({operationallyApproved:false,scientificallyValidated:false,authenticDecisionAllowed:false,
 eligibleForOriginalSelector:false,appDeliveryAllowed:false,actualStakeEUR:0});
export function validateReferenceCalendar(manifest,source,now){
 const result=validatePublicCalendar(source,{now}),rows=result.rows.filter(r=>r.matchday===manifest.matchday);
 if(result.season!==manifest.season||rows.length!==10)fail('REFERENCE_CC0_ROUND_INCOMPLETE');
 const wall=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(const e of manifest.events){const r=rows.find(r=>r.home===canonicalTeam(e.home)&&r.away===canonicalTeam(e.away)),
  p=Object.fromEntries(wall.formatToParts(new Date(e.kickoffUtc)).map(p=>[p.type,p.value]));
  if(!r||r.scored||r.date!==`${p.year}-${p.month}-${p.day}`||r.time!==`${p.hour}:${p.minute}`)fail('REFERENCE_CC0_CALENDAR_DISCORDANCE');
 }
 return {expectedFixtures:10,matchedFixtures:10,sourceCommit:source.commit,bodySha256:source.bodySha256,comparisonTimeZone:'Europe/Rome'};
}
export function validateReferenceBindings(manifest,bindings){
 if(bindings?.schema!=='lamultipla-movi-round-bindings-v1'||bindings.provider!=='MoviOdds'
  ||bindings.scope?.season!==manifest?.season||bindings.scope?.round!==manifest?.matchday
  ||bindings.manifestSha256!==hashValue(manifest)||bindings.events?.length!==10
  ||new Set(bindings.events.map(e=>e.sourceFixtureId)).size!==10
  ||new Set(bindings.events.map(e=>e.fixtureId)).size!==10)fail('REFERENCE_BINDING_UNIVERSE_INVALID');
 for(const e of manifest.events){const b=bindings.events.find(x=>x.fixtureId===e.fixtureId);
  if(!b||!same([b.home,b.away,b.kickoffUtc],[e.home,e.away,e.kickoffUtc])
   ||![b.sourceFixtureId,b.sourceHome,b.sourceAway].every(v=>typeof v==='string'&&v.trim()===v&&v.length>0)
   ||b.sourceHome===b.sourceAway)fail('REFERENCE_BINDING_IDENTITY_INVALID');
 }
 return bindings;
}

// Caller supplies a verified frozen archive. This pure layer cannot confer
// authenticity; the CLI obtains its archive from the official round verifier.
export function exploreInternational({manifest,bindings,journal,study,freezeCompletedAtUtc,boards,slot,evaluatedAtUtc,sourceKind,calendar}){
 if(!timestamp(evaluatedAtUtc)||!timestamp(freezeCompletedAtUtc))fail('REFERENCE_CLOCK_INVALID');
 const now=Date.parse(evaluatedAtUtc),generated=Date.parse(journal?.generatedAtUtc),freeze=Date.parse(freezeCompletedAtUtc);
 if(!Number.isFinite(generated)||generated>freeze||freeze>now)fail('REFERENCE_FORECAST_TIMELINE_INVALID');
 validateSchedule(manifest,new Date(generated-1));validateReferenceBindings(manifest,bindings);
 verifyScientificDistributions(journal,study);
 if(!same(journal.manifest.events,manifest.events)||journal.manifest.season!==manifest.season||journal.manifest.matchday!==manifest.matchday)
  fail('REFERENCE_FORECAST_UNIVERSE_MISMATCH');
 if(!['SYNTHETIC_TEST_ONLY','VERIFIED_LOCAL_FREEZE_ARCHIVE'].includes(sourceKind)
  ||(journal.sourceData==='synthetic_test')!==(sourceKind==='SYNTHETIC_TEST_ONLY'))fail('REFERENCE_SOURCE_KIND_MISMATCH');
 const {canonicalSha256,...boardContent}=boards??{};
 if(boards?.schema!==REFERENCE_BOARD_SCHEMA||!same(canonicalSha256,hashValue(boardContent))||boards.evaluatedAtUtc!==evaluatedAtUtc
  ||boards.source?.provider!=='MoviOdds'||boards.source.bookmaker!=='bet365'
  ||boards.source.jurisdiction!=='INTERNATIONAL_UNSPECIFIED_NOT_ITALIAN_ATTESTATION')fail('REFERENCE_BOARD_CONTRACT_INVALID');
 if(!slot||typeof slot.id!=='string'||!Array.isArray(slot.fixtureIds)||!slot.fixtureIds.length
  ||new Set(slot.fixtureIds).size!==slot.fixtureIds.length||slot.fixtureIds.some(id=>!manifest.events.some(e=>e.fixtureId===id)))fail('REFERENCE_EXPLICIT_SLOT_REQUIRED');
 const slotSet=new Set(slot.fixtureIds),expected=new Set(bindings.events.map(b=>b.sourceFixtureId)),missing=[],mismatched=[],duplicates=[];
 const progressive=timing(manifest,evaluatedAtUtc);
 const calendarErrors=[];
 for(const [field,maxAge]of [['officialObservedAtUtc',24*3600000],['cc0ObservedAtUtc',24*3600000],['providerIdentitiesObservedAtUtc',60*60000]]){
  if(!timestamp(calendar?.[field])||Date.parse(calendar[field])>now||now-Date.parse(calendar[field])>maxAge)calendarErrors.push('CALENDAR_EVIDENCE_MISSING_OR_EXPIRED:'+field);
 }
 if(calendar?.providerIdentitiesObservedAtUtc!==boards.source.observedAtUtc)calendarErrors.push('CALENDAR_PROVIDER_OBSERVATION_NOT_CURRENT_QUOTE_CAPTURE');
 for(const b of bindings.events){const found=boards.fixtures.filter(f=>f.sourceFixtureId===b.sourceFixtureId);
  if(!found.length)missing.push(b.fixtureId);
  else if(found.length!==1)duplicates.push(b.fixtureId);
  else if(!same([found[0].home,found[0].away,found[0].kickoffUtc],[b.sourceHome,b.sourceAway,b.kickoffUtc]))mismatched.push(b.fixtureId);
 }
 const universe={expectedFixtures:10,presentExpectedFixtures:10-missing.length,missingFixtureIds:missing.sort(),
  duplicateFixtureIds:duplicates.sort(),incoherentFixtureIds:mismatched.sort(),
  outsideUniverseSourceFixtureIds:boards.fixtures.filter(f=>!expected.has(f.sourceFixtureId)).map(f=>f.sourceFixtureId).sort(),
  complete:!missing.length&&!duplicates.length&&!mismatched.length};
 const errors=uniqueSorted([...(now-generated>REFERENCE_LIMITS.forecastHours*3600000?['FORECAST_EXPIRED']:[]),
  ...calendarErrors,
  ...(!progressive.active?['NO_REGISTERED_ANALYSIS_WINDOW_OPEN']:[]),
  ...(Date.parse(boards.source.observedAtUtc)<freeze?['QUOTE_BEFORE_COMPLETED_FREEZE']:[]),
  ...(now-Date.parse(boards.source.observedAtUtc)>REFERENCE_LIMITS.quoteMinutes*60000?['QUOTE_OBSERVATION_EXPIRED']:[]),
  ...(duplicates.length||mismatched.length||missing.some(id=>slotSet.has(id))?['SLOT_UNIVERSE_INCOMPLETE_OR_INCOHERENT']:[])]);
 if(!Number.isFinite(Date.parse(boards.source.observedAtUtc))||Date.parse(boards.source.observedAtUtc)>now)fail('REFERENCE_QUOTE_TIMELINE_INVALID');
 const records=[],boardStates=[],eligible=[],expectedBoards=slot.fixtureIds.length*2;
 for(const e of manifest.events){const binding=bindings.events.find(b=>b.fixtureId===e.fixtureId),entry=journal.entries.find(j=>j.fixtureId===e.fixtureId);
  const withinSlot=slotSet.has(e.fixtureId),timely=now<Date.parse(e.kickoffUtc)-REFERENCE_LIMITS.leadMinutes*60000;
  for(const family of ['BTTS','TOTAL_GOALS']){
   const found=boards.boards.filter(b=>b.sourceFixtureId===binding.sourceFixtureId&&b.family===family),multiple=found.length>1;
   // Parallel native groups are not silently fused or selected by their prices.
   const b=found.length===1?found[0]:null,reasons=[...errors];
   if(!withinSlot)reasons.push('OUTSIDE_EXPLICIT_SLOT');if(!timely)reasons.push('ANALYSIS_LEAD_WINDOW_CLOSED');
   if(!b)reasons.push(multiple?'MULTIPLE_NATIVE_BOARDS_REQUIRE_EXPLICIT_MAPPING':'BOARD_NOT_OBSERVED');
   else{
    reasons.push(...b.availability.reasons,...b.normalization.reasons);
    if(b.completeness.state!=='COMPLETE')reasons.push('BOARD_STRUCTURALLY_INCOMPLETE');
    if(!b.referenceEligible)reasons.push('BOARD_NOT_AVAILABLE_REFERENCE');
    if(b.period!=='REGULATION_FULL_TIME'||b.line!==(family==='BTTS'?null:2.5)
     ||!same([b.home,b.away,b.kickoffUtc],[binding.sourceHome,binding.sourceAway,binding.kickoffUtc]))reasons.push('BOARD_IDENTITY_OR_PERIOD_INVALID');
   }
   if(entry.status!=='prospective')reasons.push('FORECAST_ENTRY_EXCLUDED');
   const projections=Object.fromEntries(['dc','bivariate'].map(kind=>[kind,projectFrozenFamily(entry.forecasts[kind],family)]));
   const state={fixtureId:e.fixtureId,family,boardId:b?.id??null,withinSlot,timely,
    structuralCompleteness:b?.completeness.state??'NOT_OBSERVED',availability:b?.availability.state??'NOT_OBSERVED',
    reasons:uniqueSorted(reasons),comparator:{state:projections.bivariate.reasons.length?'INVALID':'AVAILABLE',reasons:projections.bivariate.reasons}};
   boardStates.push(state);
   for(const q of b?.outcomes??[]){const issue=[...reasons,...q.reasons],models={};
    for(const kind of ['dc','bivariate']){const p=projections[kind],o=p.outcomes[q.outcome];
     models[kind]={probability:o?.probability??null,interval95:o?.interval95??null,
      model:{id:kind==='dc'?'dc-v2':'bivariate-v2',version:journal.modelVersion,codeSha256:study.modelCodeSha256,
       protocolSha256:study.protocolSha256,parametersSha256:hashValue(journal.models[kind]),
       config:structuredClone(study.selected[kind].config),temperature:study.selected[kind].temperature},
      marginalEV:o?.probability!=null&&q.price!=null?q.price*o.probability-1:null,
      marginalEVInterval:o?.interval95&&q.price!=null?o.interval95.map(v=>q.price*v-1):null,
      uncertainty:p.uncertainty,gridSha256:p.gridSha256,bootstrapGridsSha256:p.bootstrapGridsSha256,reasons:p.reasons,warnings:p.warnings};
    }
    const dc=models.dc;
    if(dc.reasons.length||!dc.interval95||dc.probability<dc.interval95[0]||dc.probability>dc.interval95[1])issue.push('PRIMARY_UNCERTAINTY_INSUFFICIENT_OR_CENTRAL_OUTSIDE_INTERVAL');
    const record={id:hashValue([e.fixtureId,b.id,q.sourceSelectionId]),fixture:structuredClone(e),family,period:b.period,line:b.line,outcome:q.outcome,
     internationalReferencePrice:q.price,priceEvidenceLevel:b.priceEvidenceLevel,observedAtUtc:b.observedAtUtc,lastChangedAtUtc:q.lastChangedAtUtc,
     sourceGroupId:b.sourceGroupId,sourceMarketId:b.sourceMarketId,sourceSelectionId:q.sourceSelectionId,
     suspension:structuredClone(q.suspension),nativeGroupStatus:structuredClone(b.availability),
     contextEvidence:'NOT_ASSESSED_NOT_AN_ADMISSION_GATE_FOR_THIS_DIAGNOSTIC',
     settlementEvidence:'NATIVE_FULLTIME_MAPPING_ONLY_NO_ITALIAN_TICKET_ATTESTATION',
     models,exclusions:uniqueSorted(issue),quoteProvenance:structuredClone(q.provenance),entrySha256:entry.entrySha256,
     forecastSha256:hashValue(journal),referenceComputable:issue.length===0,...safety()};
    records.push(record);if(record.referenceComputable)eligible.push(record);
   }
  }
 }
 records.sort((a,b)=>a.id.localeCompare(b.id));eligible.sort((a,b)=>a.id.localeCompare(b.id));
 const combinations=[];let nodes=0,attempted=0,truncated=false;
 function visit(start,chosen,teams,fixtures){
  if(nodes>=REFERENCE_LIMITS.maxNodes){truncated=true;return;}nodes++;
  if(chosen.length>=2){if(attempted>=REFERENCE_LIMITS.maxCombinations){truncated=true;return;}attempted++;
   const bounds=frechet(chosen.map(r=>r.models.dc.probability));
   const low=frechet(chosen.map(r=>r.models.dc.interval95[0]))[0],high=frechet(chosen.map(r=>r.models.dc.interval95[1]))[1];
   combinations.push({id:hashValue(chosen.map(r=>r.id)),selectionIds:chosen.map(r=>r.id),fixtureIds:chosen.map(r=>r.fixture.fixtureId),
    primaryModel:'DC_V2',jointProbability:null,frechetBounds:bounds,marginalIntervalSensitivityBounds:[low,high],
    comparatorFrechetBounds:chosen.every(r=>r.models.bivariate.probability!==null)?frechet(chosen.map(r=>r.models.bivariate.probability)):null,
    simultaneousInterval:false,theoreticalSinglesProduct:chosen.reduce((p,r)=>p*r.internationalReferencePrice,1),
    productLabel:'THEORETICAL_PRODUCT_NOT_AN_OFFERED_TICKET_PRICE',combinedPriceState:'NOT_VERIFIED',actualCombinedPrice:null,
    verifiedCombinedEV:null,admissible:false,limitations:['NO_VALIDATED_JOINT_DISTRIBUTION','ITALIAN_TICKET_NOT_VERIFIED','AUTHENTIC_POLICY_NOT_ACTIVE'],...safety()});
  }
  if(chosen.length===4||truncated)return;
  for(let i=start;i<eligible.length&&!truncated;i++){const r=eligible[i],e=r.fixture;
   if(fixtures.has(e.fixtureId)||teams.has(e.home)||teams.has(e.away))continue;
   visit(i+1,[...chosen,r],new Set([...teams,e.home,e.away]),new Set([...fixtures,e.fixtureId]));
  }
 }
 visit(0,[],new Set(),new Set());
 const slotBoards=boardStates.filter(b=>b.withinSlot),missingEvidence=slotBoards.some(b=>b.reasons.length||b.comparator.state!=='AVAILABLE');
 const content={schema:EXPLORATION_SCHEMA,sourceKind,evaluatedAtUtc,scope:structuredClone(bindings.scope),
  slot:structuredClone(slot),registeredTiming:progressive,universe,unassessedFixtureIds:manifest.events.filter(e=>!slotSet.has(e.fixtureId)).map(e=>e.fixtureId),
  state:errors.length||missingEvidence||truncated?'ANALYSIS_INCOMPLETE':combinations.length?'INTERNATIONAL_EXPLORATORY_SHORTLIST':'COMPLETE_SLOT_NO_COMBINATIONS',
  roundAnalysisState:!universe.complete||slotSet.size!==10?'ROUND_NOT_FULLY_EVALUATED':'ROUND_SCOPE_PRESENT',
  wholeRoundEvaluated:universe.complete&&slotSet.size===10&&!errors.length&&!missingEvidence&&!truncated,
  counts:{expectedSlotBoards:expectedBoards,observedSlotBoards:slotBoards.filter(b=>b.boardId).length,
   completeSlotBoards:slotBoards.filter(b=>b.structuralCompleteness==='COMPLETE').length,referenceSelections:eligible.length,
   combinations:combinations.length,nodes,attempted,truncated},limits:structuredClone(REFERENCE_LIMITS),
  provenance:{manifestSha256:hashValue(manifest),bindingsSha256:hashValue(bindings),journalSha256:hashValue(journal),studySha256:hashValue(study),
   modelCodeSha256:study.modelCodeSha256,protocolSha256:study.protocolSha256,forecastGeneratedAtUtc:journal.generatedAtUtc,
   modelVersion:journal.modelVersion,
   cutoffUtc:journal.trainingCutoffUtc,freezeCompletedAtUtc,boardsSha256:boards.canonicalSha256,source:structuredClone(boards.source)},
  calendarEvidence:structuredClone(calendar??null),
  boardStates,records,combinations,exclusions:errors,italianTicket:{state:'NOT_PROVIDED',blocksReferenceDiagnostics:false,blocksAuthenticAdmission:true},
  originalPolicyChanged:false,prospectivePolicyActivated:false,providerRequests:0,...safety()};
 return {...content,canonicalSha256:hashValue(content)};
}
