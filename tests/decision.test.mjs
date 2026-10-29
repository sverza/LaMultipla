import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sample,catalog,round} from './fixtures/oddspapi.mjs';
import {buildReport} from '../scripts/lib/odds-report.mjs';
import {digest,writeExclusive,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {sealJournal,CONFIG} from '../scripts/lib/prospective/freeze.mjs';
import {verificationTemplate} from '../scripts/lib/availability.mjs';
import {syntheticReviewedContext} from './fixtures/context.mjs';
import {createDecision,persistDecision,assertNoDecision,decisionPath} from '../scripts/lib/shadow/pipeline.mjs';
import {settlementTemplate} from '../scripts/lib/decision/gates.mjs';
import {governance} from '../scripts/lib/decision/governance.mjs';
import {privateHandoff,redactedReceipt,verifyDecisionBundle} from '../scripts/lib/decision/delivery.mjs';
import {obligations,assertFutureRound} from '../scripts/lib/decision/policy.mjs';
import {verifyCompletedDecisionRace} from './fixtures/decision-race-contract.mjs';
// Synthetic fixtures only; these tests are not prospective evidence or betting validation.
const now='2026-10-10T10:15:00Z',observed='2026-10-10T10:14:00Z';
function input(){
  const raw=sample();for(const f of raw)for(const m of Object.values(f.bookmakerOdds['bet365.it'].markets))for(const o of Object.values(m.outcomes))for(const p of Object.values(o.players))p.changedAt=observed;
  const report=buildReport(raw,catalog,{round,observedAt:observed,source:'synthetic_test'});
  const study={schema:'lamultipla-goals-study-v1',synthetic:true,validationCompletedAtUtc:'2026-10-09T23:00:00Z',acceptance:{oneXTwo:{retrospectiveAccepted:true}}};
  const events=report.coverage.map(r=>({fixtureId:r.fixtureId,home:r.fixture[0],away:r.fixture[1],kickoffUtc:r.kickoffUtc,season:round.season,matchday:6}));
  const manifest={season:round.season,matchday:6,events};
  const journal=sealJournal({model:{converged:true,config:CONFIG,cutoffUtc:'2026-10-01T00:00:00Z'},forecasts:events.map(e=>({...e,central:[.65,.2,.15],
    intervals95:[[.6,.7],[.15,.25],[.1,.2]],uncertainty:{replicates:40,failures:0,sufficient:true},baselines:{empirical:[.4,.3,.3],leaguePoisson:[.4,.3,.3]}}))},
  manifest,{studySha256:digest(study),datasetAcquiredAtUtc:'2026-10-09T23:00:00Z'},'2026-10-10T10:13:00Z');
  return {report,journal,study,context:syntheticReviewedContext(manifest,now),now,provenance:{sourceData:'synthetic_test'}};
}
function rules(report,q){return {...settlementTemplate(report,q),rulesUrl:'https://help.bet365.it/synthetic-rules',rulesVersion:'SYNTHETIC TEST',rulesSha256:'a'.repeat(64),
  reviewedAtUtc:now,reviewer:'synthetic tester',evidence:'SYNTHETIC TEST ONLY',regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,voidAndPostponementReviewed:true};}
function assessed(i){return {estimates:i.report.selections.map(q=>({quoteId:q.quoteId,settlementVerification:rules(i.report,q),
  manualVerification:{...verificationTemplate(i.report,q),availability:'available',observedPrice:q.price,verifiedAtUtc:now,reviewer:'synthetic',evidence:'SYNTHETIC'}}))};}
function bundle(i){const decision={...createDecision(i),final:false};decision.governance=governance(decision);return {...i,decision};}

test('one protocol reports all phases and separates shadow from operational authorization',()=>{
  const i=input(),before=digest(i),d=createDecision(i);
  assert.equal(d.opportunities.candidates.length,10);assert.equal(d.selectionGate.eligibleQuoteIds.length,0);
  assert.equal(d.noBetCause,'SELECTION_REVIEW_REQUIRED');assert.equal(d.governance.phases.length,12);
  assert.equal(d.governance.operational.cause,'MODEL_NOT_AUTHORIZED');assert.equal(d.governance.operational.actualStakeEUR,0);
  assert.equal(digest(i),before);assert.equal(d.governance.delivery.publicationAllowed,false);
});
test('rules template is empty and never auto-approves; genuine binding is required for a shadow candidate',()=>{
  const i=input(),template=settlementTemplate(i.report,i.report.selections[0]);assert.equal(template.regulationTimeIncludingStoppage,null);
  i.assessment=assessed(i);const d=createDecision(i);assert.equal(d.selectionGate.eligibleQuoteIds.length,10);
  assert.equal(d.noBetCause,'COMBINATION_EVIDENCE_INSUFFICIENT');assert.equal(d.opportunities.candidates.length,10);
});
test('wrong rules identity, jurisdiction, timestamp, scope or duplicates remain explicitly excluded',()=>{
  for(const mutate of [v=>v.reportSha256='wrong',v=>v.identity.outcome='2',v=>v.domain='bet365.com',v=>v.rulesUrl='https://example.test/rules',
    v=>v.rulesUrl='https://bet365.it.evil.test/rules',v=>v.reviewedAtUtc='2026-10-01T00:00:00Z',v=>v.reviewedAtUtc='2026-10-10T11:00:00Z',
    v=>v.extraTimeExcluded=false,v=>v.rulesSha256='',v=>v.voidAndPostponementReviewed=null]){
    const i=input();i.assessment=assessed(i);mutate(i.assessment.estimates[0].settlementVerification);
    const d=createDecision(i);assert.equal(d.selectionGate.eligibleQuoteIds.length,9);assert.equal(d.opportunities.candidates.length,10);
  }
  const i=input();i.assessment=assessed(i);i.assessment.estimates.push(structuredClone(i.assessment.estimates[0]));
  assert.ok(createDecision(i).opportunities.screening.some(s=>s.reasons.includes('duplicate_or_conflicting_quote')));
  assert.equal(createDecision(i).selectionGate.eligibleQuoteIds.length,9);
});
test('human exclusion and invalid disposition block, without editing the independent forecast or provider flag',()=>{
  const i=input();i.report.selections[0].active=false;i.assessment=assessed(i);const q=i.report.selections[0],hash=digest(i.journal);
  const base={schema:'lamultipla-selection-disposition-v1',domain:'bet365.it',reportSha256:digest(i.report),quoteId:q.quoteId,identity:verificationTemplate(i.report,q).identity,
    action:'exclude',reviewedAtUtc:now,reviewer:'synthetic tester',reason:'SYNTHETIC unresolved lineup'};
  i.assessment.estimates[0].disposition=base;const d=createDecision(i);
  assert.equal(d.opportunities.candidates.length,10);assert.equal(d.selectionGate.eligibleQuoteIds.length,9);assert.equal(d.reportSha256,digest(i.report));
  assert.ok(d.selectionGate.entries[0].reasons.includes('human_exclusion'));assert.equal(digest(i.journal),hash);assert.equal(q.active,false);
  base.reviewedAtUtc='2026-10-10T09:00:00Z';assert.ok(createDecision(i).selectionGate.entries[0].reasons.includes('human_disposition_invalid'));
});
test('private handoff and public receipt replay exact inputs, expose no invented joint forecast or public prices',()=>{
  const i=input();i.assessment=assessed(i);const b=bundle(i),h=privateHandoff(b),receipt=redactedReceipt(b);
  assert.equal(h.proposal,null);assert.equal(h.delivery.appImportSupported,false);assert.equal(h.actualStakeEUR,0);
  assert.equal(receipt.available,false);assert.equal(receipt.cause,'MODEL_NOT_AUTHORIZED');assert.equal(receipt.publicationAuthorized,false);
  for(const name of ['quote','price','probability','probabilities','assessment','context','evidence','expectedValue','odds'])assert.ok(!Object.hasOwn(receipt,name));
  assert.equal(verifyDecisionBundle(b).method,'exact_local_replay_at_original_clock');
  assert.equal(h.verification.sourceData,'synthetic_test');
});
test('a bound-supported shadow proposal is delivered with marginal uncertainty and verified offer, never permission to bet',()=>{
  const i=input();for(const e of i.journal.entries){e.probabilities=[.95,.03,.02];e.central=e.probabilities;e.intervals95=[[.94,.96],[.02,.04],[.01,.03]];
    const {entrySha256,...content}=e;assert.ok(entrySha256);e.entrySha256=digest(content);}
  i.report.selections=i.report.selections.filter(q=>q.fixtureId==='synthetic-0'||q.fixtureId==='synthetic-1');
  for(const q of i.report.selections)if(q.outcome==='1')q.price=1.2;
  i.assessment=assessed(i);
  const ids=i.report.selections.filter(q=>q.outcome==='1'&&q.marketType==='1x2'&&q.period==='fulltime').map(q=>q.quoteId);
  i.combinedPrices=[{schema:'lamultipla-accumulator-price-verification-v1',domain:'bet365.it',origin:'manual_bet365_it',kind:'ordinary_accumulator',
    availability:'available',reportSha256:digest(i.report),quoteIds:ids,price:1.44,verifiedAtUtc:now,reviewer:'synthetic',evidence:'SYNTHETIC TEST ONLY'}];
  const b=bundle(i),h=privateHandoff(b);assert.equal(h.shadow.decision,'MULTIPLA_SIMULATA');assert.equal(h.proposal.actualPrice,1.44);
  assert.equal(h.proposal.selections[0].probabilities1X2[0],.95);assert.equal(h.proposal.jointProbability,null);
  assert.equal(h.proposal.statisticallyValidated,false);assert.equal(h.operational.decision,'NO_BET');assert.equal(h.actualStakeEUR,0);
  assert.equal(redactedReceipt(b).decision,'NO_BET');
});
test('edited authorization, decision logic, input hashes, identity or governance cannot pass replay',()=>{
  const i=input();i.assessment=assessed(i);const base=bundle(i);
  for(const edit of [b=>b.decision.actualStakeEUR=3,b=>b.decision.operationallyApproved=true,b=>b.decision.noPublication=false,
    b=>b.decision.id='forged',b=>b.decision.modelVersion='fake',b=>b.decision.reportSha256='wrong',b=>b.decision.selector.cause='NO_VALUE',
    b=>b.decision.governance.operational.authorized=true,b=>b.report.selections[0].price=20,b=>b.assessment.estimates[0].settlementVerification.extraTimeExcluded=false]){
    const b=structuredClone(base);edit(b);assert.throws(()=>privateHandoff(b));}
  const old=structuredClone(base);delete old.decision.governance;assert.throws(()=>redactedReceipt(old),/legacy/);
});
test('final freeze is one per round across policies and concurrent writers; previews stay separate',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-general-'));try{
    const i=input(),d=createDecision(i),name=decisionPath(dir,round.season,6);await fs.mkdir(path.dirname(name),{recursive:true});
    const old=name.replace('shadow-value-v2','shadow-value-v1');await writeExclusive(old,{legacy:true});
    await assert.rejects(()=>assertNoDecision(name),/already frozen/);await assert.rejects(()=>persistDecision(d,dir));
    await fs.rm(old);const results=await Promise.allSettled([persistDecision(d,dir),persistDecision(d,dir)]);
    const race=await verifyCompletedDecisionRace(results,d,dir),saved=race.saved;
    t.diagnostic(JSON.stringify({initialWinners:race.initialWinners,recoveredAfterQuiescence:race.recoveredAfterQuiescence}));
    assert.equal((await readSnapshot(saved.filename)).governance.phases[10].state,'FROZEN');
    const preview=await persistDecision(d,dir,{preview:true});assert.equal(preview.decision.governance.phases[10].state,'PREVIEW_NOT_FINAL');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('pilot protection permits subsequent rounds and keeps evaluation obligation separate without new trigger',()=>{
  assert.throws(()=>assertFutureRound({season:'2026/27',matchday:6}),/Protected pilot/);assert.doesNotThrow(()=>assertFutureRound({season:'2026/27',matchday:7}));
  const before=obligations('2026-10-14T21:59:59Z'),due=obligations('2026-10-14T22:00:00Z');
  assert.equal(before.items[0].status,'WAITING_UNTIL_15_OCTOBER');assert.equal(due.items[0].status,'DUE_REQUIRES_LOCAL_CHECK');
  assert.equal(due.items[0].completionVerified,false);assert.equal(due.items[0].newTriggerCreated,false);assert.throws(()=>obligations('bad'));
});
test('local review CLI has no API or scheduler and works without an API key',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-review-cli-'));try{
    await fs.cp(new URL('../scripts',import.meta.url),path.join(dir,'scripts'),{recursive:true});
    await fs.cp(new URL('../shared',import.meta.url),path.join(dir,'shared'),{recursive:true});
    const run=spawnSync(process.execPath,[path.join(dir,'scripts/decision.mjs'),'--obligations'],{encoding:'utf8',env:{...process.env,ODDSPAPI_API_KEY:''}});
    assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).items[0].newTriggerCreated,false);
    const i=input();i.assessment=assessed(i);const b=bundle(i);
    for(const k of ['decision','journal'])await writeExclusive(path.join(dir,k+'.json'),b[k]);
    for(const k of ['report','study','assessment'])await fs.writeFile(path.join(dir,k+'.json'),JSON.stringify(b[k]));
    const args=['--receipt',...['decision','journal','report','study','assessment'].flatMap(k=>['--'+k,path.join(dir,k+'.json')])];
    const receipt=spawnSync(process.execPath,[path.join(dir,'scripts/decision.mjs'),...args],{encoding:'utf8'});assert.equal(receipt.status,0,receipt.stderr);
    assert.ok(!((await fs.readdir(dir)).includes('public')));const files=await fs.readdir(path.join(dir,'.local/decisions/receipts'));
    assert.equal(files.length,1);assert.equal((await readSnapshot(path.join(dir,'.local/decisions/receipts',files[0]))).actualStakeEUR,0);
    const repeat=spawnSync(process.execPath,[path.join(dir,'scripts/decision.mjs'),...args],{encoding:'utf8'});assert.equal(repeat.status,1);assert.match(repeat.stderr,/nessuna sovrascrittura/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
