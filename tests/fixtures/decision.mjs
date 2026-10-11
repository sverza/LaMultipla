// SYNTHETIC FUTURE ROUND: fixtures, probabilities, prices and evidence are not real data.
import {sample,catalog,round as baseRound} from './oddspapi.mjs';
import {buildReport} from '../../scripts/lib/odds-report.mjs';
import {digest} from '../../scripts/lib/prospective/store.mjs';
import {sealJournal,CONFIG} from '../../scripts/lib/prospective/freeze.mjs';
import {verificationTemplate} from '../../scripts/lib/availability.mjs';
import {settlementTemplate} from '../../scripts/lib/decision/gates.mjs';
import {createDecision} from '../../scripts/lib/shadow/pipeline.mjs';
import {governance} from '../../scripts/lib/decision/governance.mjs';
import {syntheticReviewedContext} from './context.mjs';
export const syntheticNow='2026-10-17T10:15:00.000Z';
export function syntheticDecisionBundle(kind='simulation'){
  const now=syntheticNow,observed='2026-10-17T10:14:00.000Z',raw=sample(),round={...baseRound,matchday:7,fromUtc:'2026-10-17T00:00:00Z',toUtc:'2026-10-20T00:00:00Z'};
  for(const f of raw){f.startTime='2026-10-17T13:00:00.000Z';for(const m of Object.values(f.bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))for(const s of Object.values(o.players))s.changedAt=observed;}
  const report=buildReport(raw,catalog,{round,observedAt:observed,source:'synthetic_test'});
  const study={schema:'lamultipla-goals-study-v1',synthetic:true,validationCompletedAtUtc:'2026-10-09T23:00:00Z',acceptance:{oneXTwo:{retrospectiveAccepted:true}}};
  const events=report.coverage.map(r=>({fixtureId:r.fixtureId,home:r.fixture[0],away:r.fixture[1],kickoffUtc:r.kickoffUtc,season:round.season,matchday:7}));
  const manifest={season:round.season,matchday:7,events},p=kind==='no_value'?[.4,.3,.3]:[.95,.03,.02],ci=kind==='no_value'?[[.35,.45],[.25,.35],[.25,.35]]:[[.94,.96],[.02,.04],[.01,.03]];
  const journal=sealJournal({model:{converged:true,config:CONFIG,cutoffUtc:'2026-10-01T00:00:00Z'},forecasts:events.map(e=>({...e,central:p,intervals95:ci,
    uncertainty:{replicates:40,failures:0,sufficient:true},baselines:{empirical:[.4,.3,.3],leaguePoisson:[.4,.3,.3]}}))},manifest,
    {studySha256:digest(study),datasetAcquiredAtUtc:'2026-10-16T20:00:00Z',datasetSha256:'d'.repeat(64)},'2026-10-17T10:13:00.000Z');
  report.selections=report.selections.filter(q=>q.fixtureId==='synthetic-0'||q.fixtureId==='synthetic-1');
  for(const q of report.selections)if(q.marketType==='1x2'&&q.period==='fulltime')q.price=kind==='no_value'?2:q.outcome==='1'?1.2:q.price;
  report.selections[0].active=false;report.selections[0].availability='blocked';
  const assessment={estimates:report.selections.map(q=>({quoteId:q.quoteId,
    manualVerification:{...verificationTemplate(report,q),availability:'available',observedPrice:q.price,verifiedAtUtc:now,reviewer:'SYNTHETIC tester',evidence:'SYNTHETIC TEST ONLY'},
    settlementVerification:kind==='missing_rules'?undefined:{...settlementTemplate(report,q),rulesUrl:'https://help.bet365.it/synthetic-rules',rulesVersion:'SYNTHETIC',rulesSha256:'a'.repeat(64),
      reviewedAtUtc:now,reviewer:'SYNTHETIC tester',evidence:'SYNTHETIC TEST ONLY',regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,voidAndPostponementReviewed:true}}))};
  const ids=report.selections.filter(q=>q.marketType==='1x2'&&q.period==='fulltime'&&q.outcome==='1').map(q=>q.quoteId);
  const combinedPrices=kind==='simulation'?[{schema:'lamultipla-accumulator-price-verification-v1',domain:'bet365.it',origin:'manual_bet365_it',kind:'ordinary_accumulator',availability:'available',
    reportSha256:digest(report),quoteIds:ids,price:1.4,verifiedAtUtc:now,reviewer:'SYNTHETIC tester',evidence:'SYNTHETIC TEST ONLY'}]:[];
  const input={report,journal,study,assessment,context:syntheticReviewedContext(manifest,now),combinedPrices,now,provenance:{sourceData:'synthetic_test'}};
  const decision={...createDecision(input),final:false};decision.governance=governance(decision);return {...input,decision};
}
