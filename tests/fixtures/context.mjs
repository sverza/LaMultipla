import {buildContext} from '../../scripts/lib/context/dossier.mjs';
export function syntheticContextDataset(manifest,atUtc){
  const teams=manifest.events.flatMap(e=>[e.home,e.away]),rows=[];
  for(let i=0;i<teams.length;i++)for(let k=1;k<=4;k++){
    const home=teams[i],away=teams[(i+k)%teams.length],date=`2026-09-${String(k+10).padStart(2,'0')}`;
    rows.push({key:`2026-27:${home}:${away}`,season:'2026-27',date,home,away,goals:[i%3,k%3],availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()});}
  return {schema:'lamultipla-results-dataset-v1',synthetic:true,source:'openfootball/football.json',license:'CC0-1.0',licenseSha256:'36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673',
    commit:'a'.repeat(40),files:[{path:'2026-27/it.1.json',sha256:'a'.repeat(64)}],acquiredAtUtc:atUtc,cutoffUtc:atUtc,rows};
}
export function syntheticContextBundle(manifest,now){
  const source=(id,authority,team)=>({id,url:`https://example.test/${id}`,authority,team,competition:'ITA_SERIE_A',authorityVerified:true,scope:'men_first_team',reviewedAtUtc:now,reviewedBy:'synthetic tester',
    rights:{mode:'private_selective_fact_notes',basis:'SYNTHETIC TEST ONLY',automatedExtraction:false,publicationAllowed:false}});
  const bundle={schema:'lamultipla-context-evidence-v1',synthetic:true,sources:[source('league','league')],facts:[],reviews:[],calendar:[]};
  for(const [index,e] of manifest.events.entries())for(const [side,team] of [e.home,e.away].entries()){
    const id=`club-${index}-${side}`;bundle.sources.push(source(id,'club',team));
    bundle.facts.push({id:`lineup-${index}-${side}`,fixtureId:e.fixtureId,team,category:'lineups',competition:'ITA_SERIE_A',sourceId:id,
      capturedAtUtc:now,statusAsOfUtc:now,publishedAtUtc:now,data:{kind:'probable',players:Array.from({length:11},(_,i)=>({id:`${id}-player-${i}`,name:`Synthetic Player ${i}`}))}});
    for(const category of ['calendar','injuries','suspensions','lineups'])bundle.reviews.push({id:`review-${index}-${side}-${category}`,fixtureId:e.fixtureId,team,category,status:'checked',
      sourceIds:category==='suspensions'?['league']:[id],reviewedAtUtc:now,reviewer:'synthetic tester',uncertaintyAcknowledged:true,uncertaintyNote:'SYNTHETIC: information is descriptive, probability unchanged',
      allCompetitionsChecked:category==='calendar',windowFromUtc:new Date(Date.parse(e.kickoffUtc)-14*86400000).toISOString(),windowToUtc:new Date(Date.parse(e.kickoffUtc)+7*86400000).toISOString()});
  }return bundle;
}
export function syntheticReviewedContext(manifest,now){return buildContext({manifest,dataset:syntheticContextDataset(manifest,now),evidence:syntheticContextBundle(manifest,now),now});}
