export const ROUND_STATE_SCHEMA='lamultipla-app-round-state-v1';
export const ROUND_PHASES=Object.freeze(['WAITING_WINDOW','ANALYSIS_IN_PROGRESS','NO_BET_PROVISIONAL','EVIDENCE_INSUFFICIENT','TECHNICALLY_INCOMPLETE','NO_BET_FINAL']);
export const roundPhaseLabels=Object.freeze({WAITING_WINDOW:'In attesa della prossima finestra',ANALYSIS_IN_PROGRESS:'Analisi in corso',
  NO_BET_PROVISIONAL:'NO BET provvisorio',EVIDENCE_INSUFFICIENT:'Evidenze insufficienti',TECHNICALLY_INCOMPLETE:'Analisi tecnicamente incompleta',NO_BET_FINAL:'NO BET definitivo'});
export function validateRoundState(p){
  const bad=()=>{throw new Error('Stato giornata sperimentale non valido');};
  const keys=['schema','id','round','generatedAtUtc','status','phase','mode','delivery','sourceData','final','actualStakeEUR','nominalStakeEUR','operational',
    'protocolVersion','calendarSha256','attemptHashes','reasonCodes','nextWindowAtUtc'];
  const at=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  if(!p||Object.keys(p).sort().join(',')!==keys.sort().join(',')||p.schema!==ROUND_STATE_SCHEMA
    ||typeof p.id!=='string'||!p.id.length||p.id.length>200||!at(p.generatedAtUtc)||p.status!=='no_bet'||!ROUND_PHASES.includes(p.phase)
    ||p.mode!=='experimental'||p.delivery!=='private_local'||p.protocolVersion!=='analysis-progressive-v1'||p.actualStakeEUR!==0||p.nominalStakeEUR!==0
    ||p.final!==(p.phase==='NO_BET_FINAL')||!['synthetic_test','local_original_artifacts'].includes(p.sourceData)
    ||p.sourceData!=='synthetic_test'&&Date.parse(p.generatedAtUtc)>Date.now()
    ||!p.round||Object.keys(p.round).sort().join(',')!=='matchday,season'||!/^\d{4}\/\d{2}$/.test(p.round.season)
    ||!Number.isInteger(p.round.matchday)||p.round.matchday<1||p.round.matchday>38
    ||p.round.season==='2026/27'&&p.round.matchday<=6
    ||!p.operational||Object.keys(p.operational).sort().join(',')!=='authorized,cause,decision,publicationAllowed'
    ||p.operational.decision!=='NO_BET'||p.operational.cause!=='MODEL_NOT_AUTHORIZED'||p.operational.authorized!==false||p.operational.publicationAllowed!==false
    ||!hash(p.calendarSha256)||!Array.isArray(p.attemptHashes)||p.attemptHashes.length>100||!p.attemptHashes.every(hash)
    ||new Set(p.attemptHashes).size!==p.attemptHashes.length||!Array.isArray(p.reasonCodes)||!p.reasonCodes.length
    ||p.reasonCodes.some(c=>typeof c!=='string'||!/^[A-Za-z0-9_]+$/.test(c))
    ||p.nextWindowAtUtc!==null&&(!at(p.nextWindowAtUtc)||Date.parse(p.nextWindowAtUtc)<Date.parse(p.generatedAtUtc))
    ||p.final&&p.nextWindowAtUtc!==null)bad();
  return p;
}
