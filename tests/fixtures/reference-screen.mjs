// Deterministic synthetic software fixtures; never real G8 evidence.
import {sample,catalog} from './oddspapi.mjs';
import {syntheticDecisionBundle} from './decision.mjs';
import {buildReport} from '../../scripts/lib/odds-report.mjs';
import {digest} from '../../scripts/lib/prospective/store.mjs';
import {verificationTemplate} from '../../scripts/lib/availability.mjs';
import {settlementTemplate} from '../../scripts/lib/decision/gates.mjs';
import {createDecision} from '../../scripts/lib/shadow/pipeline.mjs';
import {governance} from '../../scripts/lib/decision/governance.mjs';
export const screenNow='2026-10-23T13:00:00.000Z';
export function referenceScreenFixture(kind='simulation',{now=screenNow}={}){
 const b=syntheticDecisionBundle(kind,{now,matchday:8});
 b.journal.provenance.synthetic=true;
 b.journal.entries=b.journal.entries.map((e,i)=>{
  const {entrySha256:ignored,...content}=e;void ignored;
  if(i>=2){content.probabilities=[.4,.3,.3];content.intervals95=[[.35,.45],[.25,.35],[.25,.35]];}
  return {...content,entrySha256:digest(content)};
 });
 const raw=sample();for(const [i,f] of raw.entries()){
  f.startTime=b.journal.entries[i].kickoffUtc;
  f.bookmakerOdds['bet365.it'].markets={101:f.bookmakerOdds['bet365.it'].markets[101]};
  for(const [outcome,o] of Object.entries(f.bookmakerOdds['bet365.it'].markets[101].outcomes))for(const q of Object.values(o.players)){
   q.price=kind!=='no_value'&&i<2&&outcome==='101'?1.2:2;q.changedAt=new Date(Date.parse(now)-60000).toISOString();
  }
 }
 b.report=buildReport(raw,catalog,{round:b.report.round,observedAt:new Date(Date.parse(now)-60000).toISOString(),source:'synthetic_test'});
 b.assessment={estimates:b.report.selections.map(q=>({quoteId:q.quoteId,
  manualVerification:{...verificationTemplate(b.report,q),availability:'available',observedPrice:q.price,verifiedAtUtc:now,reviewer:'SYNTHETIC',evidence:'SYNTHETIC ONLY'},
  settlementVerification:kind==='missing_rules'?undefined:{...settlementTemplate(b.report,q),rulesUrl:'https://help.bet365.it/synthetic',rulesVersion:'SYNTHETIC',rulesSha256:'a'.repeat(64),
   reviewedAtUtc:now,reviewer:'SYNTHETIC',evidence:'SYNTHETIC ONLY',regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,voidAndPostponementReviewed:true}}))};
 b.combinedPrices=kind==='simulation'?[{...b.combinedPrices[0],reportSha256:digest(b.report),quoteIds:b.report.selections.filter(q=>['synthetic-0','synthetic-1'].includes(q.fixtureId)&&q.outcome==='1').map(q=>q.quoteId)}]:[];
 b.decision=createDecision(b);b.decision.final=false;b.decision.governance=governance(b.decision);
 const schedule={schema:'lamultipla-prospective-schedule-v1',season:'2026/27',matchday:8,events:b.journal.manifest.events.map(({fixtureId,home,away,kickoffUtc})=>({fixtureId,home,away,kickoffUtc}))};
 const reference={journal:b.journal,frozenAtUtc:b.journal.generatedAtUtc,verified:{status:'FROZEN_VERIFIED',receiptSha256:'f'.repeat(64)},input:{schedule,registry:{study:b.study}}};
 return {bundle:b,reference,catalog,rawFixtures:raw};
}
