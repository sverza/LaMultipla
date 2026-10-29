// Offline, international reference prices only. Never an authentic decision
// input, Italian price attestation or substitute for OddsPapi's four flags.
import {gunzipSync} from 'node:zlib';
import {hashBytes,hashValue,parseSource,FAMILIES,uniqueSorted,exactFields} from '../mm-simulator-v1/contracts.mjs';

export const REFERENCE_BOARD_SCHEMA='lamultipla-international-reference-boards-v1';
export const PRICE_EVIDENCE_LEVELS=Object.freeze({international:'INTERNATIONAL_REFERENCE',italianTicket:'ITALIAN_TICKET_VERIFIED'});
const profiles=Object.freeze({
 '40':{family:'ONE_X_TWO',name:'Full Time Result',line:null,outcomes:['1','X','2']},
 '10150':{family:'BTTS',name:'Both Teams To Score',line:null,outcomes:FAMILIES.BTTS.outcomes},
 '981':{family:'TOTAL_GOALS',name:'Goals Over/Under',line:2.5,outcomes:FAMILIES.TOTAL_GOALS.outcomes},
 '10202':{family:'TOTAL_GOALS',name:'Alternative Total Goals',line:2.5,outcomes:FAMILIES.TOTAL_GOALS.outcomes}});
const fail=c=>{throw Error(c);},id=v=>typeof v==='string'&&v.trim()===v&&v.length>0;
// Provider UTC precision can be nanoseconds. Keep the original spelling and
// compare exact integer instants; do not rewrite it to the M1 millisecond schema.
function instant(v){
 if(typeof v!=='string')return null;const m=v.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/);if(!m)return null;
 const ms=Date.parse(m[1]+'Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==m[1])return null;
 return BigInt(ms)*1000000n+BigInt((m[2]??'').padEnd(9,'0'));
}
const minutes=(later,earlier)=>Number(later-earlier)/60000000000;
const scalar=v=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?Number(v):null;
const safety=()=>({operationallyApproved:false,scientificallyValidated:false,eligibleForOriginalSelector:false,
 authenticDecisionAllowed:false,appDeliveryAllowed:false,actualStakeEUR:0,providerRequests:0});
