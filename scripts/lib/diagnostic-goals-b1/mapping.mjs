import {digest} from '../prospective/store.mjs';
import {buildReport,catalogArray,fixturesArray} from '../odds-report.mjs';
import {quoteIdentity} from '../availability.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {quoteSpec} from '../engine/markets.mjs';

export const B1_POLICY=Object.freeze({version:'goals-mapping-b1-v1',period:'fulltime',
 types:Object.freeze(['doublechance','totals','teamtotals-team1','teamtotals-team2','drawnobet']),
 doubleChanceLabels:Object.freeze({'1X':'1X','2X':'X2','X2':'X2','12':'12'}),eligibleForSelector:false,operationallyApproved:false});
const names={doublechance:['Double Chance Full Time','Double Chance'],totals:['Over Under Full Time'],
 'teamtotals-team1':['Over Under Team 1'],'teamtotals-team2':['Over Under Team 2'],drawnobet:['Draw No Bet']};
const sourceFields=['price','active','marketActive','bookmakerIsActive','suspended','statusId','observedAtUtc','changedAt','bookmakerChangedAt','bookmakerMarketId','bookmakerOutcomeId'];
const same=(a,b)=>digest(a)===digest(b),key=q=>digest([q.fixtureId,q.marketId,q.outcomeId,q.playerKey]);

