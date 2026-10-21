import {sha256} from '../../scripts/lib/goals/data.mjs';
export function syntheticResultsLab(){
 const now='2026-10-29T12:00:00Z',kickoffUtc='2026-10-23T18:45:00.000Z',generatedAtUtc='2026-10-23T12:50:00Z';
 const manifest={synthetic:true,season:'2026/27',matchday:8,events:Array.from({length:10},(_,i)=>({fixtureId:'synthetic-'+i,home:'Home '+i,away:'Away '+i,kickoffUtc}))};
 const raw=Buffer.from('SYNTHETIC fulltime source, not real football results');
 const evidence={schema:'lamultipla-supplemental-results-v1',synthetic:true,season:manifest.season,matchday:8,
  source:{id:'football-data.org',url:'https://api.football-data.org/v4/competitions/SA/matches',termsUrl:'https://www.football-data.org/about',documentId:'SYNTHETIC',rawSha256:sha256(raw),
   acquiredAtUtc:'2026-10-26T12:00:00Z',publishedAtUtc:null,rights:{status:'authorized',evidence:'SYNTHETIC only, not a declaration of real rights'}},
  entries:manifest.events.map(e=>({...e,date:'2026-10-23',status:'finished',goals:[1,0],sourceLocator:'synthetic-only',reviewer:'synthetic-test',reviewedAtUtc:'2026-10-26T12:00:00Z'}))};
 const probabilities={reference:{oneXTwo:[.6,.2,.2],btts:.3,over:.4},challenger:{oneXTwo:[.2,.4,.4],btts:.7,over:.8},baseline:{oneXTwo:[1/3,1/3,1/3],btts:.5,over:.5}};
 const forecasts={schema:'lamultipla-synthetic-review-forecasts-v1',sourceData:'synthetic_test',models:['reference','challenger','baseline'].map(id=>({id,role:id,version:'synthetic-v1',registeredAtUtc:'2026-10-21T00:00:00Z'})),
  entries:manifest.events.map(e=>({...e,generatedAtUtc,probabilities:structuredClone(probabilities)}))};
 const observation={schema:'lamultipla-result-observations-v1',source:'openfootball/football.json',license:'CC0-1.0',sourceCommit:'a'.repeat(40),acquiredAtUtc:'2026-10-26T12:00:00Z',
  rows:manifest.events.map(e=>({season:'2026-27',home:e.home,away:e.away,date:'2026-10-23',goals:[1,0],availableAtUtc:'2026-10-25T00:00:00.000Z'}))};
 return {now,manifest,observations:[{evidence,raw}],forecasts,observation};
}
