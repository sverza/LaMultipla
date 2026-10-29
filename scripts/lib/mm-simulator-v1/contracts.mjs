import {createHash} from 'node:crypto';

export const SCHEMA='lamultipla-market-boards-v1';
export const BINDINGS_SCHEMA='lamultipla-event-bindings-v1';
export const INPUT_SCHEMA='lamultipla-offline-boards-input-v1';
export const FAMILIES=Object.freeze({BTTS:Object.freeze({line:null,outcomes:Object.freeze(['YES','NO'])}),
 TOTAL_GOALS:Object.freeze({line:2.5,outcomes:Object.freeze(['OVER','UNDER'])})});
export const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const exactFields=(v,fields)=>isObject(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
export const hashBytes=v=>createHash('sha256').update(v).digest('hex');
export const hashValue=v=>hashBytes(JSON.stringify(v));
export const identifier=v=>(typeof v==='string'&&v.length>0&&v.trim()===v)||(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0);
export const timestamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)
 &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19);
export const uniqueSorted=a=>[...new Set(a)].sort();
const fail=code=>{throw Error(code);};

// Byte verification precedes parsing. A second lexical pass rejects duplicate JSON keys,
// including escaped spellings, which JSON.parse alone would silently overwrite.
export function parseSource(bytes,reference){
 if(!Buffer.isBuffer(bytes)||!exactFields(reference,['ref','sha256'])||typeof reference.ref!=='string'||!reference.ref.trim()
  ||/[?#\r\n]/.test(reference.ref)||reference.ref.includes('://')||!/^([a-f0-9]{64})$/.test(reference.sha256??''))fail('MM_SOURCE_REFERENCE_INVALID');
 if(hashBytes(bytes)!==reference.sha256)fail('MM_SOURCE_BYTES_MISMATCH');
 let value;const text=bytes.toString('utf8');
 if(!Buffer.from(text).equals(bytes))fail('MM_SOURCE_ENCODING_INVALID');
 try{value=JSON.parse(text);}catch{fail('MM_SOURCE_JSON_INVALID');}
 let at=0;const ws=()=>{while(/\s/.test(text[at]??'')&&at<text.length)at++;};
 function string(){const start=at++;while(at<text.length){const c=text[at++];if(c==='\\')at++;else if(c==='"')return JSON.parse(text.slice(start,at));}fail('MM_SOURCE_JSON_INVALID');}
 function visit(){ws();const c=text[at];
  if(c==='{'){at++;ws();const seen=new Set();if(text[at]==='}'){at++;return;}
   while(at<text.length){ws();const key=string();if(seen.has(key))fail('MM_SOURCE_DUPLICATE_JSON_KEY');seen.add(key);ws();at++;visit();ws();if(text[at++]==='}')return;}}
  else if(c==='['){at++;ws();if(text[at]===']'){at++;return;}while(at<text.length){visit();ws();if(text[at++]===']')return;}}
  else if(c==='"')string();else while(at<text.length&&!/[\s,\]}]/.test(text[at]))at++;
 }
 visit();return value;
}

export function validateBindings(b){
 if(!exactFields(b,['schema','competition','season','round','events'])||b.schema!==BINDINGS_SCHEMA||b.competition!=='ITA_SERIE_A'||!/^\d{4}\/\d{2}$/.test(b.season??'')
  ||Number(b.season.slice(5))!==(Number(b.season.slice(0,4))+1)%100||!Number.isInteger(b.round)||b.round<1||b.round>38
  ||!Array.isArray(b.events)||!b.events.length)fail('MM_BINDINGS_INVALID');
 const ids=new Set(),providerIds=new Set();
 for(const e of b.events){
  if(!exactFields(e,['id','sourceEventId','sourceSeasonId','kickoffUtc','home','away'])||!identifier(e.id)||typeof e.id!=='string'||!identifier(e.sourceEventId)||!identifier(e.sourceSeasonId)
   ||!timestamp(e.kickoffUtc)||![e.home,e.away].every(t=>exactFields(t,['id','sourceId','name'])&&identifier(t.id)&&identifier(t.sourceId)&&typeof t.name==='string'&&t.name.trim())
   ||String(e.home.id)===String(e.away.id)||String(e.home.sourceId)===String(e.away.sourceId)||e.home.name===e.away.name
   ||ids.has(e.id)||providerIds.has(String(e.sourceEventId)))fail('MM_BINDING_IDENTITY_INVALID');
  ids.add(e.id);providerIds.add(String(e.sourceEventId));
 }
 return b;
}