// Reconcile against a fresh deterministic interpretation of the SAME immutable inputs, never a network response.
export function prepareB1Mapping({report,catalog,fixtures,journal,reportSha256=digest(report),now=new Date()}){
 const data=catalog?.catalog??catalog,clock=new Date(now).getTime();
 if(!Number.isFinite(clock)||report?.schema!=='lamultipla-oddspapi-private-v2'||report.source?.provider!=='OddsPapi'
  ||report.source.bookmaker!=='bet365.it'||report.source.tournamentId!==23)throw Error('B1_REPORT_INVALID');
 if(report.source.catalogSha256!==digest(data)||report.source.fixturesSha256!==digest(fixtures))throw Error('B1_SOURCE_HASH_MISMATCH');
 if(!Number.isFinite(Date.parse(report.fetchedAtUtc))||Date.parse(report.fetchedAtUtc)>clock)throw Error('B1_OBSERVATION_INVALID_OR_FUTURE');
 if(report.round?.season!==journal.manifest.season||report.round?.matchday!==journal.manifest.matchday)throw Error('B1_ROUND_MISMATCH');
 if(!Array.isArray(report.round.fixtureIds)||!same([...report.round.fixtureIds].sort(),journal.entries.map(e=>e.fixtureId).sort()))throw Error('B1_FULL_ROUND_FIXTURE_SET_MISMATCH');
 const reconstructed=buildReport(fixtures,data,{round:report.round,observedAt:report.fetchedAtUtc,source:'offline',maxChangeAgeHours:report.policy?.maxChangeAgeHours??24});
 const sourceRows=new Map(),counts=new Map(),entries=new Map(journal.entries.map(e=>[e.fixtureId,e])),resolutions=new Map(),records=[];
 const rawFixtureCounts=new Map(),definitionCounts=new Map();
 for(const f of fixturesArray(fixtures))rawFixtureCounts.set(String(f.fixtureId),(rawFixtureCounts.get(String(f.fixtureId))??0)+1);
 for(const d of catalogArray(data))definitionCounts.set(String(d.marketId),(definitionCounts.get(String(d.marketId))??0)+1);
 for(const q of reconstructed.selections){const k=key(q),rows=sourceRows.get(k)??[];rows.push(q);sourceRows.set(k,rows);}
 for(const q of report.selections)counts.set(q.quoteId,(counts.get(q.quoteId)??0)+1);
 for(const q of report.selections){
  if(!B1_POLICY.types.includes(q.marketType))continue;
  const reasons=[],rows=sourceRows.get(key(q))??[],original=rows[0],entry=entries.get(q.fixtureId);
  if(report.round.verified!==true||reconstructed.round.verified!==true)reasons.push('B1_ROUND_NOT_CONFIRMED');
  if(rawFixtureCounts.get(q.fixtureId)!==1||definitionCounts.get(String(q.marketId))!==1)reasons.push('B1_SOURCE_IDS_NOT_UNIQUE');
  if(rows.length!==1||counts.get(q.quoteId)!==1||q.quoteId!==digest([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey]))reasons.push('B1_DUPLICATE_OR_INVALID_QUOTE_ID');
  if(!original||!same(quoteIdentity(q),quoteIdentity(original))||!same(sourceFields.map(f=>q[f]??null),sourceFields.map(f=>original?.[f]??null)))reasons.push('B1_EXACT_SOURCE_IDENTITY_OR_PRICE_MISMATCH');
  if(!entry||!Array.isArray(q.fixture)||canonicalTeam(q.fixture[0])!==entry.home||canonicalTeam(q.fixture[1])!==entry.away||q.kickoffUtc!==entry.kickoffUtc)reasons.push('B1_FROZEN_FIXTURE_OR_HOME_AWAY_MISMATCH');
  if(!Array.isArray(q.participantIds)||q.participantIds.length!==2||q.participantIds.some(id=>id==null)||q.participantIds[0]===q.participantIds[1])reasons.push('B1_PARTICIPANT_IDS_MISSING_OR_AMBIGUOUS');
  if(q.period!=='fulltime'||q.playerProp!==false||q.playerKey!=='0'||q.playerName!=null||!names[q.marketType].includes(q.marketName))reasons.push('B1_PERIOD_PLAYER_OR_NAME_UNSUPPORTED');
  if(original?.issues?.some(i=>['market_identity_incomplete','invalid_line','event_identity_incomplete','duplicate_fixture_conflict','unexpected_player_in_standard_market'].includes(i)))reasons.push('B1_PROVIDER_IDENTITY_INCOMPLETE');
  const canonicalOutcome=q.marketType==='doublechance'?(Object.hasOwn(B1_POLICY.doubleChanceLabels,q.outcome)?B1_POLICY.doubleChanceLabels[q.outcome]:null):q.outcome;
  const canonical=q.marketType==='doublechance'?{...q,marketName:'Double Chance',outcome:canonicalOutcome}:q;
  const spec=quoteSpec(canonical,null);if(!spec)reasons.push('B1_OUTCOME_LINE_OR_PAYOFF_UNSUPPORTED');
  const unique=[...new Set(reasons)],accepted=unique.length===0;
  const row={quoteId:q.quoteId,fixtureId:q.fixtureId,marketId:q.marketId,outcomeId:q.outcomeId,rawOutcome:q.outcome,canonicalOutcome,
   identitySha256:digest(quoteIdentity(q)),state:accepted?'VERIFIED_SOURCE_MAPPING':'REFUSED',spec:accepted?spec:null,reasons:unique,
   priceFreshAtObservation:clock-Date.parse(report.fetchedAtUtc)<=30*60000,settlementRulesState:'MANUAL_RULES_AND_TICKET_STILL_REQUIRED',eligibleForSelector:false};
  records.push(row);if(accepted)resolutions.set(q,spec);
 }
 const audit={schema:'lamultipla-goal-mapping-b1-v1',generatedAtUtc:new Date(clock).toISOString(),policy:B1_POLICY,policySha256:digest(B1_POLICY),
  reportSha256,catalogSha256:report.source.catalogSha256,fixturesSha256:report.source.fixturesSha256,journalSha256:digest(journal),
  records,counts:{targetQuotes:records.length,verified:records.filter(r=>r.state==='VERIFIED_SOURCE_MAPPING').length,refused:records.filter(r=>r.state==='REFUSED').length},
  originalInputsUnchanged:true,providerRequests:0,eligibleForSelector:false,operationallyApproved:false,actualStakeEUR:0};
 return {audit,resolve:(q,mapping)=>B1_POLICY.types.includes(q.marketType)?resolutions.get(q)??null:quoteSpec(q,mapping)};
}
