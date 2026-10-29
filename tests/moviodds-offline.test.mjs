import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {adaptMoviOddsReference,extractMoviFixtureIdentities,PRICE_EVIDENCE_LEVELS} from '../scripts/lib/reference-odds/moviodds-offline.mjs';
import {hashBytes} from '../scripts/lib/mm-simulator-v1/contracts.mjs';

// Invented identities/prices, no archived provider data or network calls.
function fixture(){
 const q=(group_id,group_name,sel_id,fields)=>({fixture_id:'test-1',group_id,group_name,market_id:group_id,sel_id,odds_dec:2,
  ts:'2026-10-28T12:00:00.123456789Z',...fields});
 const data={server_time:'2026-10-28T12:01:00.123456789Z',matches:[{id:'test-1',home:'SYNTHETIC Home',away:'SYNTHETIC Away',league:'Italy Serie A',sport:'soccer',
  kickoff_utc:'2026-10-29T20:00:00Z',in_play:false,polled_at:'2026-10-28T12:01:00.000000001Z',group_status:Object.fromEntries(['40','10150','981','10202'].map(k=>[k,{polled_at:'2026-10-28T12:00:30.123456789Z'}])),
  quotes:[q('40','Full Time Result','a',{label:'SYNTHETIC Home',n2:'1'}),q('40','Full Time Result','b',{label:'Draw',n2:'X'}),q('40','Full Time Result','c',{label:'SYNTHETIC Away',n2:'2'}),
   q('10150','Both Teams To Score','d',{label:'Yes'}),q('10150','Both Teams To Score','e',{label:'No'}),
   q('981','Goals Over/Under','f',{side:'Over',line:'2.5'}),q('981','Goals Over/Under','g',{side:'Under',line:'2.5'})]}]};
 const make=({gzip=false,at='2026-10-28T12:01:02.000Z'}={})=>{
  const decoded=Buffer.from(JSON.stringify(data)),wireBytes=gzip?gzipSync(decoded):decoded,sha=hashBytes(wireBytes);
  const receipt={schema:'lamultipla-public-feed-diagnostic-receipt-v1',url:'https://moviodds.com/odds?sport=soccer',status:200,complete:true,error:null,
   headers:{'content-type':'application/json',...(gzip?{'content-encoding':'gzip'}:{})},sha256:sha,bytes:wireBytes.length,
   requestAtUtc:'2026-10-28T12:01:00.000Z',receivedAtUtc:'2026-10-28T12:01:01.000Z',completedAtUtc:'2026-10-28T12:01:02.000Z',
   ...(gzip?{decodedFile:'SYNTHETIC-decoded.json',decodedSha256:hashBytes(decoded),decodedBytes:decoded.length}:{})};
  return {wireBytes,receipt,rawReference:{ref:'SYNTHETIC-wire.json',sha256:sha},evaluatedAtUtc:at};
 };return {data,make,adapt:options=>adaptMoviOddsReference(make(options))};
}
const get=(r,family)=>r.boards.find(b=>b.family===family);
test('Movi offline: complete 1X2, BTTS and 2.5 reference boards; no Italian ticket or authentic admission',()=>{
 const f=fixture(),r=f.adapt();assert.equal(r.boards.length,3);assert.ok(r.boards.every(b=>b.referenceEligible));
 assert.ok(r.boards.every(b=>b.priceEvidenceLevel===PRICE_EVIDENCE_LEVELS.international));
 assert.equal(r.italianTicketEvidence.state,'NOT_PROVIDED');assert.equal(r.operationallyApproved,false);assert.equal(r.actualStakeEUR,0);
 assert.equal(r.scope.season,null);assert.equal(r.scope.round,null);assert.equal(r.scope.authoritativeUniverseVerified,false);
 assert.equal(get(r,'BTTS').outcomes[0].lastChangedAtUtc,'2026-10-28T12:00:00.123456789Z');
});
test('Movi offline: gzip integrity and deterministic immutable replay without I/O',()=>{
 const f=fixture(),input=f.make({gzip:true}),copy={...structuredClone(input),wireBytes:Buffer.from(input.wireBytes)},a=adaptMoviOddsReference(input),b=adaptMoviOddsReference(input);
 assert.deepEqual(a,b);assert.deepEqual(input,copy);
 const bytes=Buffer.from(input.wireBytes);bytes[4]^=1;assert.throws(()=>adaptMoviOddsReference({...input,wireBytes:bytes}),/SOURCE_EVIDENCE/);
 input.receipt.decodedSha256='a'.repeat(64);assert.throws(()=>adaptMoviOddsReference(input),/DECODED_HASH/);
});
test('Movi offline: missing and duplicate outcomes remain incomplete/conflicting, never created',()=>{
 const f=fixture();f.data.matches[0].quotes=f.data.matches[0].quotes.filter(q=>q.sel_id!=='e');const m=get(f.adapt(),'BTTS');
 assert.deepEqual(m.completeness.missingOutcomes,['NO']);assert.equal(m.outcomes.length,1);assert.equal(m.referenceEligible,false);
 const g=fixture();g.data.matches[0].quotes.push({...g.data.matches[0].quotes[3],sel_id:'duplicate-yes'});
 assert.equal(get(g.adapt(),'BTTS').completeness.state,'CONFLICT');
});
test('Movi offline: a complete suspended board is unavailable, not structurally incomplete',()=>{
 const f=fixture();f.data.matches[0].quotes[3].suspended=true;const b=get(f.adapt(),'BTTS');
 assert.equal(b.completeness.state,'COMPLETE');assert.equal(b.referenceEligible,false);assert.ok(b.availability.reasons.includes('SELECTION_SUSPENDED'));
 assert.ok(!b.availability.reasons.includes('BOARD_INCOMPLETE'));
});
test('Movi offline: documented absence of suspension is false, but null/string states fail closed',()=>{
 const f=fixture();assert.equal(get(f.adapt(),'BTTS').outcomes[0].suspension.basis,'DOCUMENTED_OMISSION_MEANS_FALSE');
 for(const state of [null,'false',0]){f.data.matches[0].quotes[3].suspended=state;assert.equal(get(f.adapt(),'BTTS').referenceEligible,false);}
});
test('Movi offline: group freshness controls even with a fresh fixture poll; stale/unknown status cannot pass',()=>{
 const f=fixture(),m=f.data.matches[0];delete m.group_status['10150'];assert.equal(get(f.adapt(),'BTTS').referenceEligible,false);
 m.group_status['10150']={polled_at:'2026-10-28T12:00:30Z',stale:true};assert.equal(get(f.adapt(),'BTTS').referenceEligible,false);
 m.group_status['10150']={polled_at:'2026-10-28T11:00:30Z'};assert.ok(get(f.adapt(),'BTTS').availability.reasons.includes('MARKET_CONFIRMATION_EXPIRED'));
 m.group_status['10150']={polled_at:'2026-10-28T12:00:30Z',stale:'false'};assert.equal(get(f.adapt(),'BTTS').referenceEligible,false);
});
test('Movi offline: unchanged old prices can remain confirmed; change time is not observation time',()=>{
 const f=fixture();for(const q of f.data.matches[0].quotes)q.ts='2026-09-01T12:00:00Z';assert.ok(f.adapt().boards.every(b=>b.referenceEligible));
});
test('Movi offline: expired observation is not renewed by replay; nanosecond future change is rejected',()=>{
 const f=fixture();assert.ok(f.adapt({at:'2026-10-28T12:32:03Z'}).boards.every(b=>!b.referenceEligible));
 f.data.matches[0].quotes[3].ts='2026-10-28T12:00:30.123456790Z';assert.equal(get(f.adapt(),'BTTS').referenceEligible,false);
 assert.throws(()=>f.adapt({at:'2026-10-28T12:01:01Z'}),/TIMELINE/);
});
test('Movi offline: fixture/submarket/period/outcome discordance never creates reference eligibility',()=>{
 for(const mutate of [q=>{q.fixture_id='other';},q=>{q.period='1';},q=>{q.market_key='10150|1';},q=>{q.group_name='Both Teams To Score - 1st Half';},
  q=>{q.label='Maybe';},q=>{q.phase='inplay';},q=>{q.market_id=3;},q=>{q.active=true;}]){
  const f=fixture();mutate(f.data.matches[0].quotes[3]);assert.equal(get(f.adapt(),'BTTS').referenceEligible,false);
 }
});
test('Movi offline: 2.5 cannot be completed from different native markets or another line',()=>{
 const f=fixture();f.data.matches[0].quotes[6].group_id='10202';f.data.matches[0].quotes[6].group_name='Alternative Total Goals';f.data.matches[0].quotes[6].market_id='10202';
 const r=f.adapt();assert.equal(r.boards.filter(b=>b.family==='TOTAL_GOALS').length,2);assert.ok(r.boards.filter(b=>b.family==='TOTAL_GOALS').every(b=>!b.referenceEligible));
 const g=fixture();g.data.matches[0].quotes[6].line='3.5';assert.equal(get(g.adapt(),'TOTAL_GOALS').referenceEligible,false);
});
test('Movi offline: invalid prices, estimated kickoffs and live fixtures cannot pass',()=>{
 for(const price of [null,0,1,-2,'2.0']){const f=fixture();f.data.matches[0].quotes[3].odds_dec=price;assert.equal(get(f.adapt(),'BTTS').referenceEligible,false);}
 const f=fixture();f.data.matches[0].kickoff_estimated=true;assert.ok(f.adapt().boards.every(b=>!b.referenceEligible));
 f.data.matches[0].kickoff_estimated=false;f.data.matches[0].in_play=true;assert.ok(f.adapt().boards.every(b=>!b.referenceEligible));
});
test('Movi offline: source error, malformed JSON, duplicate fixture and regional league confusion fail closed',()=>{
 const f=fixture(),a=f.make();a.receipt.status=503;assert.throws(()=>adaptMoviOddsReference(a),/EVIDENCE/);
 f.data.matches.push(structuredClone(f.data.matches[0]));assert.throws(()=>f.adapt(),/DUPLICATE_FIXTURE/);
 const g=fixture();g.data.matches[0].league='Brazil Serie A';assert.equal(g.adapt().boards.length,0);
 const h=fixture();h.data.matches[0].quotes=null;assert.throws(()=>h.adapt(),/FIXTURE_INVALID/);
 for(const bytes of [Buffer.from('{'),Buffer.from('{"matches":[],"matches":[],"server_time":"2026-10-28T12:00:00Z"}')]){
  const v=fixture().make();v.wireBytes=bytes;v.receipt.sha256=hashBytes(bytes);v.receipt.bytes=bytes.length;v.rawReference.sha256=v.receipt.sha256;
  assert.throws(()=>adaptMoviOddsReference(v),/JSON/);
 }
});
test('Movi calendar-only projection: missing/invalid price boards cannot become inputs to a scientific freeze',()=>{
 const f=fixture(),before=extractMoviFixtureIdentities(f.make());
 f.data.matches[0].quotes=null;const after=extractMoviFixtureIdentities(f.make());
 assert.deepEqual(after.fixtures,before.fixtures);assert.equal(after.quoteFieldsConsulted,false);assert.equal(after.pricesUsedForForecast,false);
 assert.equal(after.rawMayContainPrices,true);assert.throws(()=>f.adapt(),/FIXTURE_INVALID/);
 f.data.matches[0].kickoff_estimated=true;assert.throws(()=>extractMoviFixtureIdentities(f.make()),/CALENDAR_FIXTURE/);
});