export function availability(signals){
 const values=[signals.operatorEnabled,signals.operatorUnsuspended,signals.marketEnabled,...signals.outcomesEnabled];
 return {state:values.includes(false)?'CLOSED':values.some(v=>v!==true)||!signals.outcomesEnabled.length?'UNKNOWN':'OPEN',signals};
}

// Provider-neutral structural contract. Positive flags and completeness are orthogonal;
// neither is scientific/operational admission, and this milestone cannot grant it.
export function validateBoardSnapshot(s){
 if(!isObject(s)||s.schema!==SCHEMA||typeof s.adapterVersion!=='string'||!s.adapterVersion.trim()||!Array.isArray(s.boards)||!Array.isArray(s.excludedMarkets)
  ||!isObject(s.source)||!timestamp(s.source.observedAtUtc)||s.providerRequests!==0||s.actualStakeEUR!==0||s.appDeliveryAllowed!==false
  ||s.scientificEligibility!=='NOT_EVALUATED'||s.operationalEligibility!=='NOT_EVALUATED')fail('MM_SNAPSHOT_INVALID');
 if(s.canonicalSha256!==undefined&&s.canonicalSha256!==hashValue(Object.fromEntries(Object.entries(s).filter(([key])=>key!=='canonicalSha256'))))fail('MM_SNAPSHOT_HASH_MISMATCH');
 const ids=new Set();
 for(const b of s.boards){const spec=FAMILIES[b.family];
  if(!spec||b.period!=='REGULATION_FULL_TIME'||b.line!==spec.line||!identifier(b.id)||ids.has(b.id)
   ||!isObject(b.event)||!Array.isArray(b.outcomes)||!Array.isArray(b.exclusionReasons)||!Array.isArray(b.warnings)
   ||!['COMPLETE','INCOMPLETE','CONFLICT'].includes(b.completeness.state)||!['VALID','INVALID'].includes(b.normalization.state)
   ||!['OPEN','CLOSED','UNKNOWN'].includes(b.availability.state)||b.scientificEligibility!=='NOT_EVALUATED'||b.operationalEligibility!=='NOT_EVALUATED'
   ||b.eligibleForOriginalSelector!==false)fail('MM_BOARD_INVALID');
  ids.add(b.id);
  if(JSON.stringify(b.completeness.expected)!==JSON.stringify(spec.outcomes))fail('MM_BOARD_OUTCOMES_INVALID');
  const counts=Object.fromEntries(spec.outcomes.map(o=>[o,b.outcomes.filter(q=>q.outcome===o).length]));
  const complete=b.outcomes.length===2&&Object.values(counts).every(n=>n===1);
  if(!Array.isArray(b.completeness.unexpectedSourceOutcomeIds))fail('MM_BOARD_OUTCOMES_INVALID');
  const conflict=b.completeness.unexpectedSourceOutcomeIds.length>0||b.outcomes.some(q=>!spec.outcomes.includes(q.outcome))||Object.values(counts).some(n=>n>1)
   ||new Set(b.outcomes.map(q=>q.provenance.operatorOutcomeId).filter(x=>x!==null)).size!==b.outcomes.filter(q=>q.provenance.operatorOutcomeId!==null).length;
  if(b.completeness.state!==(conflict?'CONFLICT':complete?'COMPLETE':'INCOMPLETE'))fail('MM_FALSE_COMPLETENESS');
  if((b.normalization.state==='VALID')!==(!b.normalization.reasons.length))fail('MM_FALSE_NORMALIZATION');
  if(availability(b.availability.signals).state!==b.availability.state)fail('MM_FALSE_AVAILABILITY');
  for(const q of b.outcomes){if(!Array.isArray(q.reasons)||!Array.isArray(q.warnings)||!isObject(q.provenance)
    ||q.observedAtUtc!==s.source.observedAtUtc||!(q.price===null||Number.isFinite(q.price)&&q.price>1))fail('MM_QUOTE_INVALID');}
  const ready=b.observed&&complete&&b.normalization.state==='VALID'&&b.availability.state==='OPEN'&&!b.exclusionReasons.length;
  if(b.diagnosticInputReady!==ready)fail('MM_FALSE_READINESS');
 }
 return s;
}
