import {evaluateJournal} from '../prospective/evaluate.mjs';
import {metrics} from '../goals/metrics.mjs';
import {fingerprint} from '../odds-report.mjs';

export function evaluateShadow(decision,journal,results,{now=new Date(),markets=[]}={}) {
  if(decision?.schema!=='lamultipla-shadow-decision-v1'||decision.journalSha256!==fingerprint(journal))throw new Error('Decision/journal mismatch');
  const frozenBoards=decision.opportunities.baselines.filter(b=>b.status==='COMPLETE'&&b.manualPlayabilityVerified&&(b.compatible===true||(b.compatible==null&&decision.policy?.version==='shadow-value-v1'))).map(b=>({
    fixtureId:b.fixtureId,journalId:journal.id,entrySha256:journal.entries.find(e=>e.fixtureId===b.fixtureId)?.entrySha256,
    bookmaker:'bet365.it',compatible:true,probabilities:b.probabilities,capturedAtUtc:b.capturedAtUtc??decision.generatedAtUtc,origin:'verified_decision_board'}));
  const compatible=[...markets,...frozenBoards].filter(m=>m.bookmaker==='bet365.it'&&m.compatible===true&&m.journalId===journal.id);
  compatible.sort((a,b)=>{const generated=journal.entries.find(e=>e.fixtureId===a.fixtureId)?.generatedAtUtc;
    if(a.fixtureId!==b.fixtureId)return a.fixtureId.localeCompare(b.fixtureId);
    return Math.abs(Date.parse(a.capturedAtUtc)-Date.parse(generated))-Math.abs(Date.parse(b.capturedAtUtc)-Date.parse(generated))||fingerprint(a).localeCompare(fingerprint(b));});
  const evaluation=evaluateJournal(journal,results,{evaluatedAtUtc:new Date(now).toISOString(),markets:compatible});
  const ids=new Set(decision.opportunities.candidates.map(c=>c.fixtureId));
  const candidateRecords=evaluation.records.filter(r=>ids.has(r.fixtureId));
  const contextualIds=decision.contextGate?new Set(decision.opportunities.candidates.filter(c=>decision.contextGate.eligibleQuoteIds.includes(c.quoteId)).map(c=>c.fixtureId)):ids;
  const contextualRecords=evaluation.records.filter(r=>contextualIds.has(r.fixtureId));
  const selectionIds=decision.selectionGate?new Set(decision.opportunities.candidates.filter(c=>decision.selectionGate.eligibleQuoteIds.includes(c.quoteId)).map(c=>c.fixtureId)):null;
  const selectionRecords=selectionIds?evaluation.records.filter(r=>selectionIds.has(r.fixtureId)):null;
  const proposal=decision.selector.selected;let simulated=null;
  if(proposal) {
    const settled=proposal.selections.map(s=>evaluation.records.find(r=>r.fixtureId===s.fixtureId));
    if(settled.every(Boolean)) {
      const won=settled.every((r,i)=>r.outcome===proposal.selections[i].outcome);
      simulated={won,nominalStakeEUR:proposal.nominalStakeEUR,actualStakeEUR:0,verifiedPrice:proposal.actualPrice,
        netEUR:won?proposal.nominalStakeEUR*(proposal.actualPrice-1):-proposal.nominalStakeEUR,
        type:'SIMULATED_RETURN_ONLY',jointLogLoss:null,limitation:'Assumes standard fulltime settlement; void/resettlement needs explicit evidence'};
    }
  }
  return {schema:'lamultipla-shadow-evaluation-v1',decisionSha256:fingerprint(decision),evaluatedAtUtc:new Date(now).toISOString(),
    resultsSha256:fingerprint(results),marketBaselinePolicy:'verified_complete_board_closest_to_forecast_time',forecastEvaluation:evaluation,candidateMetrics:metrics(candidateRecords,'oneXTwo'),
    candidatesSettled:candidateRecords.length,contextReadyCandidateMetrics:metrics(contextualRecords,'oneXTwo'),contextReadyCandidatesSettled:contextualRecords.length,
    contextSha256:decision.contextGate?.contextSha256??null,selectionReadyCandidateMetrics:selectionRecords?metrics(selectionRecords,'oneXTwo'):null,
    selectionReadyCandidatesSettled:selectionRecords?.length??null,simulation:simulated,actualStakeEUR:0,operationallyApproved:false};
}

