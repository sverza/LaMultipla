import {digest} from '../prospective/store.mjs';
import {buildReport,catalogArray,fixturesArray} from '../odds-report.mjs';
import {quoteIdentity} from '../availability.mjs';
import {canonicalTeam} from '../goals/data.mjs';
import {quoteSpec} from '../engine/markets.mjs';
import {B1_POLICY} from '../diagnostic-goals-b1/mapping.mjs';

export const B2_POLICY=Object.freeze({version:'goals-mapping-b2-v1',period:'fulltime',
 types:Object.freeze([...B1_POLICY.types,'1x2','bothteamsscore','spreads']),
 asianEvidenceSchema:'lamultipla-asian-handicap-evidence-b2-v1',eligibleForSelector:false,operationallyApproved:false});
const names={doublechance:['Double Chance Full Time','Double Chance'],totals:['Over Under Full Time'],
 'teamtotals-team1':['Over Under Team 1'],'teamtotals-team2':['Over Under Team 2'],drawnobet:['Draw No Bet'],
 '1x2':['Full Time Result'],bothteamsscore:['Both Teams To Score'],spreads:['Asian Handicap']};
const sourceFields=['price','active','marketActive','bookmakerIsActive','suspended','statusId','observedAtUtc','changedAt','bookmakerChangedAt','bookmakerMarketId','bookmakerOutcomeId'];
const same=(a,b)=>digest(a)===digest(b),key=q=>digest([q.fixtureId,q.marketId,q.outcomeId,q.playerKey]);
const flags=['selectedSideVerified','signedLineVerified','regulationTimeIncludingStoppage','extraTimeExcluded','penaltiesExcluded','voidAndPostponementReviewed'];

// This unfilled template is not evidence. A human must verify the exact selected side AND source-line basis.
export function asianEvidenceTemplate({report,catalog,fixtures},q){
 return {schema:B2_POLICY.asianEvidenceSchema,reportSha256:digest(report),catalogSha256:digest(catalog?.catalog??catalog),fixturesSha256:digest(fixtures),records:[{
  quoteId:q.quoteId,identitySha256:digest(quoteIdentity(q)),sourceLine:q.line,side:null,sourceLineBasis:null,selectedSignedLine:null,
  domain:'bet365.it',origin:'manual_bet365_it',reviewer:'',evidence:'',verifiedAtUtc:null,rulesUrl:null,rulesSha256:null,rulesVersion:null,
  ...Object.fromEntries(flags.map(k=>[k,false]))}]};
}
function asianSpec(q,evidence,evidenceIndex,identityHash,clock,observedAt,hashes){
 const rows=evidenceIndex.get(q.quoteId)??[];
 if(evidence?.schema!==B2_POLICY.asianEvidenceSchema||!same(hashes,[evidence.reportSha256,evidence.catalogSha256,evidence.fixturesSha256])||rows.length!==1)return null;
 const m=rows[0],at=Date.parse(m.verifiedAtUtc);let u;try{u=new URL(m.rulesUrl);}catch{return null;}
 if(m.identitySha256!==identityHash||m.sourceLine!==q.line||!['1','2'].includes(q.outcome)||!['home','away'].includes(m.side)
  ||m.side!==(q.outcome==='1'?'home':'away')||!['SELECTED_SIDE','HOME_SIDE'].includes(m.sourceLineBasis)
  ||!Number.isFinite(m.selectedSignedLine)||m.selectedSignedLine!==(m.sourceLineBasis==='HOME_SIDE'&&m.side==='away'?-q.line:q.line)
  ||m.domain!=='bet365.it'||m.origin!=='manual_bet365_it'||typeof m.reviewer!=='string'||!m.reviewer.trim()||typeof m.evidence!=='string'||!m.evidence.trim()
  ||!flags.every(k=>m[k]===true)||!Number.isFinite(at)||at<Date.parse(observedAt)||at>clock||clock-at>30*60000
  ||u.protocol!=='https:'||u.username||u.password||!/^(?:[a-z0-9-]+\.)*bet365\.(?:it|com)$/i.test(u.hostname)
  ||!/^[a-f0-9]{64}$/.test(m.rulesSha256)||typeof m.rulesVersion!=='string'||!m.rulesVersion.trim())return null;
 const canonical={...q,line:m.selectedSignedLine};
 return quoteSpec(canonical,{quoteId:q.quoteId,line:m.selectedSignedLine,side:m.side});
}

