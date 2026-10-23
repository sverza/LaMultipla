import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import {syntheticDecisionBundle} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {redactedReceipt} from '../scripts/lib/decision/delivery.mjs';
import {envelope,digest,writeExclusive,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {parseDecisionEnvelope,validateDecisionV4,parseExperimentalEnvelope,assertNotPlayable,reasonLabel,isLocalExperimentPreview} from '../shared/decision-v4.mjs';
import {makeBackup,parseBackup} from '../shared/experimental-store.mjs';
const legacy={id:'historic-v3',season:'2025/26',matchday:38,date:'2026-05-24',stake:3,placement:'played',result:'won',returnAmount:17.2,
  playedOdd:5.4,bonusAmount:1,picks:[{id:'p1',match:'Historical A - B',market:'1',playedMarket:'DNB',executionChanged:true,odd:1.4,proposedOdd:1.4,playedOdd:1.5,
    minimumOdd:1.3,oddStatus:'bet365_verified',reasons:['Historical note'],closingOdd:1.6,closingSource:'manual',probability:75,confidence:4,result:'won'}],notes:'Historical note'};
async function legacyModel(){
  // Use the real app module, transpiled without executing an app/browser or changing its data.
  const source=(await fs.readFile(new URL('../app/lib/model.ts',import.meta.url),'utf8')).replace("'../../shared/decision-v4.mjs'",JSON.stringify(new URL('../shared/decision-v4.mjs',import.meta.url).href));
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
test('real selector to v4 contract: synthetic shadow simulation keeps exact identities, override, price and no joint invention',async()=>{
  const b=syntheticDecisionBundle(),before=digest(b),p=appPackage(b),r=await parseDecisionEnvelope(envelope(p));
  assert.equal(p.status,'simulation');assert.equal(p.selections.length,2);assert.equal(p.sourceData,'synthetic_test');
  assert.equal(p.combined.observedPrice,1.4);assert.equal(p.combined.diagnosticOddsProduct,1.44);assert.equal(p.combined.jointProbability,null);
  assert.equal(p.selections[0].provider.active,false);assert.equal(p.selections[0].verification.state,'manually_available_provider_inactive');
  assert.equal(p.selections[0].identity.period,'fulltime');assert.equal(p.selections[0].identity.line,0);assert.equal(p.actualStakeEUR,0);
  assert.equal(p.operational.authorized,false);assert.equal(digest(b),before);assert.equal(r.sha256,digest(p));
});
test('NO BET distinguishes no value from missing settlement and stays out of proposal/stake',async()=>{
  for(const [kind,cause] of [['no_value','NO_VALUE'],['missing_rules','SELECTION_REVIEW_REQUIRED']]){
    const p=appPackage(syntheticDecisionBundle(kind));assert.equal(p.status,'no_bet');assert.equal(p.shadowCause,cause);
    assert.equal(p.combined,null);assert.equal(p.selections.length,0);assert.equal(p.nominalStakeEUR,0);assert.ok(reasonLabel(cause).length>20);
    assert.equal((await parseDecisionEnvelope(envelope(p))).payload.operational.cause,'MODEL_NOT_AUTHORIZED');
  }
});
test('tampering, invented fields, NaN, wrong event/period/outcome, stale verification and contradictory values fail',async()=>{
  const base=appPackage(syntheticDecisionBundle());
  for(const edit of [p=>p.actualStakeEUR=3,p=>p.status='played',p=>p.status='approved',p=>p.status='draft',p=>p.operational.authorized=true,
    p=>p.confidence=4,p=>p.originalDecision={},p=>p.api_key='secret',p=>p.source={},p=>delete p.source.journalSha256,
    p=>p.selections[0].forecast.intervals95[1]=[0,.01],p=>p.selections[0].price=NaN,p=>p.selections[0].forecast.probability=.5,
    p=>p.selections[0].identity.period='1st-half',p=>p.selections[0].identity.playerKey='999',p=>p.selections[0].identity.line=.5,
    p=>p.selections[1].identity.fixtureId=p.selections[0].identity.fixtureId,p=>p.selections[0].verification.domain='bet365.com',
    p=>p.selections[0].verification.verifiedAtUtc='2026-10-16T00:00:00Z',p=>p.selections[0].observedAtUtc='2026-10-17T10:16:00Z',
    p=>p.selections[0].identity.kickoffUtc='2026-10-17T10:14:00Z',p=>p.combined.jointProbability=.9,p=>p.combined.statisticallyValidated=true,
    p=>p.combined.observedPrice=1.44,p=>p.combined.jointProbabilityBounds=[.9,.99],p=>p.selections[0].settlement.reviewedAtUtc='2026-10-01T00:00:00Z']){
    const p=structuredClone(base);edit(p);assert.throws(()=>validateDecisionV4(p));
  }
  const broken=envelope(base);broken.payload.selections[0].price=10;await assert.rejects(()=>parseDecisionEnvelope(broken),/hash/);
  assert.throws(()=>assertNotPlayable(),/non possono diventare giocate/);
});
test('localhost browser isolation never disables the native Android feed',()=>{
  for(const hostname of ['localhost','127.0.0.1']){
    assert.equal(isLocalExperimentPreview(hostname,false),true);
    assert.equal(isLocalExperimentPreview(hostname,true),false);
  }
  assert.equal(isLocalExperimentPreview('sverza.github.io',false),false);
});
test('public receipt is strict, redacted and never transmits forecasts, medical notes or quote fields',async()=>{
  const b=syntheticDecisionBundle(),r=redactedReceipt(b),parsed=await parseExperimentalEnvelope(envelope(r));
  assert.equal(parsed.payload.decision,'NO_BET');const keys=Object.keys(r);
  for(const key of ['selections','combined','price','odds','report','journal','assessment','context','model','probability','reviewer'])assert.ok(!keys.includes(key));
  const raw=await parseExperimentalEnvelope(r);assert.equal(raw.sha256,digest(r));
  await assert.rejects(()=>parseExperimentalEnvelope({...r,selections:b.report.selections}),/non ammessi/);
});
test('v3 and v4 backups preserve every historical value and experimental envelope without mixing archives',async()=>{
  const preferences={theme:'dark',activeSeason:'2025/26'},old={app:'seriea-multipla',version:3,slips:[legacy],preferences};
  const restored=await parseBackup(old);assert.deepEqual(restored.slips,[legacy]);assert.deepEqual(restored.experiments,[]);
  const experiments=[envelope(appPackage(syntheticDecisionBundle()))],copy=JSON.stringify(legacy);
  const backup=await makeBackup({slips:[legacy],preferences,experiments,exportedAt:'2026-10-17T12:00:00Z'});
  assert.equal(backup.version,4);assert.equal(JSON.stringify(backup.slips[0]),copy);
  assert.deepEqual((await parseBackup(JSON.parse(JSON.stringify(backup)))).experiments,experiments);
  assert.deepEqual((await parseBackup(backup)).slips,[legacy]);
  const bad=structuredClone(backup);bad.experiments[0].payload.actualStakeEUR=3;await assert.rejects(()=>parseBackup(bad),/hash/);
  await assert.rejects(()=>parseBackup({...old,slips:[experiments[0]]}),/nello storico/);
});
test('real legacy parser and statistics keep v3 financial semantics and reject experimental conversions',async()=>{
  const model=await legacyModel(),old=model.normalizeSlip(legacy),stats=model.buildStats([old]);
  assert.deepEqual(old,legacy);assert.equal(stats.stake,3);assert.equal(stats.returns,17.2);assert.equal(stats.registered,1);
  const p=appPackage(syntheticDecisionBundle());assert.throws(()=>model.parseSlip(p),/Esperimento/);assert.throws(()=>model.normalizeSlip(p),/non sono schedine/);
  assert.throws(()=>model.parseSlip({season:'2026/27',matchday:7,date:'2026-10-17',selections:[{match:'A-B',market:'1',confidence:4,probability:50}]}),/non validi/);
  const backup=await makeBackup({slips:[old],experiments:[envelope(p)],preferences:{},exportedAt:'2026-10-17T12:00:00Z'});
  assert.deepEqual(model.buildStats((await parseBackup(backup)).slips.map(model.normalizeSlip)),stats);
});
test('v4 CLI replay and immutable private delivery execute without API, publication or scheduler',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-v4-'));try{
    await fs.cp(new URL('../scripts',import.meta.url),path.join(root,'scripts'),{recursive:true});await fs.cp(new URL('../shared',import.meta.url),path.join(root,'shared'),{recursive:true});
    const b=syntheticDecisionBundle();for(const k of ['decision','journal'])await writeExclusive(path.join(root,k+'.json'),b[k]);
    for(const k of ['report','study','assessment'])await fs.writeFile(path.join(root,k+'.json'),JSON.stringify(b[k]));
    const args=[path.join(root,'scripts/decision.mjs'),'--app-package',...['decision','journal','report','study','assessment'].flatMap(k=>['--'+k,path.join(root,k+'.json')])];
    const run=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,ODDSPAPI_API_KEY:''}});assert.equal(run.status,0,run.stderr);
    const folder=path.join(root,'.local/decisions/app-v4'),files=await fs.readdir(folder);assert.equal(files.length,1);
    const payload=await readSnapshot(path.join(folder,files[0]));assert.equal(payload.status,'simulation');assert.equal(payload.combined.observedPrice,1.4);
    assert.ok(!(await fs.readdir(root)).includes('public'));assert.ok(!Object.hasOwn(payload,'originalDecision'));
    const repeat=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(repeat.status,1);assert.match(repeat.stderr,/nessuna sovrascrittura/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
