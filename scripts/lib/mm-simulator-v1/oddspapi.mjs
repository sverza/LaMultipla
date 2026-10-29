import {buildReport,catalogArray,fixturesArray,fingerprint} from '../odds-report.mjs';
import {SCHEMA,FAMILIES,parseSource,validateBindings,validateBoardSnapshot,availability,identifier,isObject,exactFields,timestamp,hashValue,uniqueSorted} from './contracts.mjs';

const PROFILE=Object.freeze({BTTS:Object.freeze({id:'104',name:'Both Teams To Score',type:'bothteamsscore',line:0,labels:Object.freeze({'104':['Yes','YES'],'105':['No','NO']})}),
 TOTAL_GOALS:Object.freeze({id:'1010',name:'Over Under Full Time',type:'totals',line:2.5,labels:Object.freeze({'1010':['Over','OVER'],'1011':['Under','UNDER']})})});
const tri=v=>typeof v==='boolean'?v:null;
const sid=v=>identifier(v)?String(v):null;
const copy=v=>structuredClone(v);
const fail=c=>{throw Error(c);};
const pointerKey=s=>String(s).replaceAll('~','~0').replaceAll('/','~1');
function pointers(root){const index=new WeakMap();function walk(v,p){if(!v||typeof v!=='object')return;index.set(v,p);for(const [k,x]of Object.entries(v))walk(x,p+'/'+pointerKey(k));}walk(root,'');return index;}
function indexBy(values,key){const index=new Map();for(const v of values){const k=String(v[key]);const rows=index.get(k)??[];rows.push(v);index.set(k,rows);}return index;}
function timeReasons(value,name,observed,required=true){
 if(value==null&&!required)return [];
 return !timestamp(value)?[name+'_MISSING_OR_INVALID']:Date.parse(value)>Date.parse(observed)?[name+'_AFTER_OBSERVATION']:[];
}
export function describeCapabilities(){return {providerId:'oddspapi',adapterVersion:'oddspapi-boards-v1',mode:'OFFLINE_ONLY',bookmaker:'bet365.it',
 families:copy(FAMILIES),mapping:copy(PROFILE),availability:'ALL_FOUR_SIGNALS_REQUIRED',networkAccess:false};}

export function verifySnapshotBinding({rawBytes,catalogBytes,reportBytes,source,bindings}){
 validateBindings(bindings);
 if(!exactFields(source,['providerId','bookmaker','raw','catalog','report'])||source.providerId!=='oddspapi'||source.bookmaker!=='bet365.it')fail('MM_PROVIDER_OR_BOOKMAKER_INVALID');
 const raw=parseSource(rawBytes,source.raw),catalog=parseSource(catalogBytes,source.catalog),report=parseSource(reportBytes,source.report);
 if(!isObject(report)||report.schema!=='lamultipla-oddspapi-private-v2'||report.source?.provider!=='OddsPapi'||report.source.bookmaker!=='bet365.it'
  ||report.source.tournamentId!==23||!timestamp(report.fetchedAtUtc)||report.round?.season!==bindings.season||report.round.matchday!==bindings.round)fail('MM_REPORT_IDENTITY_INVALID');
 if(report.source.fixturesSha256!==fingerprint(raw)||report.source.catalogSha256!==fingerprint(catalog))fail('MM_CANONICAL_SOURCE_HASH_MISMATCH');
 let rebuilt;
 try{rebuilt=buildReport(raw,catalog,{round:report.round,observedAt:report.fetchedAtUtc,source:report.source.mode,maxChangeAgeHours:report.policy?.maxChangeAgeHours??24});}
 catch{fail('MM_NORMALIZATION_INPUT_INVALID');}
 if(fingerprint(rebuilt.selections)!==fingerprint(report.selections))fail('MM_REPORT_REPLAY_MISMATCH');
 const expected=bindings.events.map(e=>String(e.sourceEventId)).sort(),actual=rebuilt.coverage.map(f=>f.fixtureId).sort();
 if(fingerprint(expected)!==fingerprint(actual))fail('MM_EVENT_SET_MISMATCH');
 return {raw,catalog,report,rebuilt};
}

