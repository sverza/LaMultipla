import {digest} from '../prospective/store.mjs';
import {createDecision} from '../shadow/pipeline.mjs';
import {governance} from './governance.mjs';
import {GENERAL_POLICY} from './policy.mjs';
export function verifyDecisionBundle({decision,journal,report,study,assessment={}}){
  if(decision?.schema!=='lamultipla-shadow-decision-v1'||!decision.governance||decision.governance.policySha256!==digest(GENERAL_POLICY))
    throw new Error('Current general protocol required; legacy artifacts remain inspectable, never silently migrated');
  if(!/^\d{4}\/\d{2}$/.test(decision.round?.season)||!Number.isInteger(decision.round?.matchday)||decision.round.matchday<1||decision.round.matchday>38)throw new Error('Invalid delivery round');
  for(const [key,value] of Object.entries({journal,report,study,assessment}))
    if(decision[key+'Sha256']!==digest(value))throw new Error(`Decision/${key} mismatch`);
  if(decision.actualStakeEUR!==0||decision.operationallyApproved!==false||decision.noPublication!==true||decision.experimental!==true)
    throw new Error('Operational/publication flags cannot be enabled by editing JSON');
  if(!Number.isFinite(Date.parse(decision.generatedAtUtc)))throw new Error('Invalid decision generation time');
  const inputs={journal,report,study,assessment,context:decision.context,now:decision.generatedAtUtc,maxLegs:decision.selector.maxLegs,
    combinedPrices:decision.selector.combinations.map(c=>c.actualPriceVerification).filter(Boolean),provenance:decision.provenance};
  const rebuilt=createDecision(inputs);
  for(const field of ['id','modelVersion','journalId','round','opportunities','contextGate','selectionGate','selector','decision','noBetCause','policy','policySha256'])
    if(digest(rebuilt[field])!==digest(decision[field]))throw new Error(`Replayed decision mismatch: ${field}`);
  if(digest(governance(decision))!==digest(decision.governance))throw new Error('Governance audit mismatch');
  return {verified:true,method:'exact_local_replay_at_original_clock',decisionSha256:digest(decision),
    sourceData:['synthetic_test','local_original_artifacts'].includes(decision.provenance?.sourceData)?decision.provenance.sourceData:'unspecified',externalTimeAttested:false,
    limitation:'Hash/replay verifies integrity and deterministic computation, not bookmaker/source/human truth or betting validation'};
}
export function privateHandoff(bundle){
  const verification=verifyDecisionBundle(bundle),{decision,journal}=bundle,selected=decision.selector.selected;
  return {schema:'lamultipla-private-decision-handoff-v1',id:decision.id,generatedAtUtc:decision.generatedAtUtc,
    verification,policyVersion:GENERAL_POLICY.version,round:decision.round,operational:decision.governance.operational,
    shadow:decision.governance.shadow,delivery:{privateOnly:true,publicationAllowed:false,appImportSupported:false},
    proposal:selected?{...selected,selections:selected.selections.map(s=>{
      const q=bundle.report.selections.find(q=>q.quoteId===s.quoteId),e=journal.entries.find(e=>e.fixtureId===s.fixtureId);
      return {...s,quote:q,probabilities1X2:e.probabilities,intervals95:e.intervals95,forecastGeneratedAtUtc:e.generatedAtUtc,
        settlementVerification:(bundle.assessment?.assessment?.estimates??bundle.assessment?.estimates)?.find(a=>a.quoteId===s.quoteId)?.settlementVerification};})}:null,
    journalSha256:digest(journal),originalDecision:decision,assessment:bundle.assessment??{},
    actualStakeEUR:0,placement:'not_played',noPublication:true};
}
export function redactedReceipt(bundle){
  const verified=verifyDecisionBundle(bundle),d=bundle.decision;
  // Explicit allowlist: never spread source/assessment/proposal data into a public-facing record.
  return {schema:'lamultipla-public-decision-receipt-v1',available:false,id:d.id,season:d.round.season,matchday:d.round.matchday,
    generatedAtUtc:d.generatedAtUtc,decision:'NO_BET',cause:'MODEL_NOT_AUTHORIZED',shadowDecision:d.governance.shadow.decision,
    shadowCause:d.noBetCause,modelVersion:d.modelVersion,policyVersion:GENERAL_POLICY.version,decisionSha256:verified.decisionSha256,
    status:'experimental_not_authorized',actualStakeEUR:0,publicationAuthorized:false,
    sourceData:verified.sourceData};
}