function outcome(q,p,m){
 if(p.family==='BTTS')return q.label==='Yes'?'YES':q.label==='No'?'NO':null;
 if(p.family==='TOTAL_GOALS'){
  const value=q.side==='Over'?'OVER':q.side==='Under'?'UNDER':null;
  return q.label!==undefined&&q.label!==q.side?null:value;
 }
 const value=q.label===m.home?'1':q.label==='Draw'?'X':q.label===m.away?'2':null;
 return q.n2!==undefined&&q.n2!==value?null:value;
}
function board({m,rows,profile,groupId,marketId,observedAtUtc,at,server,observation,fixtureIndex,rawReference}){
 const reasons=[],normalization=[],p=profile,group=m.group_status?.[groupId];
 const kickoff=instant(m.kickoff_utc),polled=instant(group?.polled_at),providerLimit=kickoff!==null&&minutes(kickoff,server)>72*60?60:30;
 if(m.in_play!==false)reasons.push(m.in_play===true?'FIXTURE_IN_PLAY':'FIXTURE_PHASE_UNKNOWN');
 if(kickoff===null)reasons.push('KICKOFF_UNKNOWN');else if(kickoff<=at)reasons.push('KICKOFF_REACHED');
 if(m.kickoff_estimated!==undefined&&m.kickoff_estimated!==false)reasons.push('KICKOFF_ESTIMATED_OR_UNKNOWN');
 if(minutes(at,observation)>30)reasons.push('SNAPSHOT_OBSERVATION_EXPIRED');
 if(!group||polled===null)reasons.push('MARKET_CONFIRMATION_MISSING');
 else{
  if(polled>server)reasons.push('MARKET_CONFIRMATION_AFTER_SERVER');
  if(minutes(at,polled)>providerLimit)reasons.push('MARKET_CONFIRMATION_EXPIRED');
  if(group.stale===true)reasons.push('PROVIDER_MARKET_STALE');
  if(group.stale!==undefined&&typeof group.stale!=='boolean')reasons.push('MARKET_STALE_FLAG_AMBIGUOUS');
 }
 const outcomes=rows.map(({q,index})=>{
  const issue=[],name=outcome(q,p,m),changed=instant(q.ts);
  if(q.fixture_id!==m.id)issue.push('FIXTURE_ID_MISMATCH');
  if(q.group_name!==p.name||q.group_id!==groupId)issue.push('MARKET_ID_OR_NAME_MISMATCH');
  if(!id(q.sel_id))issue.push('SELECTION_ID_INVALID');
  if(q.market_id!==undefined&&!id(q.market_id))issue.push('SUBMARKET_ID_INVALID');
  if(q.period!==undefined||q.market_key!==undefined&&q.market_key!==groupId)issue.push('PERIOD_OR_MARKET_KEY_NOT_SUPPORTED');
  if(q.phase!==undefined&&q.phase!=='prematch')issue.push('SELECTION_NOT_PREMATCH');
  if(p.line===null&&(q.line!==undefined||q.handicap!==undefined))issue.push('UNEXPECTED_LINE');
  if(p.line!==null&&(scalar(q.line??q.handicap)!==p.line||q.line!==undefined&&q.handicap!==undefined&&scalar(q.line)!==scalar(q.handicap)))issue.push('LINE_MISMATCH');
  if(!name)issue.push('OUTCOME_IDENTITY_UNRESOLVED');
  if(typeof q.odds_dec!=='number'||!Number.isFinite(q.odds_dec)||q.odds_dec<=1)issue.push('PRICE_INVALID');
  if(changed===null)issue.push('PRICE_CHANGE_TIMESTAMP_INVALID');
  else if(changed>server||polled!==null&&changed>polled)issue.push('PRICE_CHANGE_AFTER_CONFIRMATION');
  if(q.suspended===true)issue.push('SELECTION_SUSPENDED');
  else if(q.suspended!==undefined&&q.suspended!==false)issue.push('SUSPENSION_FLAG_AMBIGUOUS');
  if(['active','marketActive','bookmakerIsActive'].some(k=>Object.hasOwn(q,k)))issue.push('UNDOCUMENTED_AVAILABILITY_FLAGS');
  return {sourceSelectionId:q.sel_id??null,outcome:name,price:typeof q.odds_dec==='number'&&Number.isFinite(q.odds_dec)&&q.odds_dec>1?q.odds_dec:null,
   rawPrice:q.odds_dec??null,lastChangedAtUtc:q.ts??null,suspension:{value:q.suspended===undefined?false:q.suspended,
    basis:q.suspended===undefined?'DOCUMENTED_OMISSION_MEANS_FALSE':'EXPLICIT_PROVIDER_FIELD'},reasons:uniqueSorted(issue),
   provenance:{sourceFixtureId:q.fixture_id,sourceGroupId:q.group_id,sourceMarketId:q.market_id??null,sourcePeriod:q.period??null,
    sourcePhase:q.phase??null,phaseBasis:q.phase===undefined?'DOCUMENTED_PREMATCH_OMISSION':'EXPLICIT_PROVIDER_FIELD',
    rawPointer:`/matches/${fixtureIndex}/quotes/${index}`,rawReference}};
 });
 const present=outcomes.map(o=>o.outcome).filter(Boolean),missing=p.outcomes.filter(o=>!present.includes(o));
 const duplicateOutcomes=present.filter((o,i)=>present.indexOf(o)!==i),duplicateIds=outcomes.map(o=>o.sourceSelectionId).filter((o,i,a)=>a.indexOf(o)!==i);
 const complete=rows.length===p.outcomes.length&&!missing.length&&!duplicateOutcomes.length&&!duplicateIds.length&&present.length===rows.length;
 if(!rows.length)reasons.push('MARKET_OR_LINE_NOT_OBSERVED');
 if(!complete)reasons.push(duplicateOutcomes.length||duplicateIds.length?'BOARD_CONFLICT':'BOARD_INCOMPLETE');
 for(const o of outcomes)normalization.push(...o.reasons.filter(r=>!['SELECTION_SUSPENDED','SUSPENSION_FLAG_AMBIGUOUS'].includes(r)));
 const exclusions=uniqueSorted([...reasons,...outcomes.flatMap(o=>o.reasons)]),eligible=complete&&!exclusions.length;
 return {id:hashValue({fixture:m.id,groupId,marketId,family:p.family,line:p.line}),sourceFixtureId:m.id,home:m.home,away:m.away,kickoffUtc:m.kickoff_utc??null,
  family:p.family,period:'REGULATION_FULL_TIME',line:p.line,sourceGroupId:groupId,sourceMarketId:marketId,
  observed:rows.length>0,observedAtUtc,completeness:{state:complete?'COMPLETE':duplicateIds.length||duplicateOutcomes.length?'CONFLICT':'INCOMPLETE',
   expectedOutcomes:[...p.outcomes],presentOutcomes:uniqueSorted(present),missingOutcomes:missing},
  normalization:{state:normalization.length?'INVALID':'VALID',reasons:uniqueSorted(normalization)},
  availability:{state:eligible?'AVAILABLE_REFERENCE':exclusions.some(r=>/MISSING|UNKNOWN|AMBIGUOUS|UNRESOLVED/.test(r))?'UNCONFIRMED':'UNAVAILABLE',
   reasons:exclusions,marketConfirmedAtUtc:group?.polled_at??null,marketAgeMinutes:polled===null?null:minutes(at,polled),
   providerStale:group?.stale??null,staleFlagBasis:!group?'NO_MARKET_STATUS':group.stale===undefined?'DOCUMENTED_ONLY_TRUE_IS_TRANSMITTED':'EXPLICIT_PROVIDER_FIELD',
   confirmationAgeLimitMinutes:providerLimit,observationAgeLimitMinutes:30},
  referenceEligible:eligible,priceEvidenceLevel:eligible?PRICE_EVIDENCE_LEVELS.international:null,italianTicketEvidence:{state:'NOT_PROVIDED',actualPrice:null},
  identityBinding:'PROVIDER_ONLY_NOT_AUTHORITATIVE_CALENDAR_OR_FORECAST',outcomes};
}
function readMoviSource({wireBytes,receipt,rawReference,evaluatedAtUtc}){
 if(!Buffer.isBuffer(wireBytes)||wireBytes.length>256*1024*1024||receipt?.schema!=='lamultipla-public-feed-diagnostic-receipt-v1'
  ||receipt.url!=='https://moviodds.com/odds?sport=soccer'||receipt.status!==200||receipt.complete!==true||receipt.error!==null
  ||receipt.sha256!==hashBytes(wireBytes)||receipt.bytes!==wireBytes.length||!exactFields(rawReference,['ref','sha256'])
  ||!id(rawReference.ref)||/[?#\r\n]/.test(rawReference.ref)||rawReference.ref.includes('://')||rawReference.sha256!==receipt.sha256)fail('MOVI_SOURCE_EVIDENCE_INVALID');
 const observation=instant(receipt.completedAtUtc),received=instant(receipt.receivedAtUtc),requested=instant(receipt.requestAtUtc),at=instant(evaluatedAtUtc);
 if([observation,received,requested,at].some(t=>t===null)||requested>received||received>observation||observation>at)fail('MOVI_CAPTURE_TIMELINE_INVALID');
 if(!/^application\/json(?:\s*;|$)/i.test(receipt.headers?.['content-type']??''))fail('MOVI_CONTENT_TYPE_INVALID');
 let bytes=wireBytes;
 if(receipt.headers['content-encoding']==='gzip'){
  try{bytes=gunzipSync(wireBytes,{maxOutputLength:512*1024*1024});}catch{fail('MOVI_GZIP_INVALID_OR_TOO_LARGE');}
  if(receipt.decodedSha256!==hashBytes(bytes)||receipt.decodedBytes!==bytes.length)fail('MOVI_DECODED_HASH_MISMATCH');
 }else if(receipt.headers['content-encoding']!==undefined&&receipt.headers['content-encoding']!=='identity')fail('MOVI_ENCODING_UNSUPPORTED');
 const decodedReference={ref:receipt.decodedFile??rawReference.ref,sha256:hashBytes(bytes)},data=parseSource(bytes,decodedReference),server=instant(data?.server_time);
 if(!data||!Array.isArray(data.matches)||data.matches.some(m=>!m||!id(m.id))||server===null||server>received)fail('MOVI_PAYLOAD_OR_SERVER_CLOCK_INVALID');
 if(new Set(data.matches.map(m=>m.id)).size!==data.matches.length)fail('MOVI_DUPLICATE_FIXTURE_ID');
 return {data,decodedReference,server,at,observation};
}
// Calendar-only projection of the same integrity-checked public payload. No
// quote price, market, outcome or availability field is consulted here.
export function extractMoviFixtureIdentities(input){
 const {data}=readMoviSource(input),fixtures=data.matches.filter(m=>m.league==='Italy Serie A'&&m.sport==='soccer').map(m=>{
  if(!id(m.home)||!id(m.away)||m.home===m.away||instant(m.kickoff_utc)===null
   ||typeof m.in_play!=='boolean'||m.kickoff_estimated!==undefined&&m.kickoff_estimated!==false)fail('MOVI_CALENDAR_FIXTURE_INVALID');
  return {sourceFixtureId:m.id,home:m.home,away:m.away,kickoffUtc:m.kickoff_utc,inPlay:m.in_play,
   sourceSeason:m.season??null,sourceRound:m.round??null};
 });
 return {schema:'lamultipla-movi-calendar-identities-v1',fixtures,observedAtUtc:input.receipt.completedAtUtc,
  rawReference:structuredClone(input.rawReference),rawMayContainPrices:true,quoteFieldsConsulted:false,pricesUsedForForecast:false};
}
export function adaptMoviOddsReference(input){
 const {receipt,rawReference,evaluatedAtUtc}=input,{data,decodedReference,server,at,observation}=readMoviSource(input);
 const fixtures=data.matches.map((m,index)=>({m,index})).filter(({m})=>m.league==='Italy Serie A'&&m.sport==='soccer'),boards=[],excluded=[];
 for(const {m,index:fixtureIndex}of fixtures){
  if(!id(m.id)||!id(m.home)||!id(m.away)||m.home===m.away||!Array.isArray(m.quotes))fail('MOVI_FIXTURE_INVALID');
  const selections=new Map();
  for(let index=0;index<m.quotes.length;index++){
   const q=m.quotes[index],p=Object.hasOwn(profiles,q?.group_id??'')?profiles[q.group_id]:null;
   if(!p||p.line!==null&&scalar(q.line??q.handicap)!==p.line){excluded.push({fixtureId:m.id,index,groupId:q?.group_id??null,reason:p?'LINE_OUTSIDE_PROFILE':'GROUP_OUTSIDE_PROFILE'});continue;}
   const key=JSON.stringify([q.group_id,q.market_id??null]),rows=selections.get(key)??[];rows.push({q,index});selections.set(key,rows);
  }
  const observedFamilies=new Set();
  for(const [key,rows]of selections){const [groupId,marketId]=JSON.parse(key),p=profiles[groupId];observedFamilies.add(p.family);
   boards.push(board({m,rows,profile:p,groupId,marketId,observedAtUtc:receipt.completedAtUtc,at,server,observation,fixtureIndex,rawReference:decodedReference}));}
  for(const p of [profiles['40'],profiles['10150'],profiles['981']])if(!observedFamilies.has(p.family))
   boards.push(board({m,rows:[],profile:p,groupId:null,marketId:null,observedAtUtc:receipt.completedAtUtc,at,server,observation,fixtureIndex,rawReference:decodedReference}));
 }
 boards.sort((a,b)=>a.id.localeCompare(b.id));
 const content={schema:REFERENCE_BOARD_SCHEMA,adapterVersion:'moviodds-international-reference-v1',
  source:{provider:'MoviOdds',bookmaker:'bet365',jurisdiction:'INTERNATIONAL_UNSPECIFIED_NOT_ITALIAN_ATTESTATION',url:receipt.url,rawReference,
   decodedReference,firstByteReceivedAtUtc:receipt.receivedAtUtc,observedAtUtc:receipt.completedAtUtc,providerServerTimeUtc:data.server_time,
   localIntegrityOnly:true,externallyCertifiedPrice:false},evaluatedAtUtc,
  scope:{competition:'PROVIDER_LABEL_ITALY_SERIE_A',season:null,round:null,authoritativeUniverseVerified:false},
  fixtures:fixtures.map(({m})=>({sourceFixtureId:m.id,home:m.home,away:m.away,kickoffUtc:m.kickoff_utc??null,inPlay:m.in_play??null,
   sourceSeason:m.season??null,sourceRound:m.round??null})),boards,excludedQuotes:excluded,
  removals:{observed:false,state:'NOT_OBSERVABLE_FROM_SINGLE_REST_SNAPSHOT'},italianTicketEvidence:{state:'NOT_PROVIDED',actualPrice:null},...safety()};
 return {...content,canonicalSha256:hashValue(content)};
}
