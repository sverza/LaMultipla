import { probabilityVector } from './freeze.mjs';
import { canonicalTeam } from '../goals/data.mjs';

export function normalizeBoard(board,entry,journalId,observedClockUtc,maxLagMinutes=30) {
  const clock=Date.parse(observedClockUtc);
  if (!Number.isFinite(clock) || !Number.isFinite(maxLagMinutes) || maxLagMinutes<=0 || !board || board.fixtureId!==entry.fixtureId || canonicalTeam(board.home)!==entry.home||canonicalTeam(board.away)!==entry.away
    || board.domain!=='bet365.it' || board.origin!=='manual_bet365_it' || board.period!=='fulltime'
    || board.marketName!=='Full Time Result' || board.marketType!=='1x2' || board.line!==0 || ![null,'0'].includes(board.playerKey??null)
    || board.playerProp===true || board.playerName!=null
    || typeof board.reviewer!=='string'||!board.reviewer.trim()||typeof board.evidence!=='string'||!board.evidence.trim()
    || entry.status!=='prospective' || !Array.isArray(board.selections)||board.selections.length!==3) throw new Error('Complete verified Italian fulltime 1X2 board required');
  const prices=[],times=[];
  for (const outcome of ['1','X','2']) {
    const matching=board.selections.filter(s=>s.outcome===outcome);
    if (matching.length!==1)throw new Error('Missing or duplicate outcome');
    const s=matching[0],time=Date.parse(s.verifiedAtUtc);
    if (s.availability!=='available' || !Number.isFinite(s.price)||s.price<=1 || !Number.isFinite(time)
      || time>clock || clock-time>30*60000 || time>=Date.parse(entry.kickoffUtc))throw new Error('Unavailable/unverified/expired quote');
    prices.push(s.price);times.push(time);
  }
  if (Math.max(...times)-Math.min(...times)>5*60000)throw new Error('Board timestamps not contemporaneous');
  const inverse=prices.map(o=>1/o),sum=inverse.reduce((a,b)=>a+b,0),probabilities=inverse.map(v=>v/sum);
  if (!probabilityVector(probabilities))throw new Error('Invalid market normalization');
  return {schema:'lamultipla-market-baseline-v1',journalId,entrySha256:entry.entrySha256,fixtureId:entry.fixtureId,
    capturedAtUtc:observedClockUtc,bookmaker:'bet365.it',board,
    method:'multiplicative_inverse_odds_normalization',prices,overround:sum-1,probabilities,
    maxLagMinutes,compatible:times.every(t=>Math.abs(t-Date.parse(entry.generatedAtUtc))<=maxLagMinutes*60000),
    originalProviderFlagsPreserved:board.selections.map(s=>s.providerFlags??null),
    limitation:'Proportional margin removal, not proof of true probabilities or profitability'};
}
