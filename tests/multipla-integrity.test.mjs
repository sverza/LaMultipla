// Synthetic only: no original journal, provider request or real delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {referenceScreenFixture,screenNow} from './fixtures/reference-screen.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {verifyDecisionBundle} from '../scripts/lib/decision/delivery.mjs';
import {experimentPayload,runReferenceScreen} from '../scripts/lib/reference-screen.mjs';
import {createDecision,decisionPath} from '../scripts/lib/shadow/pipeline.mjs';
import {governance} from '../scripts/lib/decision/governance.mjs';
import {digest,readSnapshot,envelope} from '../scripts/lib/prospective/store.mjs';
import {parseDecisionEnvelope} from '../shared/decision-v4.mjs';
import {buildContext} from '../scripts/lib/context/dossier.mjs';
import {syntheticContextDataset} from './fixtures/context.mjs';
function deepFreeze(value,seen=new Set()){
 if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const item of Object.values(value))deepFreeze(item,seen);Object.freeze(value);}return value;
}
async function setup(t,kind='simulation'){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-multipla-integrity-'));
 t.after(async()=>{const absolute=path.resolve(root);assert.equal(path.dirname(absolute),path.resolve(os.tmpdir()));
  assert.ok(path.basename(absolute).startsWith('lamultipla-multipla-integrity-'));await fs.rm(absolute,{recursive:true,force:true});});
 await fs.mkdir(path.join(root,'docs'),{recursive:true});await fs.copyFile('docs/protocollo-analisi-progressive-v1.md',path.join(root,'docs/protocollo-analisi-progressive-v1.md'));
 const {bundle,reference}=referenceScreenFixture(kind),files=Object.fromEntries(['report','assessment','context','combinedPrices'].map(key=>[key,{file:path.join(root,key+'.json'),value:bundle[key]}]));
 let calls=0;const runShadow=async({metadata})=>{calls++;const d=createDecision({...bundle,progressive:metadata});d.final=false;d.governance=governance(d);return d;};
 const directory=path.join(root,'.local/research-review/cohorts/reference-g8-20261023-v1/screening/0001');
 return {root,bundle,reference,files,attemptId:'0001',clock:()=>new Date(screenNow),runShadow,calls:()=>calls,directory};
}
async function artifacts(s){const result={};async function visit(dir){
 let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
 for(const item of entries){const file=path.join(dir,item.name);if(item.isDirectory())await visit(file);else{
  const raw=await fs.readFile(file),stat=await fs.stat(file);result[path.relative(s.root,file)]={raw:raw.toString('utf8'),mtime:stat.mtimeMs,size:stat.size};
 }}
 }await visit(path.join(s.root,'.local'));return result;}
