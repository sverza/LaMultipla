import {digest} from '../prospective/store.mjs';
import {quoteIdentity} from '../availability.mjs';
import {verifyDecisionBundle} from './delivery.mjs';
import {assertFutureRound} from './policy.mjs';
import {validateDecisionV4} from '../../../shared/decision-v4.mjs';
import {PROGRESSIVE_POLICY} from '../orchestration/progressive-policy.mjs';
export function appPackage(bundle){
  assertFutureRound(bundle.decision?.round);
  const verification=verifyDecisionBundle(bundle),{decision:d,journal:j,report,assessment={}}=bundle,c=d.selector.selected;
  const estimates=assessment.assessment?.estimates??assessment.estimates??[];
  const p={schema:'lamultipla-app-decision-v4',id:d.id,round:d.round,generatedAtUtc:d.generatedAtUtc,status:c?'simulation':'no_bet',mode:'experimental',
    sourceData:verification.sourceData,delivery:'private_local',actualStakeEUR:0,nominalStakeEUR:c?3:0,final:d.final===true,
    operational:{decision:'NO_BET',cause:'MODEL_NOT_AUTHORIZED',authorized:false,publicationAllowed:false},
    source:{decisionSha256:digest(d),journalSha256:digest(j),reportSha256:digest(report),studySha256:d.studySha256,assessmentSha256:d.assessmentSha256,generalProtocolVersion:d.governance.policy.version},
    model:{version:j.modelVersion,status:'experimental_not_operational',codeSha256:j.modelCodeCanonicalSha256,datasetSha256:j.provenance.datasetSha256,
      protocolSha256:j.protocolCanonicalSha256,trainingCutoffUtc:j.trainingCutoffUtc,forecastGeneratedAtUtc:j.generatedAtUtc},
    selections:c?c.selections.map(s=>{
      const q=report.selections.find(q=>q.quoteId===s.quoteId),entry=j.entries.find(e=>e.fixtureId===s.fixtureId),screen=d.opportunities.candidates.find(x=>x.quoteId===s.quoteId),rules=estimates.find(e=>e.quoteId===s.quoteId).settlementVerification;
      const v=screen.availability.verification;
      return {quoteId:q.quoteId,identity:quoteIdentity(q),price:q.price,observedAtUtc:q.observedAtUtc,changedAtUtc:q.changedAt??null,
        provider:{active:q.active,marketActive:q.marketActive,bookmakerIsActive:q.bookmakerIsActive,suspended:q.suspended},
        verification:{state:screen.availability.state,domain:v.domain,origin:v.origin,verifiedAtUtc:v.verifiedAtUtc,verificationSha256:digest(v),observedPrice:v.observedPrice},
        settlement:{verificationSha256:digest(rules),reviewedAtUtc:rules.reviewedAtUtc,rulesUrl:rules.rulesUrl},
        forecast:{entrySha256:entry.entrySha256,probabilities1X2:entry.probabilities,intervals95:entry.intervals95,probability:screen.value.probability,interval95:screen.value.interval},
        value:{pointEV:screen.value.pointEV,lowerEV:screen.value.lowerEV,upperEV:screen.value.upperEV},reasonCodes:['robust_shadow_value','context_reviewed','settlement_verified','price_manually_verified']};
    }):[],
    combined:c?{observedPrice:c.actualPrice,verifiedAtUtc:c.actualPriceVerification.verifiedAtUtc,verificationSha256:digest(c.actualPriceVerification),
      diagnosticOddsProduct:c.nominalOddsProduct,jointProbability:null,jointConfidenceInterval:null,jointProbabilityBounds:c.jointProbabilityBounds,
      jointSensitivityEnvelope:c.jointSensitivityEnvelope,expectedNetPerUnitBounds:c.expectedNetPerUnitBounds,dependenceMethod:c.dependenceMethod,statisticallyValidated:false}:null,
    shadowCause:d.noBetCause,reasonCodes:[...d.governance.shadow.reasons],counts:d.governance.shadow.counts,
    exclusions:{...Object.fromEntries([...new Set(d.opportunities.screening.flatMap(s=>s.reasons))].map(reason=>[reason,d.opportunities.screening.filter(s=>s.reasons.includes(reason)).length])),...d.selectionGate.reasonCounts},
    phases:d.governance.phases.map(s=>({step:s.step,state:s.state}))};
  if(d.progressive){
    p.source.generalProtocolVersion=PROGRESSIVE_POLICY.version;
    p.reasonCodes.push(c?'proposta_shadow_definitiva':'no_bet_provvisorio','ricontrollare_prezzi_prima_di_ogni_eventuale_giocata');
  }
  // Presentation must own nested values too: UI edits cannot change the source.
  return structuredClone(validateDecisionV4(p));
}
