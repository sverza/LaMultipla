import {syntheticReaderArchive} from './mm-reader.mjs';
import {hashValue,hashBytes} from '../../scripts/lib/mm-simulator-v1/contracts.mjs';
import {adaptMoviOddsReference} from '../../scripts/lib/reference-odds/moviodds-offline.mjs';

// Future-shaped invented archive; artificial times are visible in every vector.
export async function syntheticReferenceExploration(root){
 const f=await syntheticReaderArchive(root,{round:10}),manifest=f.b.manifest,journal=f.b.journalV2,study=f.b.studyV2;
 const bindings={schema:'lamultipla-movi-round-bindings-v1',scope:f.scope,provider:'MoviOdds',manifestSha256:hashValue(manifest),
  events:manifest.events.map(e=>({...e,sourceFixtureId:e.fixtureId,sourceHome:e.home,sourceAway:e.away}))};
 const data={server_time:'2026-10-30T12:49:59.000Z',matches:manifest.events.map(e=>({id:e.fixtureId,home:e.home,away:e.away,
  kickoff_utc:e.kickoffUtc,league:'Italy Serie A',sport:'soccer',in_play:false,
  group_status:{'10150':{polled_at:'2026-10-30T12:49:58Z'},'981':{polled_at:'2026-10-30T12:49:58Z'}},
  quotes:[['10150','Both Teams To Score','YES'],['10150','Both Teams To Score','NO'],['981','Goals Over/Under','OVER'],['981','Goals Over/Under','UNDER']].map(([g,n,o],i)=>({
   fixture_id:e.fixtureId,group_id:g,group_name:n,market_id:g,sel_id:e.fixtureId+'-'+o,odds_dec:2,
   ts:'2026-10-30T12:49:00Z',...(g==='10150'?{label:o==='YES'?'Yes':'No'}:{side:i===2?'Over':'Under',line:'2.5'})}))}))};
 function boardInput(at=f.readAtUtc){const wireBytes=Buffer.from(JSON.stringify(data)),sha256=hashBytes(wireBytes);
  return {wireBytes,receipt:{schema:'lamultipla-public-feed-diagnostic-receipt-v1',url:'https://moviodds.com/odds?sport=soccer',status:200,
   complete:true,error:null,bytes:wireBytes.length,sha256,headers:{'content-type':'application/json'},requestAtUtc:'2026-10-30T12:49:58.000Z',
   receivedAtUtc:'2026-10-30T12:50:00.000Z',completedAtUtc:'2026-10-30T12:50:00.000Z'},
   rawReference:{ref:'.local/SYNTHETIC-ONLY/movi.json',sha256},evaluatedAtUtc:at};}
 const input=(at=f.readAtUtc)=>({manifest,bindings,journal,study,freezeCompletedAtUtc:f.b.receipt.completedAtUtc,
  boards:adaptMoviOddsReference(boardInput(at)),slot:{id:'SYNTHETIC-EXPLICIT-SLOT',fixtureIds:manifest.events.slice(0,3).map(e=>e.fixtureId)},
  calendar:{officialObservedAtUtc:'2026-10-30T12:20:00.000Z',cc0ObservedAtUtc:'2026-10-30T12:20:00.000Z',providerIdentitiesObservedAtUtc:'2026-10-30T12:50:00.000Z'},
  evaluatedAtUtc:at,sourceKind:'SYNTHETIC_TEST_ONLY'});
 return {...f,manifest,bindings,journal,study,data,boardInput,input};
}