// One input binding pass. B1 is retained as a policy dependency, not invoked as a second source reconstruction.
export function prepareB2Mapping({report,catalog,fixtures,journal,asianEvidence=null,reportSha256=digest(report),now=new Date()}){
 const data=catalog?.catalog??catalog,clock=new Date(now).getTime();
 if(!Number.isFinite(clock)||report?.schema!=='lamultipla-oddspapi-private-v2'||report.source?.provider!=='OddsPapi'
  ||report.source.bookmaker!=='bet365.it'||report.source.tournamentId!==23)throw Error('B2_REPORT_INVALID');
 const catalogSha256=digest(data),fixturesSha256=digest(fixtures);
 if(report.source.catalogSha256!==catalogSha256||report.source.fixturesSha256!==fixturesSha256)throw Error('B2_SOURCE_HASH_MISMATCH');
 if(!Number.isFinite(Date.parse(report.fetchedAtUtc))||Date.parse(report.fetchedAtUtc)>clock)throw Error('B2_OBSERVATION_INVALID_OR_FUTURE');
 if(report.round?.season!==journal.manifest.season||report.round?.matchday!==journal.manifest.matchday)throw Error('B2_ROUND_MISMATCH');
 if(!Array.isArray(report.round.fixtureIds)||!same([...report.round.fixtureIds].sort(),journal.entries.map(e=>e.fixtureId).sort()))throw Error('B2_FULL_ROUND_FIXTURE_SET_MISMATCH');
 const reconstructed=buildReport(fixtures,data,{round:report.round,observedAt:report.fetchedAtUtc,source:'offline',maxChangeAgeHours:report.policy?.maxChangeAgeHours??24});
 const sourceRows=new Map(),counts=new Map(),entries=new Map(journal.entries.map(e=>[e.fixtureId,e])),resolutions=new Map(),records=[];
 const rawFixtureCounts=new Map(),definitionCounts=new Map();
 for(const f of fixturesArray(fixtures))rawFixtureCounts.set(String(f.fixtureId),(rawFixtureCounts.get(String(f.fixtureId))??0)+1);
 for(const d of catalogArray(data))definitionCounts.set(String(d.marketId),(definitionCounts.get(String(d.marketId))??0)+1);
 for(const q of reconstructed.selections){const k=key(q),rows=sourceRows.get(k)??[];rows.push(q);sourceRows.set(k,rows);}
 for(const q of report.selections)counts.set(q.quoteId,(counts.get(q.quoteId)??0)+1);
 const hashes=[reportSha256,catalogSha256,fixturesSha256],evidenceIndex=new Map();
 for(const row of Array.isArray(asianEvidence?.records)?asianEvidence.records:[]){if(!row||typeof row!=='object')continue;const rows=evidenceIndex.get(row.quoteId)??[];rows.push(row);evidenceIndex.set(row.quoteId,rows);}
 for(const q of report.selections){
  if(!B2_POLICY.types.includes(q.marketType))continue;
  const reasons=[],rows=sourceRows.get(key(q))??[],original=rows[0],entry=entries.get(q.fixtureId),identitySha256=digest(quoteIdentity(q));
  if(report.round.verified!==true||reconstructed.round.verified!==true)reasons.push('B2_ROUND_NOT_CONFIRMED');
  if(rawFixtureCounts.get(q.fixtureId)!==1||definitionCounts.get(String(q.marketId))!==1)reasons.push('B2_SOURCE_IDS_NOT_UNIQUE');
  if(rows.length!==1||counts.get(q.quoteId)!==1||q.quoteId!==digest([q.fixtureId,'bet365.it',q.marketId,q.outcomeId,q.playerKey]))reasons.push('B2_DUPLICATE_OR_INVALID_QUOTE_ID');
  if(!original||!same(quoteIdentity(q),quoteIdentity(original))||!same(sourceFields.map(f=>q[f]??null),sourceFields.map(f=>original?.[f]??null)))reasons.push('B2_EXACT_SOURCE_IDENTITY_OR_PRICE_MISMATCH');
  if(!entry||!Array.isArray(q.fixture)||canonicalTeam(q.fixture[0])!==entry.home||canonicalTeam(q.fixture[1])!==entry.away||q.kickoffUtc!==entry.kickoffUtc)reasons.push('B2_FROZEN_FIXTURE_OR_HOME_AWAY_MISMATCH');
  if(!Array.isArray(q.participantIds)||q.participantIds.length!==2||q.participantIds.some(id=>id==null)||q.participantIds[0]===q.participantIds[1])reasons.push('B2_PARTICIPANT_IDS_MISSING_OR_AMBIGUOUS');
  if(q.period!=='fulltime'||q.playerProp!==false||q.playerKey!=='0'||q.playerName!=null||!names[q.marketType].includes(q.marketName))reasons.push('B2_PERIOD_PLAYER_OR_NAME_UNSUPPORTED');
  if(original?.issues?.some(i=>['market_identity_incomplete','invalid_line','event_identity_incomplete','duplicate_fixture_conflict','unexpected_player_in_standard_market'].includes(i)))reasons.push('B2_PROVIDER_IDENTITY_INCOMPLETE');
  const canonicalOutcome=q.marketType==='doublechance'?(Object.hasOwn(B1_POLICY.doubleChanceLabels,q.outcome)?B1_POLICY.doubleChanceLabels[q.outcome]:null):q.outcome;
  const canonical=q.marketType==='doublechance'?{...q,marketName:'Double Chance',outcome:canonicalOutcome}:q;
  const spec=q.marketType==='spreads'?asianSpec(q,asianEvidence,evidenceIndex,identitySha256,clock,report.fetchedAtUtc,hashes):quoteSpec(canonical,null);
  if(!spec)reasons.push(q.marketType==='spreads'?'B2_SIGNED_SIDE_EVIDENCE_MISSING_OR_INVALID':'B2_OUTCOME_LINE_OR_PAYOFF_UNSUPPORTED');
  const unique=[...new Set(reasons)],accepted=unique.length===0;
  records.push({quoteId:q.quoteId,fixtureId:q.fixtureId,marketId:q.marketId,outcomeId:q.outcomeId,rawOutcome:q.outcome,canonicalOutcome,
   identitySha256,state:accepted?'VERIFIED_SOURCE_MAPPING':'REFUSED',spec:accepted?spec:null,sourceLine:q.line,
   signedSideEvidenceSha256:q.marketType==='spreads'&&spec?digest(evidenceIndex.get(q.quoteId)[0]):null,
   reasons:unique,priceFreshAtObservation:clock-Date.parse(report.fetchedAtUtc)<=30*60000,
   settlementRulesState:q.marketType==='spreads'&&spec?'RECORDED_MANUAL_RULES_ATTESTATION_NOT_INDEPENDENT_CERTIFICATION':'MANUAL_RULES_AND_TICKET_STILL_REQUIRED',eligibleForSelector:false});
  if(accepted)resolutions.set(q,spec);
 }
 const audit={schema:'lamultipla-goal-mapping-b2-v1',generatedAtUtc:new Date(clock).toISOString(),policy:B2_POLICY,policySha256:digest(B2_POLICY),
  reportSha256,catalogSha256,fixturesSha256,journalSha256:digest(journal),asianEvidenceSha256:asianEvidence?digest(asianEvidence):null,
  records,counts:{targetQuotes:records.length,verified:records.filter(r=>r.state==='VERIFIED_SOURCE_MAPPING').length,refused:records.filter(r=>r.state==='REFUSED').length},
  originalInputsUnchanged:true,providerRequests:0,eligibleForSelector:false,operationallyApproved:false,actualStakeEUR:0};
 // Unknown market types stay with the original parser, which cannot manufacture additional families.
 return {audit,resolve:(q,mapping)=>B2_POLICY.types.includes(q.marketType)?resolutions.get(q)??null:quoteSpec(q,mapping)};
}
