import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateLock} from '../private/process-lock.mjs';
import {writeExclusive,verifyEnvelope} from '../prospective/store.mjs';
import {hashValue,hashBytes,timestamp,exactFields} from './contracts.mjs';
import {PROTOTYPE_POLICY,PROTOTYPE_POLICY_SHA256,assertPrototypePolicy} from './prototype-policy.mjs';
import {discoverPrototype,checkPrototypeTicket,summarizePrototype,prototypeSafety} from './prototype-analysis.mjs';

const folder='mm-simulator-synthetic-v1';
const codeFiles=['prototype-policy.mjs','prototype-analysis.mjs','prototype-store.mjs','composition.mjs','composition-gates.mjs','contracts.mjs','probabilities.mjs',
 '../private/process-lock.mjs','../prospective/store.mjs','../orchestration/progressive-policy.mjs','../context/dossier.mjs','../context/evidence.mjs','../context/policy.mjs',
 '../shadow/combinations.mjs','../shadow/policy.mjs','../decision/policy.mjs','../goals/data.mjs','../goals/metrics.mjs','../engine/forecast.mjs','../engine/markets.mjs','../engine/study.mjs'];
const fail=c=>{throw Error(c);},same=(a,b)=>hashValue(a)===hashValue(b);
const fields=(value,keys)=>exactFields(value,[...keys,...Object.keys(prototypeSafety())])&&Object.entries(prototypeSafety()).every(([k,v])=>value[k]===v);
async function safeDirectory(root,authorityId,{create=true}={}){
 let directory=path.resolve(root);if(await fs.realpath(directory)!==directory)fail('MM3B_UNSAFE_NAMESPACE');
 for(const name of ['.local',folder,authorityId]){
  directory=path.join(directory,name);if(create)try{await fs.mkdir(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  let stat;try{stat=await fs.lstat(directory);}catch(e){if(!create&&e.code==='ENOENT')return null;throw e;}
  if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(directory)!==directory)fail('MM3B_UNSAFE_NAMESPACE');
 }
 return directory;
}
async function codeIdentity(){
 const base=path.dirname(fileURLToPath(import.meta.url));return hashValue(await Promise.all(codeFiles.map(async file=>({file,sha256:hashBytes(await fs.readFile(path.resolve(base,file)))}))));
}
export function prototypeAuthorityPath(root,input){
 const manifest=input?.data?.journal?.manifest;
 if(!/^\d{4}\/\d{2}$/.test(manifest?.season??'')||!Number.isInteger(manifest?.matchday))fail('MM3B_SCOPE_INVALID');
 const authorityId=hashValue({season:manifest.season,round:manifest.matchday,policy:PROTOTYPE_POLICY.id});
 return {authorityId,directory:path.resolve(root,'.local',folder,authorityId)};
}
async function readFile(directory,name){
 const file=path.join(directory,name);
 try{
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())fail('MM3B_ARTIFACT_NOT_REGULAR');
  const bytes=await fs.readFile(file);let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{fail('MM3B_ARTIFACT_TRUNCATED_OR_INVALID');}
  const payload=verifyEnvelope(value);return {payload,ref:{file:name,bytesSha256:hashBytes(bytes),payloadSha256:hashValue(payload)}};
 }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function requireFile(directory,name){const r=await readFile(directory,name);if(!r)fail('MM3B_REQUIRED_ARTIFACT_MISSING:'+name);return r;}
async function referenced(directory,reference){
 if(!reference||path.basename(reference.file)!==reference.file)fail('MM3B_REFERENCE_INVALID');
 const r=await requireFile(directory,reference.file);if(!same(r.ref,reference))fail('MM3B_ARTIFACT_REFERENCE_MISMATCH');return r;
}
async function inspectNames(directory){
 const names=await fs.readdir(directory);
 const known=/^(policy|intent|input|preview|prepared|decision|commit-proof|receipt|review-(?:0[1-9]|10)-(?:claim|result))\.json$/;
 const temporary=/^(.+\.json)\.[a-f0-9-]{36}\.tmp$/;
 for(const n of names){if(n==='locks')continue;const t=n.match(temporary);if(!known.test(n)&&!(t&&known.test(t[1])))fail('MM3B_UNRECOGNIZED_ARTIFACT');}
}
async function reviewLayout(directory,count){
 const names=new Set(await fs.readdir(directory));
 for(const name of names){const m=name.match(/^review-(\d+)-(claim|result)\.json$/);if(!m)continue;
  const n=Number(m[1]),slot=String(n).padStart(2,'0');
  if(n>count||n<1||m[2]==='result'&&!names.has(`review-${slot}-claim.json`)
   ||n>1&&!names.has(`review-${String(n-1).padStart(2,'0')}-result.json`))fail('MM3B_REVIEW_LAYOUT_INVALID');
 }
}
function fixedIntent(intent,{authorityId,inputSha256,codeSha256,policyRef,input}){
 if(!fields(intent,['schema','authorityId','inputSha256','policySha256','codeSha256','policyRef','simulationStartedAtUtc','recordedAtRealUtc'])
  ||!timestamp(intent.recordedAtRealUtc)||intent.schema!=='lamultipla-mm-synthetic-intent-v1'||intent.authorityId!==authorityId||intent.inputSha256!==inputSha256
  ||intent.codeSha256!==codeSha256||intent.policySha256!==PROTOTYPE_POLICY_SHA256||!same(intent.policyRef,policyRef)
  ||intent.simulationStartedAtUtc!==input.data.atUtc||intent.synthetic!==true)fail('MM3B_INPUT_POLICY_OR_CODE_CONFLICT');
}
function expectedPreview(input,analysis){return {schema:'lamultipla-mm-synthetic-preview-v1',inputSha256:hashValue(input),
 atSimulationUtc:input.data.atUtc,discoverySha256:analysis.discovery.canonicalSha256,
 orderedTicketCandidates:analysis.candidates.map(c=>c.id),...prototypeSafety()};}
async function verifyPrepared(directory,input,context){
 const prepared=await requireFile(directory,'prepared.json'),p=prepared.payload;
 if(!fields(p,['schema','authorityId','inputSha256','policySha256','codeSha256','intentRef','inputRef','previewRef','reviews','atSimulationUtc','decisionSha256','decision'])
  ||p.intentRef?.file!=='intent.json'||p.inputRef?.file!=='input.json'||p.previewRef?.file!=='preview.json'
  ||p.schema!=='lamultipla-mm-synthetic-prepared-v1'||p.inputSha256!==hashValue(input)||p.codeSha256!==context.codeSha256
  ||p.policySha256!==PROTOTYPE_POLICY_SHA256||p.authorityId!==context.authorityId||!timestamp(p.atSimulationUtc))fail('MM3B_PREPARED_BINDING_INVALID');
 await referenced(directory,p.intentRef);await referenced(directory,p.inputRef);const preview=await referenced(directory,p.previewRef);
 const initial=discoverPrototype(input,input.data.atUtc);
 await reviewLayout(directory,Math.min(initial.candidates.length,PROTOTYPE_POLICY.maxTicketReviews));
 if(!same(preview.payload,expectedPreview(input,initial)))fail('MM3B_PREVIEW_ALTERED');
 const results=[];let last=Date.parse(input.data.atUtc);
 if(p.reviews.length!==Math.min(initial.candidates.length,PROTOTYPE_POLICY.maxTicketReviews))fail('MM3B_REVIEW_COUNT_INVALID');
 for(let i=0;i<p.reviews.length;i++){
  const pair=p.reviews[i],claim=await referenced(directory,pair.claimRef),result=await referenced(directory,pair.resultRef),c=claim.payload;
  if(pair.claimRef.file!==`review-${String(i+1).padStart(2,'0')}-claim.json`||pair.resultRef.file!==`review-${String(i+1).padStart(2,'0')}-result.json`
   ||!fields(c,['schema','authorityId','inputSha256','policySha256','slot','combinationId','atSimulationUtc'])
   ||c.schema!=='lamultipla-mm-synthetic-review-claim-v1'||c.slot!==i+1||c.combinationId!==initial.candidates[i].id
   ||c.inputSha256!==hashValue(input)||c.authorityId!==context.authorityId||c.policySha256!==PROTOTYPE_POLICY_SHA256
   ||!timestamp(c.atSimulationUtc)||Date.parse(c.atSimulationUtc)<last)fail('MM3B_REVIEW_CLAIM_INVALID');
  last=Date.parse(c.atSimulationUtc);
  if(!fields(result.payload,['schema','claimRef','result'])||result.payload.schema!=='lamultipla-mm-synthetic-review-record-v1'||!same(result.payload.claimRef,claim.ref)
   ||!same(result.payload.result,checkPrototypeTicket(initial,input,c.combinationId,c.atSimulationUtc)))fail('MM3B_REVIEW_RESULT_ALTERED');
  results.push(result.payload.result);
 }
 if(Date.parse(p.atSimulationUtc)<last)fail('MM3B_SIMULATION_CLOCK_ROLLBACK');
 const analysis=discoverPrototype(input,p.atSimulationUtc),decision=summarizePrototype(input,analysis,results);
 if(!same(p.decision,decision)||p.decisionSha256!==hashValue(decision))fail('MM3B_DECISION_MISMATCH');
 return {prepared,decision,results};
}
async function verifyFinal(directory,input,context,{receiptRequired=true}={}){
 const checked=await verifyPrepared(directory,input,context),decisionFile=await requireFile(directory,'decision.json');
 if(!same(decisionFile.payload,checked.decision))fail('MM3B_DECISION_FILE_ALTERED');
 const proof=await requireFile(directory,'commit-proof.json'),p=proof.payload;
 if(!fields(p,['schema','authorityId','inputSha256','preparedRef','decisionRef','completedAtSimulationUtc','observedAtRealUtc'])
  ||!timestamp(p.observedAtRealUtc)||p.schema!=='lamultipla-mm-synthetic-commit-proof-v1'||p.authorityId!==context.authorityId||p.inputSha256!==hashValue(input)
  ||!same(p.preparedRef,checked.prepared.ref)||!same(p.decisionRef,decisionFile.ref)||!timestamp(p.completedAtSimulationUtc)
  ||Date.parse(p.completedAtSimulationUtc)<Date.parse(checked.prepared.payload.atSimulationUtc))fail('MM3B_COMMIT_PROOF_INVALID');
 const current=discoverPrototype(input,p.completedAtSimulationUtc),rechecked=summarizePrototype(input,current,checked.results);
 if(!same({state:rechecked.state,reasons:rechecked.reasons,selected:rechecked.selected?.combinationId??null},
  {state:checked.decision.state,reasons:checked.decision.reasons,selected:checked.decision.selected?.combinationId??null}))fail('MM3B_COMMIT_GATES_CHANGED');
 const receiptPayload={schema:'lamultipla-mm-synthetic-receipt-v1',authorityId:context.authorityId,policySha256:PROTOTYPE_POLICY_SHA256,
  codeSha256:context.codeSha256,inputSha256:hashValue(input),intentRef:checked.prepared.payload.intentRef,inputRef:checked.prepared.payload.inputRef,
  preparedRef:checked.prepared.ref,decisionRef:decisionFile.ref,commitProofRef:proof.ref,...prototypeSafety()};
 const receipt=await readFile(directory,'receipt.json');
 if(receiptRequired&&!receipt)fail('MM3B_RECEIPT_MISSING');
 if(receipt&&!same(receipt.payload,receiptPayload))fail('MM3B_RECEIPT_ALTERED');
 return {...checked,receipt,receiptPayload};
}

// Separate synthetic namespace. No attempt ID, provider, forecast, delivery or
// production persistence is reachable from this entry point.
export async function runSyntheticPrototype({root,input,policy=PROTOTYPE_POLICY,simulationClock,onCheckpoint=async()=>{}}){
 assertPrototypePolicy(policy);
 if(typeof root!=='string'||typeof simulationClock!=='function'||typeof onCheckpoint!=='function')fail('MM3B_EXPLICIT_SYNTHETIC_CLOCK_REQUIRED');
 input=structuredClone(input);const inputSha256=hashValue(input),codeSha256=await codeIdentity(),where=prototypeAuthorityPath(root,input);
 // Structural/synthetic validation before creating the namespace. Replay uses
 // the original simulation instant; it does not pretend stale inputs are fresh.
 discoverPrototype(input,input?.data?.atUtc);
 // A complete immutable authority with no active/residual owner can be replayed
 // without creating even a temporary lock. Partial or contended states still
 // require the existing lock and explicit recovery path below.
 if(await safeDirectory(root,where.authorityId,{create:false})){
  const receipt=await readFile(where.directory,'receipt.json');
  if(receipt){
   const owners=await fs.readdir(path.join(where.directory,'locks'));
   if(owners.length===0){const verified=await verifySyntheticPrototype({root,input,policy});return {...verified,replayed:true};}
  }
 }
 await safeDirectory(root,where.authorityId);
 return privateLock(where.directory,async()=>{
  const directory=where.directory,context={...where,inputSha256,codeSha256};await inspectNames(directory);
  const step=async name=>onCheckpoint(name);
  async function publish(name,payload){await step('before:'+name);await writeExclusive(path.join(directory,name),payload);await step('after:'+name);return requireFile(directory,name);}
  let policyFile=await readFile(directory,'policy.json');
  if(!policyFile)policyFile=await publish('policy.json',{schema:'lamultipla-mm-synthetic-policy-registration-v1',policy:PROTOTYPE_POLICY,
   policySha256:PROTOTYPE_POLICY_SHA256,codeSha256,registeredAtRealUtc:new Date().toISOString(),authorizationScope:'USER_M3B_SYNTHETIC_ONLY',...prototypeSafety()});
  if(!fields(policyFile.payload,['schema','policy','policySha256','codeSha256','registeredAtRealUtc','authorizationScope'])
   ||policyFile.payload.schema!=='lamultipla-mm-synthetic-policy-registration-v1'||!timestamp(policyFile.payload.registeredAtRealUtc)
   ||policyFile.payload.authorizationScope!=='USER_M3B_SYNTHETIC_ONLY'||!same(policyFile.payload.policy,PROTOTYPE_POLICY)
   ||policyFile.payload.policySha256!==PROTOTYPE_POLICY_SHA256||policyFile.payload.codeSha256!==codeSha256)fail('MM3B_POLICY_REGISTRATION_ALTERED');
  let intent=await readFile(directory,'intent.json');
  if(intent)fixedIntent(intent.payload,{...context,policyRef:policyFile.ref,input});
  if(!intent&&(await fs.readdir(directory)).some(n=>n!=='locks'&&n!=='policy.json'&&!n.endsWith('.tmp')))fail('MM3B_EFFECT_WITHOUT_INTENT');
  const existingReceipt=await readFile(directory,'receipt.json');
  if(existingReceipt){
   if(!intent)fail('MM3B_RECEIPT_WITHOUT_INTENT');
   const savedInput=await requireFile(directory,'input.json');if(!same(savedInput.payload.input,input))fail('MM3B_INPUT_FILE_ALTERED');
   const verified=await verifyFinal(directory,input,context);return {state:'SYNTHETIC_FINAL_VERIFIED',replayed:true,directory,receipt:verified.receipt.ref,decision:verified.decision,...prototypeSafety()};
  }
  let last=Date.parse(input.data.atUtc);
  const clock=()=>{const at=simulationClock();if(!timestamp(at)||Date.parse(at)<last)fail('MM3B_SIMULATION_CLOCK_ROLLBACK');last=Date.parse(at);return at;};
  if(!intent){discoverPrototype(input,clock());intent=await publish('intent.json',{schema:'lamultipla-mm-synthetic-intent-v1',authorityId:where.authorityId,
   inputSha256,policySha256:PROTOTYPE_POLICY_SHA256,codeSha256,policyRef:policyFile.ref,simulationStartedAtUtc:input.data.atUtc,
   recordedAtRealUtc:new Date().toISOString(),...prototypeSafety()});}
  let savedInput=await readFile(directory,'input.json');
  const inputPayload={schema:'lamultipla-mm-synthetic-input-record-v1',inputSha256,input,...prototypeSafety()};
  if(savedInput&&!same(savedInput.payload,inputPayload))fail('MM3B_INPUT_FILE_ALTERED');
  if(!savedInput){if(await readFile(directory,'preview.json')||await readFile(directory,'prepared.json')||await readFile(directory,'decision.json'))fail('MM3B_DOWNSTREAM_WITHOUT_INPUT');savedInput=await publish('input.json',inputPayload);}
  // Final/receipt recovery never creates a new decision or resets review slots.
  const finalExists=await readFile(directory,'decision.json'),proofExists=await readFile(directory,'commit-proof.json');
  if(proofExists){
   if(!finalExists)fail('MM3B_PROOF_WITHOUT_DECISION');
   const v=await verifyFinal(directory,input,context,{receiptRequired:false});await publish('receipt.json',v.receiptPayload);
   return {state:'SYNTHETIC_FINAL_VERIFIED',replayed:false,recovered:true,directory,receipt:(await requireFile(directory,'receipt.json')).ref,decision:v.decision,...prototypeSafety()};
  }
  const initial=discoverPrototype(input,input.data.atUtc),previewPayload=expectedPreview(input,initial);
  await reviewLayout(directory,Math.min(initial.candidates.length,PROTOTYPE_POLICY.maxTicketReviews));
  let preview=await readFile(directory,'preview.json');if(preview&&!same(preview.payload,previewPayload))fail('MM3B_PREVIEW_ALTERED');
  if(!preview)preview=await publish('preview.json',previewPayload);
  const reviews=[],results=[];
  for(let i=0;i<Math.min(initial.candidates.length,PROTOTYPE_POLICY.maxTicketReviews);i++){
   const suffix=String(i+1).padStart(2,'0'),candidate=initial.candidates[i];let claim=await readFile(directory,`review-${suffix}-claim.json`);
   if(claim){const c=claim.payload;if(c.slot!==i+1||c.combinationId!==candidate.id||c.inputSha256!==inputSha256||c.authorityId!==where.authorityId
     ||c.policySha256!==PROTOTYPE_POLICY_SHA256||!timestamp(c.atSimulationUtc)||Date.parse(c.atSimulationUtc)<last)fail('MM3B_REVIEW_CLAIM_CONFLICT');last=Date.parse(c.atSimulationUtc);}
   else{
    const at=clock(),fresh=discoverPrototype(input,at);if(!same(fresh.candidates.map(c=>c.id),initial.candidates.map(c=>c.id)))fail('MM3B_REVIEW_INPUTS_EXPIRED');
    claim=await publish(`review-${suffix}-claim.json`,{schema:'lamultipla-mm-synthetic-review-claim-v1',authorityId:where.authorityId,inputSha256,
     policySha256:PROTOTYPE_POLICY_SHA256,slot:i+1,combinationId:candidate.id,atSimulationUtc:at,...prototypeSafety()});
   }
   const resultPayload={schema:'lamultipla-mm-synthetic-review-record-v1',claimRef:claim.ref,
    result:checkPrototypeTicket(initial,input,candidate.id,claim.payload.atSimulationUtc),...prototypeSafety()};
   let result=await readFile(directory,`review-${suffix}-result.json`);
   if(result&&!same(result.payload,resultPayload))fail('MM3B_REVIEW_RESULT_ALTERED');
   if(!result){discoverPrototype(input,clock());result=await publish(`review-${suffix}-result.json`,resultPayload);}
   reviews.push({claimRef:claim.ref,resultRef:result.ref});results.push(result.payload.result);
  }
  let prepared=await readFile(directory,'prepared.json');
  if(prepared)await verifyPrepared(directory,input,context);
  else{
   const at=clock(),decision=summarizePrototype(input,discoverPrototype(input,at),results);
   prepared=await publish('prepared.json',{schema:'lamultipla-mm-synthetic-prepared-v1',authorityId:where.authorityId,inputSha256,
    policySha256:PROTOTYPE_POLICY_SHA256,codeSha256,intentRef:intent.ref,inputRef:savedInput.ref,previewRef:preview.ref,reviews,
    atSimulationUtc:at,decisionSha256:hashValue(decision),decision,...prototypeSafety()});
  }
  const checked=await verifyPrepared(directory,input,context),at=clock();
  const rechecked=summarizePrototype(input,discoverPrototype(input,at),checked.results);
  if(!same({state:rechecked.state,reasons:rechecked.reasons,selected:rechecked.selected?.combinationId??null},
   {state:checked.decision.state,reasons:checked.decision.reasons,selected:checked.decision.selected?.combinationId??null}))fail('MM3B_COMMIT_GATES_CHANGED');
  if(finalExists&&!same(finalExists.payload,checked.decision))fail('MM3B_DECISION_FILE_ALTERED');
  const decisionFile=finalExists??await publish('decision.json',checked.decision);
  // Read-back and a fresh time/gate check precede the durable commit proof.
  if(!same((await requireFile(directory,'decision.json')).ref,decisionFile.ref))fail('MM3B_DECISION_CHANGED_AFTER_PUBLICATION');
  const completed=clock(),finalCheck=summarizePrototype(input,discoverPrototype(input,completed),checked.results);
  if(!same({state:finalCheck.state,reasons:finalCheck.reasons,selected:finalCheck.selected?.combinationId??null},
   {state:checked.decision.state,reasons:checked.decision.reasons,selected:checked.decision.selected?.combinationId??null}))fail('MM3B_COMMIT_GATES_CHANGED');
  await publish('commit-proof.json',{schema:'lamultipla-mm-synthetic-commit-proof-v1',authorityId:where.authorityId,inputSha256,
   preparedRef:prepared.ref,decisionRef:decisionFile.ref,completedAtSimulationUtc:completed,observedAtRealUtc:new Date().toISOString(),...prototypeSafety()});
  const verified=await verifyFinal(directory,input,context,{receiptRequired:false});await publish('receipt.json',verified.receiptPayload);
  const final=await verifyFinal(directory,input,context);return {state:'SYNTHETIC_FINAL_VERIFIED',replayed:false,directory,receipt:final.receipt.ref,decision:final.decision,...prototypeSafety()};
 });
}

export async function verifySyntheticPrototype({root,input,policy=PROTOTYPE_POLICY}){
 assertPrototypePolicy(policy);const where=prototypeAuthorityPath(root,input),codeSha256=await codeIdentity();await inspectNames(where.directory);
 const policyFile=await requireFile(where.directory,'policy.json'),intent=await requireFile(where.directory,'intent.json'),saved=await requireFile(where.directory,'input.json');
 if(!same(policyFile.payload.policy,policy)||policyFile.payload.codeSha256!==codeSha256)fail('MM3B_POLICY_REGISTRATION_ALTERED');
 fixedIntent(intent.payload,{...where,inputSha256:hashValue(input),codeSha256,policyRef:policyFile.ref,input});
 if(!same(saved.payload.input,input))fail('MM3B_INPUT_FILE_ALTERED');
 const v=await verifyFinal(where.directory,input,{...where,codeSha256});return {state:'SYNTHETIC_FINAL_VERIFIED',directory:where.directory,receipt:v.receipt.ref,decision:v.decision,...prototypeSafety()};
}