export function adaptOddsPapi(args){
 const {source,bindings}=args,{raw,catalog,report,rebuilt}=verifySnapshotBinding(args),observed=report.fetchedAtUtc;
 const rawIndex=pointers(raw),catalogIndex=pointers(catalog),fixtures=indexBy(fixturesArray(raw),'fixtureId'),definitions=indexBy(catalogArray(catalog),'marketId');
 const quoteIndex=new Map();for(const q of rebuilt.selections){const key=JSON.stringify([q.fixtureId,q.marketId,q.outcomeId,q.playerKey]);const list=quoteIndex.get(key)??[];list.push(q);quoteIndex.set(key,list);}
 const boards=[],excludedMarkets=[];
 for(const event of [...bindings.events].sort((a,b)=>a.kickoffUtc.localeCompare(b.kickoffUtc)||a.id.localeCompare(b.id))){
  const fixtureRows=fixtures.get(String(event.sourceEventId))??[],f=fixtureRows[0],eventReasons=[];
  if(fixtureRows.length!==1)eventReasons.push('EVENT_SOURCE_NOT_UNIQUE');
  if(!f||f.sportId!==10||f.tournamentId!==23||sid(f.seasonId)!==String(event.sourceSeasonId)
   ||f.participant1Name!==event.home.name||f.participant2Name!==event.away.name||sid(f.participant1Id)!==String(event.home.sourceId)
   ||sid(f.participant2Id)!==String(event.away.sourceId)||!timestamp(f.startTime)||Date.parse(f.startTime)!==Date.parse(event.kickoffUtc))eventReasons.push('EVENT_BINDING_MISMATCH');
  if(![0,1].includes(f?.statusId))eventReasons.push('EVENT_NOT_PREGAME_AT_OBSERVATION');
  if(Date.parse(event.kickoffUtc)<=Date.parse(observed))eventReasons.push('EVENT_STARTED_AT_OBSERVATION');
  eventReasons.push(...timeReasons(f?.updatedAt,'EVENT_UPDATED',observed));
  const b=f?.bookmakerOdds?.['bet365.it'];
  if(!isObject(b))eventReasons.push('EXACT_BOOKMAKER_ABSENT');
  if(!identifier(b?.bookmakerFixtureId))eventReasons.push('OPERATOR_EVENT_ID_MISSING');
  for(const marketId of Object.keys(b?.markets??{}).sort())if(!Object.values(PROFILE).some(p=>p.id===marketId))excludedMarkets.push({eventId:event.id,sourceMarketId:marketId,reason:'MARKET_OUTSIDE_M1_ALLOWLIST'});
  for(const [family,profile]of Object.entries(PROFILE)){
   const definitionRows=definitions.get(profile.id)??[],d=definitionRows[0],m=b?.markets?.[profile.id],observedBoard=m!==undefined;
   const reasons=[...eventReasons],warnings=[],outcomes=[],catalogOutcomes=isObject(d)&&Array.isArray(d.outcomes)?d.outcomes:[];
   const definitionValid=definitionRows.length===1&&d.sportId===10&&d.playerProp===false&&d.period==='fulltime'&&d.handicap===profile.line
    &&d.marketType===profile.type&&d.marketName===profile.name&&d.marketLength===2&&catalogOutcomes.length===2
    &&Object.entries(profile.labels).every(([id,[label]])=>catalogOutcomes.filter(o=>String(o?.outcomeId)===id&&o.outcomeName===label).length===1);
   if(!definitionValid)reasons.push('EXACT_CATALOG_MAPPING_INVALID');
   if(!observedBoard)reasons.push('MARKET_NOT_OBSERVED');
   if(!isObject(m)||!isObject(m.outcomes))reasons.push('MARKET_STRUCTURE_INVALID');
   if(!identifier(m?.bookmakerMarketId))reasons.push('OPERATOR_MARKET_ID_MISSING');
   if(isObject(m)&&Object.entries({marketId:profile.id,handicap:profile.line,period:'fulltime',marketName:profile.name,marketType:profile.type})
    .some(([field,value])=>Object.hasOwn(m,field)&&(field==='marketId'?sid(m[field])!==value:m[field]!==value)))reasons.push('RAW_MARKET_IDENTITY_CONFLICT');
   const actualSignals=[];let conflict=false;
   for(const [outcomeId,o]of Object.entries(isObject(m?.outcomes)?m.outcomes:{}).sort(([a],[b])=>a.localeCompare(b))){
    const players=isObject(o?.players)?Object.entries(o.players):[];
    if(!players.length){reasons.push('OUTCOME_QUOTE_MISSING');continue;}
    for(const [playerKey,price]of players){
     const qr=[],qw=[],mapping=profile.labels[outcomeId],rows=quoteIndex.get(JSON.stringify([String(event.sourceEventId),profile.id,outcomeId,playerKey]))??[],q=rows[0];
     if(!mapping)qr.push('OUTCOME_ID_OUTSIDE_VERIFIED_MAPPING');
     if(playerKey!=='0'||price?.playerName!=null||players.length!==1)qr.push('NON_TEAM_OR_DUPLICATE_OUTCOME');
     if(rows.length!==1)qr.push('NORMALIZED_QUOTE_NOT_UNIQUE');
     if(!isObject(price)||!identifier(price.bookmakerOutcomeId))qr.push('OPERATOR_OUTCOME_ID_MISSING');
     if(isObject(o)&&Object.hasOwn(o,'outcomeId')&&sid(o.outcomeId)!==outcomeId)qr.push('RAW_OUTCOME_IDENTITY_CONFLICT');
     if(isObject(price)&&Object.entries({fixtureId:String(event.sourceEventId),marketId:profile.id,outcomeId})
      .some(([field,value])=>Object.hasOwn(price,field)&&sid(price[field])!==value))qr.push('RAW_PRICE_IDENTITY_CONFLICT');
     if(!q||q.price===null)qr.push('INVALID_DECIMAL_PRICE');
     qr.push(...timeReasons(price?.changedAt,'PRICE_CHANGED',observed),...timeReasons(price?.bookmakerChangedAt,'OPERATOR_CHANGED',observed,false));
     if(timestamp(price?.changedAt)&&Date.parse(observed)-Date.parse(price.changedAt)>86400000)qw.push('LAST_CHANGE_OLDER_THAN_24H_NOT_SYNC_PROOF');
     const enabled=tri(price?.active);actualSignals.push(enabled);
     if(enabled!==true)qr.push(enabled===false?'OUTCOME_DISABLED':'OUTCOME_AVAILABILITY_UNKNOWN');
     const value={id:hashValue([event.id,profile.id,outcomeId,playerKey]),outcome:mapping?.[1]??null,price:q?.price??null,
      observedAtUtc:observed,lastChangedAtUtc:timestamp(price?.changedAt)?price.changedAt:null,
      operatorChangedAtUtc:timestamp(price?.bookmakerChangedAt)?price.bookmakerChangedAt:null,
      availability:enabled===true?'OPEN':enabled===false?'CLOSED':'UNKNOWN',reasons:uniqueSorted(qr),warnings:uniqueSorted(qw),
      provenance:{sourceOutcomeId:outcomeId,operatorOutcomeId:sid(price?.bookmakerOutcomeId),sourceParticipantKey:playerKey,
       rawPointer:rawIndex.get(price)??(rawIndex.has(o)?rawIndex.get(o)+'/players/'+pointerKey(playerKey):null),catalogPointer:catalogIndex.get(catalogOutcomes.find(x=>String(x.outcomeId)===outcomeId))??null,
       rawStatus:{active:price?.active??null},rawPrice:price?.price??null}};
     outcomes.push(value);
    }
   }
   const expected=FAMILIES[family].outcomes,present=outcomes.map(q=>q.outcome),missing=expected.filter(name=>!present.includes(name));
   const unexpectedSourceOutcomeIds=Object.keys(isObject(m?.outcomes)?m.outcomes:{}).filter(id=>!Object.hasOwn(profile.labels,id)).sort();
   conflict=unexpectedSourceOutcomeIds.length>0||outcomes.some(q=>!expected.includes(q.outcome))||expected.some(name=>present.filter(x=>x===name).length>1);
   const operatorIds=outcomes.map(q=>q.provenance.operatorOutcomeId).filter(v=>v!==null);
   if(new Set(operatorIds).size!==operatorIds.length){conflict=true;reasons.push('OPERATOR_OUTCOME_IDS_NOT_UNIQUE');}
   if(missing.length)reasons.push('EXPECTED_OUTCOMES_MISSING');if(conflict)reasons.push('OUTCOME_IDENTITY_CONFLICT');
   const a=availability({operatorEnabled:tri(b?.bookmakerIsActive),operatorUnsuspended:typeof b?.suspended==='boolean'?!b.suspended:null,
    marketEnabled:tri(m?.marketActive),outcomesEnabled:actualSignals});
   if(a.state!=='OPEN')reasons.push('SOURCE_FLAGS_'+a.state);
   const structural=uniqueSorted([...reasons.filter(r=>!r.startsWith('SOURCE_FLAGS_')),...outcomes.flatMap(q=>q.reasons.filter(r=>!['OUTCOME_DISABLED','OUTCOME_AVAILABILITY_UNKNOWN'].includes(r)))]);
   const complete=!missing.length&&!conflict&&outcomes.length===2;
   const exclusions=uniqueSorted([...reasons,...outcomes.flatMap(q=>q.reasons)]);
   boards.push({id:hashValue([event.id,family,profile.id]),event:copy(event),family,period:'REGULATION_FULL_TIME',line:FAMILIES[family].line,
    observed:observedBoard,normalization:{state:structural.length?'INVALID':'VALID',reasons:structural},
    completeness:{state:conflict?'CONFLICT':complete?'COMPLETE':'INCOMPLETE',expected:[...expected],present,missing,unexpectedSourceOutcomeIds},availability:a,
    outcomes,exclusionReasons:exclusions,warnings:uniqueSorted([...warnings,...outcomes.flatMap(q=>q.warnings)]),
    diagnosticInputReady:observedBoard&&complete&&!structural.length&&a.state==='OPEN'&&!exclusions.length,
    scientificEligibility:'NOT_EVALUATED',operationalEligibility:'NOT_EVALUATED',eligibleForOriginalSelector:false,
    provenance:{sourceEventId:String(event.sourceEventId),operatorEventId:sid(b?.bookmakerFixtureId),sourceSeasonId:String(event.sourceSeasonId),
     sourceMarketId:profile.id,operatorMarketId:sid(m?.bookmakerMarketId),rawPointer:rawIndex.get(m)??null,
     sourceOutcomeIds:Object.keys(isObject(m?.outcomes)?m.outcomes:{}).sort(),catalogPointer:catalogIndex.get(d)??null,rawLine:d?.handicap??null,
     rawStatus:{bookmakerIsActive:b?.bookmakerIsActive??null,suspended:b?.suspended??null,marketActive:m?.marketActive??null}},
    temporal:{classification:'ARCHIVED_OBSERVATION_ONLY',freshness:'NOT_EVALUATED',eventUpdatedAtUtc:timestamp(f?.updatedAt)?f.updatedAt:null}});
  }
 }
 const result={schema:SCHEMA,adapterVersion:'oddspapi-boards-v1',mappingSha256:hashValue(PROFILE),bindingSha256:hashValue(bindings),
  scope:{competition:bindings.competition,season:bindings.season,round:bindings.round,eventCount:bindings.events.length},
  source:{providerId:'oddspapi',bookmaker:'bet365.it',observedAtUtc:observed,raw:copy(source.raw),catalog:copy(source.catalog),report:copy(source.report),
   captureMode:report.source.mode??null,observationKind:report.source.mode==='synthetic_test'?'SYNTHETIC':'ARCHIVED',
   rawCanonicalSha256:report.source.fixturesSha256,catalogCanonicalSha256:report.source.catalogSha256,
   acquisitionAuthenticity:'REFERENCED_ARCHIVE_NOT_EXTERNAL_ATTESTATION'},
  boards,excludedMarkets,providerRequests:0,actualStakeEUR:0,appDeliveryAllowed:false,scientificEligibility:'NOT_EVALUATED',operationalEligibility:'NOT_EVALUATED'};
 validateBoardSnapshot(result);return {...result,canonicalSha256:hashValue(result)};
}

export function verifyNormalizedSnapshot(snapshot,args){
 validateBoardSnapshot(snapshot);
 if(hashValue(snapshot)!==hashValue(adaptOddsPapi(args)))fail('MM_NORMALIZED_REPLAY_MISMATCH');
 return true;
}
