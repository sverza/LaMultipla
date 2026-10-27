import {canonicalTeam} from '../goals/data.mjs';
import {FAMILIES,hashValue,uniqueSorted,timestamp} from './contracts.mjs';

export const UNIVERSE_SCHEMA='lamultipla-mm-universe-coverage-v1';
// The journal manifest has already passed validateJournal. Observed boards are
// reconciled to it, never used to infer a smaller authorized population.
export function reconcileUniverse(snapshot,manifest){
 if(!manifest||!Array.isArray(manifest.events)||manifest.events.length!==10
  ||new Set(manifest.events.map(e=>e.fixtureId)).size!==10||manifest.events.some(e=>typeof e.fixtureId!=='string'
   ||!e.home||!e.away||!timestamp(e.kickoffUtc)))throw Error('MM_UNIVERSE_MANIFEST_INVALID');
 const expected=new Map(manifest.events.map(e=>[String(e.fixtureId),e])),present=new Set(),pairs=new Map(),eventVariants=new Map();
 const unexpected=[],mismatches=[];
 for(const b of snapshot.boards){
  const id=String(b.event.sourceEventId),e=expected.get(id);present.add(id);
  const pair=JSON.stringify([id,b.family]);pairs.set(pair,(pairs.get(pair)??0)+1);
  const variants=eventVariants.get(id)??new Set();variants.add(hashValue(b.event));eventVariants.set(id,variants);
  if(!e)unexpected.push(id);
  else if(canonicalTeam(b.event.home.name)!==e.home||canonicalTeam(b.event.away.name)!==e.away||b.event.kickoffUtc!==e.kickoffUtc
   ||b.provenance.sourceEventId!==id)mismatches.push({fixtureId:id,boardId:b.id,reason:'EXACT_MANIFEST_IDENTITY_MISMATCH'});
 }
 for(const [id,variants]of eventVariants)if(variants.size>1)mismatches.push({fixtureId:id,boardId:null,reason:'CONFLICTING_EVENT_BINDINGS'});
 const missingFixtureIds=[...expected.keys()].filter(id=>!present.has(id)).sort(),unexpectedFixtureIds=uniqueSorted(unexpected);
 const missingBoardKeys=[];for(const id of expected.keys())for(const family of Object.keys(FAMILIES)){
  const key=JSON.stringify([id,family]);if(!pairs.has(key))missingBoardKeys.push(key);
 }
 const duplicateBoardKeys=[...pairs].filter(([,n])=>n>1).map(([k])=>k).sort();
 const scopeConsistent=snapshot.scope?.season===manifest.season&&snapshot.scope?.round===manifest.matchday
  &&snapshot.scope?.eventCount===expected.size;
 const identityMismatches=mismatches.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const reasons=uniqueSorted([...(missingFixtureIds.length?['EXPECTED_FIXTURES_MISSING']:[]),...(missingBoardKeys.length?['EXPECTED_BOARDS_MISSING']:[]),
  ...(unexpectedFixtureIds.length?['UNEXPECTED_FIXTURES']:[]),...(duplicateBoardKeys.length?['DUPLICATE_FIXTURE_FAMILY']:[]),
  ...(identityMismatches.length?['FIXTURE_IDENTITY_MISMATCH']:[]),...(!scopeConsistent?['UNAUTHORIZED_SCOPE_MISMATCH']:[])]);
 return {schema:UNIVERSE_SCHEMA,authority:'VALIDATED_FROZEN_JOURNAL_MANIFEST',manifestSha256:hashValue(manifest),
  reducedScopeAuthorized:false,complete:reasons.length===0,expectedFixtures:expected.size,receivedFixtures:present.size,
  matchedFixtures:[...present].filter(id=>expected.has(id)).length,expectedBoards:expected.size*Object.keys(FAMILIES).length,
  receivedBoards:snapshot.boards.length,missingFixtureIds,unexpectedFixtureIds,missingBoardKeys:missingBoardKeys.sort(),duplicateBoardKeys,
  identityMismatches,scopeConsistent,reasons,
  gapCount:missingBoardKeys.length+unexpectedFixtureIds.length+duplicateBoardKeys.length+identityMismatches.length+(scopeConsistent?0:1)};
}
