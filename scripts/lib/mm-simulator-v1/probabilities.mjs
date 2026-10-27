import {canonicalTeam} from '../goals/data.mjs';
import {quantile} from '../goals/metrics.mjs';
import {validateJournal} from '../engine/forecast.mjs';
import {settlementProbabilities} from '../engine/markets.mjs';
import {validateBoardSnapshot,FAMILIES,hashValue,timestamp,isObject,uniqueSorted} from './contracts.mjs';

export const PROBABILITY_SCHEMA='lamultipla-mm-probability-diagnostic-v1';
export const PROJECTION_POLICY=Object.freeze({version:'mm-probability-projection-v1',families:Object.freeze(['BTTS','TOTAL_GOALS']),
 models:Object.freeze(['dc','bivariate']),numericalTolerance:1e-8,minBootstrapReplicates:40,maxBootstrapFailureRate:.1,
 quantiles:Object.freeze([.025,.975]),priceTreatment:'HISTORICAL_NOT_CURRENT',rankingsAllowed:false});
const specs={BTTS:{YES:{family:'btts',outcome:'Yes'},NO:{family:'btts',outcome:'No'}},
 TOTAL_GOALS:{OVER:{family:'totals',line:2.5,outcome:'Over'},UNDER:{family:'totals',line:2.5,outcome:'Under'}}};
const fail=c=>{throw Error(c);};
const hash=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);

function familyProbabilities(grid,family){
 if(!Array.isArray(grid)||!grid.length)return null;
 const result={};
 for(const [outcome,spec]of Object.entries(specs[family])){
  const p=settlementProbabilities(grid,spec);
  if(!p||!Number.isFinite(p.win)||p.win<0||p.win>1||p.push!==0||p.halfWin!==0||p.halfLoss!==0)return null;
  result[outcome]=p.win;
 }
 const complementSum=Object.values(result).reduce((s,p)=>s+p,0);
 return Math.abs(complementSum-1)<=PROJECTION_POLICY.numericalTolerance?{values:result,complementSum}:null;
}

// Projects frozen grids only. This function never fits, calibrates or reads prices.
export function projectFrozenFamily(forecast,family){
 if(!Object.hasOwn(specs,family))fail('MM2_FAMILY_OUTSIDE_SCOPE');
 const central=familyProbabilities(forecast?.grid,family),bootstrap=forecast?.bootstrapGrids,u=forecast?.uncertainty;
 const stored=Array.isArray(bootstrap)?bootstrap:null,valid=stored?.map(g=>Array.isArray(forecast?.grid)&&g?.length===forecast.grid.length?familyProbabilities(g,family):null);
 const samples=valid?.filter(Boolean)??[],reasons=[],warnings=[];
 if(!central)reasons.push(forecast?.grid==null?'CENTRAL_GRID_MISSING':'CENTRAL_GRID_INVALID_OR_COMPLEMENTS_INCOHERENT');
 if(!stored)reasons.push('BOOTSTRAP_GRIDS_MISSING');
 if(!isObject(u)||!Number.isInteger(u.replicates)||u.replicates<PROJECTION_POLICY.minBootstrapReplicates||!Number.isInteger(u.failures)||u.failures<0||u.failures>u.replicates)
  reasons.push('BOOTSTRAP_METADATA_MISSING_OR_INVALID');
 else{
  if(stored&&stored.length!==u.replicates-u.failures)reasons.push('BOOTSTRAP_METADATA_COUNT_MISMATCH');
  if(u.sufficient!==true||u.failures/u.replicates>PROJECTION_POLICY.maxBootstrapFailureRate||samples.length<Math.ceil((1-PROJECTION_POLICY.maxBootstrapFailureRate)*u.replicates))reasons.push('BOOTSTRAP_INSUFFICIENT');
 }
 if(stored&&samples.length!==stored.length)reasons.push('STORED_BOOTSTRAP_GRID_INVALID');
 const sufficient=central&&reasons.length===0;
 const outcomes=Object.fromEntries(FAMILIES[family].outcomes.map(outcome=>{
  const interval95=sufficient?PROJECTION_POLICY.quantiles.map(q=>quantile(samples.map(p=>p.values[outcome]),q)):null;
  if(interval95&&(central.values[outcome]<interval95[0]||central.values[outcome]>interval95[1]))warnings.push('CENTRAL_ESTIMATE_OUTSIDE_BOOTSTRAP_INTERVAL:'+outcome);
  return [outcome,{probability:central?.values[outcome]??null,interval95}];
 }));
 return {state:central?'PROBABILITY_CALCULABLE':'PROBABILITY_UNAVAILABLE',outcomes,complementSum:central?.complementSum??null,
  complementTolerance:PROJECTION_POLICY.numericalTolerance,gridSha256:forecast?.grid==null?null:hashValue(forecast.grid),
  bootstrapGridsSha256:stored?hashValue(stored):null,
  uncertainty:{state:sufficient?'MARGINAL_BOOTSTRAP_DESCRIPTIVE':'INTERVAL_UNAVAILABLE',declaredReplicates:u?.replicates??null,
   declaredFailures:u?.failures??null,storedSamples:stored?.length??null,validSamples:stored?samples.length:null,seed:u?.seed??null,
   maxValidBootstrapComplementError:samples.length?Math.max(...samples.map(p=>Math.abs(p.complementSum-1))):null,
   intervalMethod:'FROZEN_BOOTSTRAP_EMPIRICAL_QUANTILES_FLOOR',quantiles:[.025,.975],simultaneous:false},
  reasons:uniqueSorted(reasons),warnings:uniqueSorted(warnings)};
}

