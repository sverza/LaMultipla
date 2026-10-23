import {digest} from '../prospective/store.mjs';
import {GENERAL_POLICY} from './policy.mjs';
export function governance(decision){
  const ops=decision.opportunities,gate=decision.selectionGate,selected=decision.selector.selected;
  const reasons=[...new Set([decision.noBetCause,...(ops.globalIssues??[]),...Object.keys(gate?.reasonCounts??{})].filter(Boolean))];
  const shadow={decision:selected?'MULTIPLA_SIMULATA':'NO_BET',cause:selected?null:decision.noBetCause,
    counts:{...ops.counts,contextReady:decision.contextGate?.contextReadyCandidates??0,selectionReady:gate?.eligibleQuoteIds.length??0},reasons};
  const blockers=['MODEL_NOT_AUTHORIZED','JOINT_MODEL_NOT_VALIDATED','PUBLICATION_NOT_AUTHORIZED','QUOTE_PUBLICATION_RIGHTS_UNRESOLVED'];
  return {schema:'lamultipla-decision-governance-v1',policy:GENERAL_POLICY,policySha256:digest(GENERAL_POLICY),shadow,
    operational:{decision:'NO_BET',cause:'MODEL_NOT_AUTHORIZED',blockers,actualStakeEUR:0,authorized:false},
    delivery:{state:'PRIVATE_ONLY',publicationAllowed:false,legacyFeedCompatible:false},
    phases:[
      {step:1,state:'RECORDED',evidence:'journal manifest; official source verification remains a human responsibility'},
      {step:2,state:'RECORDED',evidence:'journal dataset hash and acquisition/cutoff provenance'},
      {step:3,state:'RECORDED',evidence:decision.journalSha256},
      {step:4,state:ops.counts.insufficient?'PARTIAL':'RECORDED',evidence:decision.reportSha256},
      {step:5,state:'RECORDED',evidence:{counts:ops.counts,completeBoards:ops.baselines.filter(b=>b.status==='COMPLETE').length}},
      {step:6,state:decision.contextGate?.eligibleFixtureIds.length?'PARTIAL_OR_READY':'HUMAN_REVIEW_REQUIRED',evidence:decision.contextGate?.contextSha256??null},
      {step:7,state:decision.contextGate?.contextReadyCandidates?'READY_FOR_SOME_CANDIDATES':'NOT_READY',evidence:'No numerical context adjustment'},
      {step:8,state:gate?.eligibleQuoteIds.length?'READY_FOR_SOME_CANDIDATES':ops.candidates.length?'HUMAN_REVIEW_REQUIRED':'NOT_APPLICABLE',evidence:gate?.reasonCounts??null},
      {step:9,state:selected?'SHADOW_BOUNDS_ONLY':'NOT_DEMONSTRATED',evidence:{jointModelValidated:false,combinations:decision.selector.counts.combinations}},
      {step:10,state:'NO_BET_OPERATIONAL',evidence:{shadow:shadow.decision,cause:shadow.cause,blockers}},
      {step:11,state:decision.final?'FROZEN':'PREVIEW_NOT_FINAL',evidence:'Exclusive envelope; local hash is not external timestamp attestation'},
      {step:12,state:'WAITING_RESULTS',evidence:'Separate prospective evaluation, immutable forecast inputs'}],
    limitations:['All models remain experimental for betting','Marginal uncertainty is not a joint confidence interval',
      'Human attestations bind recorded claims; software cannot independently certify that the rules or prices were actually inspected']};
}
