import {canonicalTeam} from '../goals/data.mjs';
import {CONTEXT_POLICY} from './policy.mjs';
export function recentForm(rows,team,{atUtc,role=null}={}){
  team=canonicalTeam(team);const end=Date.parse(atUtc);if(!Number.isFinite(end)||role&&!['home','away'].includes(role))throw new Error('Invalid form cutoff/role');
  const eligible=rows.filter(r=>Date.parse(r.availableAtUtc)<end&&Date.parse(r.date)<end&&Date.parse(r.date)>=end-CONTEXT_POLICY.formMaxAgeDays*86400000
    &&(role==='home'?r.home===team:role==='away'?r.away===team:r.home===team||r.away===team)).sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
  const record=r=>{const home=r.home===team,[gf,ga]=home?r.goals:[...r.goals].reverse();return {key:r.key,date:r.date,availableAtUtc:r.availableAtUtc,
    competition:'ITA_SERIE_A',opponent:home?r.away:r.home,role:home?'home':'away',goalsFor:gf,goalsAgainst:ga,outcome:gf>ga?'W':gf===ga?'D':'L',points:gf>ga?3:gf===ga?1:0};};
  const windows=role?[CONTEXT_POLICY.splitWindow]:CONTEXT_POLICY.formWindows;
  return {team,scope:'SERIE_A_ONLY',role,atUtc,windows:Object.fromEntries(windows.map(n=>{const matches=eligible.slice(0,n).map(record),size=matches.length;
    return [n,{requested:n,n:size,sufficient:size>=CONTEXT_POLICY.minFormMatches,matches,points:matches.reduce((s,r)=>s+r.points,0),
      pointsPerMatch:size?matches.reduce((s,r)=>s+r.points,0)/size:null,goalsFor:matches.reduce((s,r)=>s+r.goalsFor,0),goalsAgainst:matches.reduce((s,r)=>s+r.goalsAgainst,0),
      maxResultAvailableAtUtc:matches.map(r=>r.availableAtUtc).sort().at(-1)??null}];})),
    lastSerieAMatchDate:eligible[0]?.date??null,daysSinceLastSerieADate:eligible[0]?(end-Date.parse(eligible[0].date))/86400000:null,
    kickoffGapHours:null,actualRestHours:null,limitation:'Date-only league history, not all competitions or actual rest; descriptive, not a validated probability feature'};
}