async function verifyLinks(s,receipt){
 const previewFile=path.join(s.directory,'decision.json'),finalFile=decisionPath(path.join(s.root,'.local/shadow'),'2026/27',8);
 const preview=await readSnapshot(previewFile),final=await readSnapshot(finalFile),payload=await readSnapshot(receipt.packageFile);
 assert.equal(preview.final,false);assert.equal(final.final,true);assert.notEqual(digest(preview),digest(final));
 assert.equal(receipt.previewDecisionFile,previewFile);assert.equal(receipt.previewDecisionSha256,digest(preview));
 assert.equal(receipt.decisionFile,finalFile);assert.equal(receipt.decisionSha256,digest(final));
 assert.equal(receipt.packageSha256,digest(payload));assert.equal(payload.source.decisionSha256,digest(final));
 assert.equal(final.provenance.referenceScreenInputSha256,receipt.inputSha256);
 for(const field of ['selector','opportunities','contextGate','selectionGate'])assert.deepEqual(final[field],preview[field]);
 assert.equal(verifyDecisionBundle({...s.bundle,decision:preview}).verified,true);
 assert.equal(verifyDecisionBundle({...s.bundle,decision:final}).verified,true);
 assert.deepEqual((await parseDecisionEnvelope(envelope(payload))).payload,payload);
 return {preview,final,payload};
}
test('progressive app package is pure on deeply frozen inputs and deterministic',async t=>{
 const s=await setup(t);await runReferenceScreen(s);
 const preview=await readSnapshot(path.join(s.directory,'decision.json'));
 const input=deepFreeze(structuredClone({...s.bundle,decision:preview})),before=JSON.stringify(input),first=appPackage(input),second=appPackage(input);
 assert.equal(JSON.stringify(input),before);assert.deepEqual(first,second);assert.equal(first.source.decisionSha256,digest(preview));
 assert.equal(first.reasonCodes.filter(x=>x==='proposta_shadow_definitiva').length,1);
 assert.equal(verifyDecisionBundle(input).verified,true);
});
test('package output owns its arrays and objects: subsequent UI edits cannot mutate a decision',async t=>{
 const s=await setup(t);await runReferenceScreen(s);const preview=await readSnapshot(path.join(s.directory,'decision.json'));
 const input=deepFreeze(structuredClone({...s.bundle,decision:preview})),before=JSON.stringify(input),p=appPackage(input);
 p.round.matchday=99;p.reasonCodes.push('SYNTHETIC_UI_ONLY');p.counts.examined=999;
 p.selections[0].forecast.probabilities1X2[0]=0;p.selections[0].forecast.intervals95[0][0]=0;p.combined.jointProbabilityBounds[0]=0;
 assert.equal(JSON.stringify(input),before);
});
test('experiment presentation cannot mutate a frozen preview or its probabilities',async t=>{
 const s=await setup(t);await runReferenceScreen(s);const preview=await readSnapshot(path.join(s.directory,'decision.json'));
 const input=deepFreeze(structuredClone({...s.bundle,decision:preview})),before=JSON.stringify(input);
 const intent=await readSnapshot(path.join(s.directory,'intent.json'));
 const a=experimentPayload({bundle:input,reference:deepFreeze(s.reference),intent:deepFreeze(intent)}),b=experimentPayload({bundle:input,reference:s.reference,intent});
 assert.equal(a.outcome.state,'MULTIPLA_SIMULATA');assert.equal(JSON.stringify(input),before);assert.deepEqual(a,b);
 a.decision.selector.selected.quoteIds.push('SYNTHETIC_RETURN_VALUE_ONLY');assert.equal(JSON.stringify(input),before);
});
test('MULTIPLA persisted preview, final, package and receipt bind exact independent artifacts; replay changes no bytes or mtime',async t=>{
 const s=await setup(t),journalBefore=digest(s.reference.journal),bundleBefore=digest(s.bundle);
 const receipt=await runReferenceScreen(s);assert.equal(receipt.state,'MULTIPLA_SIMULATA');await verifyLinks(s,receipt);
 assert.equal(digest(s.reference.journal),journalBefore);assert.equal(digest(s.bundle),bundleBefore);
 const before=await artifacts(s),again=await runReferenceScreen(s);assert.deepEqual(again,receipt);assert.equal(s.calls(),1);assert.deepEqual(await artifacts(s),before);
});
for(const stage of ['intent','decision','final','package','receipt']){
 test('crash after '+stage+' recovers the same transaction without duplicate selection or replacement',async t=>{
  const s=await setup(t);await assert.rejects(runReferenceScreen({...s,afterStage:name=>{if(name===stage)throw Error('SYNTHETIC_CRASH_'+stage);}}),/SYNTHETIC_CRASH/);
  const before=await artifacts(s),receipt=await runReferenceScreen(s);assert.equal(s.calls(),1);await verifyLinks(s,receipt);
  const after=await artifacts(s);for(const [file,value] of Object.entries(before))assert.deepEqual(after[file],value);
  const stable=await artifacts(s);assert.deepEqual(await runReferenceScreen(s),receipt);assert.deepEqual(await artifacts(s),stable);
 });
}
test('changed input cannot reuse an intent; altered preview/final/package/receipt stops without overwriting',async t=>{
 for(const reseal of [false,true])for(const which of ['preview','final','package','receipt']){
  const s=await setup(t),receipt=await runReferenceScreen(s);
  const file=which==='preview'?receipt.previewDecisionFile:which==='final'?receipt.decisionFile:which==='package'?receipt.packageFile:path.join(s.directory,'receipt.json');
  const raw=JSON.parse(await fs.readFile(file,'utf8'));raw.payload.integrityTestTamper=true;if(reseal)raw.sha256=digest(raw.payload);await fs.writeFile(file,JSON.stringify(raw));const tampered=await fs.readFile(file,'utf8');
  await assert.rejects(runReferenceScreen(s));assert.equal(await fs.readFile(file,'utf8'),tampered);assert.equal(s.calls(),1);
 }
 const s=await setup(t);await runReferenceScreen(s);
 await assert.rejects(runReferenceScreen({...s,files:{...s.files,assessment:{...s.files.assessment,value:{estimates:[]}}}}),/INPUT_CHANGED/);
 await assert.rejects(runReferenceScreen({...s,attemptId:'0002'}),/FINAL_ALREADY_EXISTS/);
});
test('package altered after publication cannot receive a successful completion receipt',async t=>{
 const s=await setup(t),file=path.join(s.directory,'app-package.json');
 await assert.rejects(runReferenceScreen({...s,afterStage:async stage=>{if(stage==='package'){
  const raw=JSON.parse(await fs.readFile(file,'utf8'));raw.payload.id='SYNTHETIC_TAMPER';raw.sha256=digest(raw.payload);await fs.writeFile(file,JSON.stringify(raw));
 }}}),/PERSISTED_PACKAGE_HASH_MISMATCH/);
 await assert.rejects(fs.stat(path.join(s.directory,'receipt.json')),e=>e.code==='ENOENT');
});
for(const [kind,state]of [['no_value','NO_BET'],['missing_rules','ANALYSIS_INCOMPLETE']]){
 test(state+' retains original gates and idempotent package compatibility',async t=>{
  const s=await setup(t,kind),receipt=await runReferenceScreen(s),payload=await readSnapshot(receipt.packageFile);
  assert.equal(receipt.state,state);assert.equal(receipt.decisionFile,path.join(s.directory,'decision.json'));
  const d=await readSnapshot(receipt.decisionFile);assert.equal(digest(d),receipt.decisionSha256);assert.equal(receipt.previewDecisionSha256,receipt.decisionSha256);
  await parseDecisionEnvelope(envelope(payload));const before=await artifacts(s);assert.deepEqual(await runReferenceScreen(s),receipt);assert.deepEqual(await artifacts(s),before);
 });
}
test('probable lineup is allowed; absence retains raw diagnostic opportunities but admits no proposal',()=>{
 const {bundle}=referenceScreenFixture();assert.ok(bundle.context.entries.every(e=>e.state==='READY_FOR_SHADOW_REVIEW'));
 assert.ok(bundle.context.evidence.facts.filter(f=>f.category==='lineups').every(f=>f.data.kind==='probable'&&f.data.players.length===11));
 const evidence=structuredClone(bundle.context.evidence);evidence.facts=evidence.facts.filter(f=>f.category!=='lineups');
 const context=buildContext({manifest:bundle.journal.manifest,dataset:syntheticContextDataset(bundle.journal.manifest,screenNow),evidence,now:screenNow});
 const d=createDecision({...bundle,context});assert.ok(d.opportunities.candidates.length>0);assert.equal(d.contextGate.eligibleFixtureIds.length,0);assert.equal(d.selector.selected,null);
 assert.ok(d.selectionGate.entries.every(e=>!e.eligible));
});
