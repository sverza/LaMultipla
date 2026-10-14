import path from 'node:path';
import {digest,readSnapshot,writeExclusive} from '../prospective/store.mjs';
import {privateLock} from '../private/process-lock.mjs';
import {assertNoDecision,decisionPath} from './pipeline.mjs';
import {governance} from '../decision/governance.mjs';
import {PROGRESSIVE_POLICY,fail,timing} from '../orchestration/progressive-policy.mjs';
export function roundDirectory(root,round){return path.join(root,'.local/orchestrator/rounds',round.season.replace('/','-')+'-round-'+String(round.matchday).padStart(2,'0'));}
export function attemptDirectory(root,plan){return path.join(roundDirectory(root,plan.round),'attempts',plan.progressive.attemptId);}
export async function writeSame(file,value){try{await writeExclusive(file,value);}catch(e){if(e.code!=='EEXIST'||digest(await readSnapshot(file))!==digest(value))throw e;}return file;}
export async function commitFinal(root,snapshot){
  const file=decisionPath(path.join(root,'.local/shadow'),snapshot.round.season,snapshot.round.matchday);
  return privateLock(path.dirname(file),async()=>{
    try{const old=await readSnapshot(file);if(digest(old)!==digest(snapshot))fail('PROGRESSIVE_FINAL_CONFLICT');return file;}
    catch(e){if(e.code!=='ENOENT')throw e;}
    await assertNoDecision(file);await writeExclusive(file,snapshot);return file;
  });
}
// Called by shadow.mjs only. This freezes its own existing selector result.
export async function persistProgressiveDecision(decision,root,plan,{now=new Date()}={}){
  const selected=decision.selector.selected;
  if(selected&&selected.selections.some(s=>Date.parse(decision.opportunities.candidates.find(c=>c.quoteId===s.quoteId).kickoffUtc)
    <=new Date(now).getTime()+PROGRESSIVE_POLICY.analysisLeadMinutes*60000))fail('PROGRESSIVE_PROPOSAL_DEADLINE');
  const snapshot={...decision,final:Boolean(selected)};snapshot.governance=governance(snapshot);
  const file=path.join(attemptDirectory(root,plan),'decision.json');await writeSame(file,snapshot);
  if(snapshot.final)await commitFinal(root,snapshot);
  return {filename:file,decision:snapshot};
}
export async function closeProgressiveRound(root,plan,history,{now=new Date(),sourceData='local_original_artifacts'}={}){
  if(!timing(plan.schedule,now).exhausted)fail('PROGRESSIVE_CLOSURE_TOO_EARLY');
  if(!Array.isArray(history)||history.length>100||history.some(h=>!/^[a-f0-9]{64}$/.test(h.sha256)))fail('PROGRESSIVE_HISTORY_INVALID');
  const snapshot={schema:'lamultipla-app-round-state-v1',id:plan.round.season.replace('/','-')+'-round-'+plan.round.matchday+'-progressive-final',
    round:{season:plan.round.season,matchday:plan.round.matchday},generatedAtUtc:new Date(now).toISOString(),
    status:'no_bet',phase:'NO_BET_FINAL',mode:'experimental',delivery:'private_local',sourceData,final:true,actualStakeEUR:0,nominalStakeEUR:0,
    operational:{decision:'NO_BET',cause:'MODEL_NOT_AUTHORIZED',authorized:false,publicationAllowed:false},
    protocolVersion:PROGRESSIVE_POLICY.version,calendarSha256:digest(plan.schedule),attemptHashes:history.map(h=>h.sha256),
    reasonCodes:['TIME_OPPORTUNITIES_EXHAUSTED',...new Set(history.map(h=>h.state).filter(s=>['EVIDENCE_INSUFFICIENT','TECHNICALLY_INCOMPLETE'].includes(s))),
      ...new Set(history.map(h=>h.reason).filter(s=>typeof s==='string'&&/^[A-Z_]+$/.test(s)))],
    nextWindowAtUtc:null};
  await commitFinal(root,snapshot);return snapshot;
}