function verifyJournalStructure(journal,study){
 validateJournal(journal,study);
 if(![journal.generatedAtUtc,journal.datasetAcquiredAtUtc,journal.trainingCutoffUtc,study.generatedAtUtc].every(timestamp)
  ||!hash(journal.datasetSha256)||!hash(study.modelCodeSha256)||!hash(study.protocolSha256))fail('MM2_JOURNAL_PROVENANCE_INVALID');
 const events=new Map(journal.manifest.events.map(e=>[e.fixtureId,e]));
 for(const e of journal.entries){const expected=events.get(e.fixtureId);
  if(!expected||e.home!==expected.home||e.away!==expected.away||e.kickoffUtc!==expected.kickoffUtc||!timestamp(e.kickoffUtc))fail('MM2_JOURNAL_MANIFEST_ENTRY_MISMATCH');
 }
}

// Structural verification for pure/synthetic use is not proof of an authentic freeze.
// The separate read-only loader adds evidence from loadFrozenReference, never a fit.
export function diagnoseProbabilityBoards({boards,journal,study,freezeCompletedAtUtc=null}){
 validateBoardSnapshot(boards);
 if(!hash(boards.canonicalSha256))fail('MM2_BOARD_HASH_REQUIRED');
 verifyJournalStructure(journal,study);
 if(freezeCompletedAtUtc!==null&&(!timestamp(freezeCompletedAtUtc)||Date.parse(freezeCompletedAtUtc)<Date.parse(journal.generatedAtUtc)))fail('MM2_FREEZE_TIMESTAMP_INVALID');
 const journalSha256=hashValue(journal),studySha256=hashValue(study),entries=new Map(journal.entries.map(e=>[e.fixtureId,e]));
 const metadata=Object.fromEntries(PROJECTION_POLICY.models.map(kind=>[kind,{id:kind==='dc'?'dc-v2':'bivariate-v2',version:journal.modelVersion,
  config:structuredClone(study.selected[kind].config),temperature:study.selected[kind].temperature,
  parametersSha256:journal.models?.[kind]?hashValue(journal.models[kind]):null,codeSha256:study.modelCodeSha256,protocolSha256:study.protocolSha256}]));
 const cache=new Map(),records=[],boardStates=[];
 const quoteCounts=new Map();for(const b of boards.boards)for(const q of b.outcomes)quoteCounts.set(q.id,(quoteCounts.get(q.id)??0)+1);
 const roundMatches=boards.scope.season===journal.manifest.season&&boards.scope.round===journal.manifest.matchday;
 for(const b of boards.boards){const e=entries.get(String(b.event.sourceEventId)),reasons=[];
  if((journal.sourceData==='synthetic_test')!==(boards.source.observationKind==='SYNTHETIC'))reasons.push('QUOTE_FORECAST_SOURCE_MODE_MISMATCH');
  if(!roundMatches)reasons.push('FORECAST_SEASON_OR_ROUND_MISMATCH');
  if(!e)reasons.push('NO_COMPATIBLE_FORECAST');
  else if(b.provenance.sourceEventId!==String(b.event.sourceEventId)||canonicalTeam(b.event.home.name)!==e.home
   ||canonicalTeam(b.event.away.name)!==e.away||b.event.kickoffUtc!==e.kickoffUtc)reasons.push('EXACT_FIXTURE_HOME_AWAY_OR_KICKOFF_MISMATCH');
  if(e&&!['prospective','excluded'].includes(e.status))reasons.push('FROZEN_ENTRY_STATUS_INVALID');
  const nonCoverage=b.normalization.reasons.filter(r=>!['EXPECTED_OUTCOMES_MISSING','OUTCOME_QUOTE_MISSING'].includes(r));
  if(nonCoverage.length||b.completeness.state==='CONFLICT'||!b.observed)reasons.push('BOARD_IDENTITY_PRICE_OR_TIMESTAMP_INVALID');
  if(b.outcomes.some(q=>!hash(q.id)))reasons.push('QUOTE_REFERENCE_INVALID');
  if(b.outcomes.some(q=>quoteCounts.get(q.id)!==1))reasons.push('DUPLICATE_QUOTE_REFERENCE');
  if(Date.parse(boards.source.observedAtUtc)<Date.parse(journal.generatedAtUtc))reasons.push('QUOTE_OBSERVED_BEFORE_FORECAST');
  if(freezeCompletedAtUtc&&Date.parse(boards.source.observedAtUtc)<Date.parse(freezeCompletedAtUtc))reasons.push('QUOTE_OBSERVED_BEFORE_COMPLETED_FREEZE');
  const matched=reasons.length===0;
  const projected={};
  for(const kind of PROJECTION_POLICY.models){
   let projection=null,modelReasons=[];
   if(matched){const key=JSON.stringify([e.fixtureId,kind,b.family]);
    if(!cache.has(key)){const f=e.forecasts?.[kind],parameters=journal.models?.[kind];
     const validParameters=parameters?.converged===true&&isObject(parameters.config)&&hashValue(parameters.config)===hashValue(study.selected[kind].config)
      &&f?.temperature===study.selected[kind].temperature;
     cache.set(key,validParameters?{projection:projectFrozenFamily(f,b.family),reasons:[]}:{projection:null,reasons:['MODEL_PARAMETERS_OR_TEMPERATURE_UNVERIFIABLE']});
    }
    const value=cache.get(key);projection=value.projection;modelReasons=value.reasons;
   }
   projected[kind]={model:metadata[kind],projection,reasons:uniqueSorted([...reasons,...modelReasons,...(projection?.reasons??[])])};
  }
  const boardState={boardId:b.id,event:structuredClone(b.event),family:b.family,period:b.period,line:b.line,boardAvailability:b.availability.state,
   completeness:structuredClone(b.completeness),normalization:structuredClone(b.normalization),diagnosticInputReadyM1:b.diagnosticInputReady,
   forecastLinkState:matched?'EXACT_MATCH':'EXCLUDED',entrySha256:matched?e.entrySha256:null,
   frozenEntryStatus:matched?e.status:null,frozenEntryExclusions:matched&&Array.isArray(e.exclusions)?[...e.exclusions]:null,
   sourceMapping:matched?{method:'REGISTERED_EXACT_TEAM_ALIAS_TABLE',sourceNames:[b.event.home.name,b.event.away.name],journalNames:[e.home,e.away]}:null,
   reasons:uniqueSorted(reasons),m1ExclusionReasons:[...b.exclusionReasons],models:projected};
  boardStates.push(boardState);
  for(const q of b.outcomes){records.push({boardId:b.id,quoteId:q.id,event:structuredClone(b.event),family:b.family,period:b.period,line:b.line,outcome:q.outcome,
   historicalPrice:q.price,priceLabel:'STORICO — NON OFFERTA ATTUALE',currentPrice:null,observedAtUtc:q.observedAtUtc,lastChangedAtUtc:q.lastChangedAtUtc,
   operatorChangedAtUtc:q.operatorChangedAtUtc,boardAvailability:b.availability.state,selectionAvailability:q.availability,boardCompleteness:b.completeness.state,
   diagnosticInputReadyM1:b.diagnosticInputReady,forecastLinkState:boardState.forecastLinkState,
   frozenEntryStatus:boardState.frozenEntryStatus,frozenEntryExclusions:boardState.frozenEntryExclusions,
   models:Object.fromEntries(PROJECTION_POLICY.models.map(kind=>{const p=projected[kind],value=p.projection?.outcomes[q.outcome];return [kind,{
    model:metadata[kind],probability:value?.probability??null,interval95:value?.interval95??null,uncertainty:p.projection?.uncertainty??null,
    gridSha256:p.projection?.gridSha256??null,bootstrapGridsSha256:p.projection?.bootstrapGridsSha256??null,
    reasons:[...p.reasons],warnings:[...(p.projection?.warnings??[])]}];})),
   entrySha256:boardState.entrySha256,quoteProvenance:structuredClone(q.provenance),boardProvenance:structuredClone(b.provenance),
   exclusions:uniqueSorted([...b.exclusionReasons,...q.reasons,...reasons]),validationState:'PROSPECTIVE_VALIDATION_PENDING',
   eligibleForSelector:false,operationallyApproved:false});}
 }
 const matched=boardStates.filter(b=>b.forecastLinkState==='EXACT_MATCH').length;
 const state=!matched?'NO_COMPATIBLE_DIAGNOSTIC_INPUT':boardStates.some(b=>b.forecastLinkState!=='EXACT_MATCH'||b.completeness.state!=='COMPLETE'||b.normalization.state!=='VALID'||b.frozenEntryStatus!=='prospective'
  ||Object.values(b.models).some(m=>!m.projection||m.projection.uncertainty.state!=='MARGINAL_BOOTSTRAP_DESCRIPTIVE'))?'PARTIAL_DIAGNOSTIC':'COMPLETE_OFFLINE_DIAGNOSTIC';
 const result={schema:PROBABILITY_SCHEMA,policy:structuredClone(PROJECTION_POLICY),policySha256:hashValue(PROJECTION_POLICY),state,
  provenance:{verification:'STRUCTURAL_ONLY_NOT_A_FREEZE_ATTESTATION',journalId:journal.id,journalSha256,studySha256,datasetSha256:journal.datasetSha256,
   sourceCommit:journal.sourceCommit??null,
   modelVersion:journal.modelVersion,modelCodeSha256:study.modelCodeSha256,protocolSha256:study.protocolSha256,
   forecastGeneratedAtUtc:journal.generatedAtUtc,freezeCompletedAtUtc,trainingCutoffUtc:journal.trainingCutoffUtc,
   boardSnapshotSha256:boards.canonicalSha256,boardSource:structuredClone(boards.source),
   sourceData:journal.sourceData==='synthetic_test'||boards.source.observationKind==='SYNTHETIC'?'SYNTHETIC':'ARCHIVED_ORIGINAL_ARTIFACTS'},
  scope:{quotes:structuredClone(boards.scope),journal:{season:journal.manifest.season,round:journal.manifest.matchday}},boardStates,records,
  counts:{boards:boardStates.length,records:records.length,matchedBoards:matched,closedBoards:boardStates.filter(b=>b.boardAvailability==='CLOSED').length,
   incompleteBoards:boardStates.filter(b=>b.completeness.state!=='COMPLETE').length,calculatedModelProbabilities:records.reduce((n,r)=>n+Object.values(r.models).filter(m=>m.probability!==null).length,0)},
  limitations:['Marginal bootstrap intervals are descriptive, not simultaneous confidence or evidence of profit',
   'Historical quotes are not current offers; closed/incomplete boards remain excluded by M1',
   'Missing outcomes never receive invented prices; model projections are separate from observed quotes',
   'No EV, ranking, joint probability, composition, new forecast, refit or delivery'],
  scientificValidation:'PENDING',eligibleForOriginalSelector:false,operationallyApproved:false,appDeliveryAllowed:false,providerRequests:0,actualStakeEUR:0};
 return {...result,canonicalSha256:hashValue(result)};
}