export function shadowProgress(decisions,evaluations,now=new Date()) {
  const rounds=[],conflicts=[],groups=new Map();let nominalNetEUR=0,nominalStakeEUR=0;
  for(const decision of [...decisions].filter(d=>d.final).sort((a,b)=>a.generatedAtUtc.localeCompare(b.generatedAtUtc))) {
    const versions=evaluations.filter(e=>e.decisionSha256===fingerprint(decision)).sort((a,b)=>a.evaluatedAtUtc.localeCompare(b.evaluatedAtUtc));
    const signatures=new Map();for(const ev of versions)for(const r of ev.forecastEvaluation.records){const prior=signatures.get(r.fixtureId);
      if(prior&&prior!==fingerprint(r.goals))conflicts.push({decisionId:decision.id,fixtureId:r.fixtureId,reason:'result_revision_requires_review'});else signatures.set(r.fixtureId,fingerprint(r.goals));}
    const latest=versions.at(-1);
    if(latest)for(const fixtureId of signatures.keys())if(!latest.forecastEvaluation.records.some(r=>r.fixtureId===fixtureId))conflicts.push({decisionId:decision.id,fixtureId,reason:'result_removed_requires_review'});
    const blocked=conflicts.some(c=>c.decisionId===decision.id),simulation=blocked?null:latest?.simulation??null;
    if(simulation){nominalNetEUR+=simulation.netEUR;nominalStakeEUR+=simulation.nominalStakeEUR;}
    const key=`${decision.policy.version}:${decision.modelVersion}`+(decision.contextPolicyVersion?':'+decision.contextPolicyVersion:'')+(decision.governance?.policy?.version?':'+decision.governance.policy.version:''),group=groups.get(key)||{records:[],candidates:[],contextReadyCandidates:[],marketPairs:[],seen:new Set()};
    if(!blocked&&latest){const candidates=new Set(decision.opportunities.candidates.map(c=>c.fixtureId));
      for(const r of latest.forecastEvaluation.records){const id=decision.journalId+':'+r.fixtureId;if(group.seen.has(id))throw new Error('Duplicate shadow forecast in same version');
        group.seen.add(id);group.records.push(r);if(candidates.has(r.fixtureId))group.candidates.push(r);
        if(decision.contextGate?.eligibleFixtureIds.includes(r.fixtureId)&&candidates.has(r.fixtureId))group.contextReadyCandidates.push(r);}
      group.marketPairs.push(...latest.forecastEvaluation.marketPairs);}
    groups.set(key,group);
    rounds.push({id:decision.id,decision:decision.decision,cause:decision.noBetCause,candidates:decision.opportunities.counts.candidates,
      forecastMetrics:blocked?null:latest?.forecastEvaluation.metrics??null,candidateMetrics:blocked?null:latest?.candidateMetrics??null,
      cumulativeModelMetrics:metrics(group.records,'oneXTwo'),cumulativeCandidateMetrics:metrics(group.candidates,'oneXTwo'),
      contextPolicyVersion:decision.contextPolicyVersion??null,cumulativeContextReadyCandidateMetrics:metrics(group.contextReadyCandidates,'oneXTwo'),
      cumulativeMarketComparison:{n:group.marketPairs.length,model:metrics(group.marketPairs,'oneXTwo'),market:metrics(group.marketPairs,'oneXTwo','market')},simulation,resultConflict:blocked});
  }
  return {schema:'lamultipla-shadow-progress-v1',generatedAtUtc:new Date(now).toISOString(),rounds,conflicts,
    versions:Object.fromEntries([...groups].map(([key,g])=>[key,{model:metrics(g.records,'oneXTwo'),candidates:metrics(g.candidates,'oneXTwo'),
      contextReadyCandidates:metrics(g.contextReadyCandidates,'oneXTwo'),
      marketComparison:{n:g.marketPairs.length,model:metrics(g.marketPairs,'oneXTwo'),market:metrics(g.marketPairs,'oneXTwo','market')}}])),
    nominalNetEUR,nominalStakeEUR,simulatedROI:nominalStakeEUR?nominalNetEUR/nominalStakeEUR:null,
    actualStakeEUR:0,actualProfitEUR:0,operationallyApproved:false,notEvidenceOfPredictiveOrBettingProfitability:true};
}
