import {syntheticB1,bindSyntheticB1Source} from './goals-b1.mjs';
import {asianEvidenceTemplate} from '../../scripts/lib/diagnostic-goals-b2/mapping.mjs';
import {quoteIdentity} from '../../scripts/lib/availability.mjs';
import {digest} from '../../scripts/lib/prospective/store.mjs';

// Synthetic manual evidence verifies a code path, not real bookmaker semantics.
export function bindSyntheticAsianEvidence(s,{basis='HOME_SIDE'}={}){
 const quotes=s.report.selections.filter(q=>q.marketType==='spreads');if(!quotes.length)return {...s,asianEvidence:null};
 const envelope=asianEvidenceTemplate(s,quotes[0]);
 envelope.records=quotes.map(q=>({...envelope.records[0],quoteId:q.quoteId,identitySha256:digest(quoteIdentity(q)),sourceLine:q.line,side:q.outcome==='1'?'home':'away',sourceLineBasis:basis,
  selectedSignedLine:basis==='HOME_SIDE'&&q.outcome==='2'?-q.line:q.line,reviewer:'SYNTHETIC_REVIEWER',evidence:'Synthetic signed-side observation; not bookmaker evidence',
  verifiedAtUtc:s.now,rulesUrl:'https://www.bet365.it/synthetic-rules',rulesSha256:'a'.repeat(64),rulesVersion:'SYNTHETIC',
  selectedSideVerified:true,signedLineVerified:true,regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,voidAndPostponementReviewed:true}));
 return {...s,asianEvidence:envelope};
}
export async function syntheticB2(){
 const s=await syntheticB1(),base=s.report.selections[0];
 [-1,-.75,-.5,-.25,0,.25,.5,.75,1].forEach((line,i)=>['1','2'].forEach((outcome,j)=>s.report.selections.push({...base,
  marketId:2000+i,outcomeId:20000+i*2+j,marketType:'spreads',marketName:'Asian Handicap',line,outcome})));
 return bindSyntheticAsianEvidence(bindSyntheticB1Source(s));
}
