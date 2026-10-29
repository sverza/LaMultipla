export const GENERAL_POLICY=Object.freeze({version:'analysis-decision-v1',registeredAtUtc:'2026-10-10T21:40:00Z',
  protocolPath:'docs/protocollo-generale-v1.md',maxSettlementAgeDays:7,operationallyApproved:false,publicationAllowed:false,
  protectedPilot:{season:'2026/27',matchday:6,id:'2026-27-round-06-goals-v1-b630b78',
    journalSha256:'6500cb65e321568c033bfec90e90fee97b43b6fb489f07e9daf4b15adc3a9070',evaluationFromUtc:'2026-10-14T22:00:00Z'}});
export function assertFutureRound(round){
  if(round?.season===GENERAL_POLICY.protectedPilot.season&&round?.matchday===GENERAL_POLICY.protectedPilot.matchday)
    throw new Error('Protected pilot round: inspect/evaluate/progress only; no new analysis or quote acquisition');
}
export function obligations(now=new Date()){
  const at=new Date(now);if(!Number.isFinite(at.getTime()))throw new Error('Invalid obligations clock');
  return {schema:'lamultipla-analysis-obligations-v1',generatedAtUtc:at.toISOString(),items:[{
    ...GENERAL_POLICY.protectedPilot,action:'Evaluate the original frozen journal and compatible baseline with verified final results',
    baselineSha256:'199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990',
    status:at.getTime()>=Date.parse(GENERAL_POLICY.protectedPilot.evaluationFromUtc)?'DUE_REQUIRES_LOCAL_CHECK':'WAITING_UNTIL_15_OCTOBER',
    completionVerified:false,execution:'manual_separate_workflow',newTriggerCreated:false}],
    limitation:'No access to Windows private artifacts here; completion must be verified locally. This is not an active reminder.'};
}
