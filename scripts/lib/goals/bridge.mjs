import {canonicalTeam} from './data.mjs';
// Mapping only: never turns an experimental forecast into a validated assessment.
export function quoteProbabilities(forecast,q){
  const p=forecast?.central?.probabilities,fit=forecast?.model;
  if(!p||!fit?.converged||q.period!=='fulltime'||q.playerProp||(q.playerKey && q.playerKey !== '0')
    ||canonicalTeam(q.fixture?.[0])!==forecast.central.home||canonicalTeam(q.fixture?.[1])!==forecast.central.away
    ||!Number.isFinite(Date.parse(q.kickoffUtc))||Date.parse(fit.cutoffUtc)>=Date.parse(q.kickoffUtc))return null;
  let win;
  if(q.marketType==='1x2'&&[0,null].includes(q.line??null)&&['1','X','2'].includes(q.outcome))win=p.oneXTwo[['1','X','2'].indexOf(q.outcome)];
  else if(q.marketType==='bothteamsscore'&&['Yes','No'].includes(q.outcome))win=q.outcome==='Yes'?p.btts:1-p.btts;
  else if(q.marketType==='totals'&&q.line===2.5&&forecast.central.line===2.5&&['Over','Under'].includes(q.outcome))win=q.outcome==='Over'?p.over:p.under;
  if(!Number.isFinite(win))return null;
  return {win,halfWin:0,push:0,halfLoss:0,loss:1-win};
}
