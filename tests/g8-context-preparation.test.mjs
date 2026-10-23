import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareContextDrafts} from '../scripts/lib/g8-context-preparation.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
const now=new Date('2026-10-21T13:00:00Z'),round={schema:'lamultipla-round-preparation-draft-v1',season:'2026/27',matchday:8,events:Array.from({length:10},(_,i)=>({fixtureId:null,home:'Home '+i,away:'Away '+i,kickoffUtc:'2026-10-23T18:45:00Z'}))};
const fact={team:'Home 0',category:'injuries',statement:'Synthetic individual training; no availability inference',state:'CONFIRMED_STATEMENT',url:'https://example.invalid/training',observedAtUtc:'2026-10-21T12:00:00Z',expiresAtUtc:'2026-10-22T12:00:00Z',availabilityInference:false};
test('all ten drafts retain missing provider IDs and unknown availability, without altering inputs',()=>{
 const dataset={rows:[]},input={round,dataset,facts:[fact],now},before=digest(input),out=prepareContextDrafts(input);
 assert.equal(digest(input),before);assert.equal(out.counts.prepared,10);assert.equal(out.counts.operationallyComplete,0);
 assert.ok(out.dossiers.every(d=>d.fixtureId===null&&!d.operationallyUsable&&!d.contextComplete));
 assert.equal(out.dossiers[0].checks.injuries.state,'REVIEW_PENDING');assert.equal(out.dossiers[0].notes[0].fresh,true);
 assert.equal(prepareContextDrafts({...input,now:'2026-10-23T12:00:00Z'}).dossiers[0].notes[0].fresh,false);
});
test('future, unscoped, non-HTTPS or inferred availability evidence is rejected',()=>{
 for(const patch of [{team:'Other'},{url:'http://example.invalid'},{availabilityInference:true},{observedAtUtc:'2026-10-22T00:00:00Z'},{category:'invented'}])assert.throws(()=>prepareContextDrafts({round,dataset:{rows:[]},facts:[{...fact,...patch}],now}),/SOURCE/);
});
