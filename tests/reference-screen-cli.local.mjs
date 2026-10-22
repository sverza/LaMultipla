// Optional PC-only synthetic test of the REAL shadow CLI and registered code.
// Studies are read-only. Every forecast is synthetic, with synthetic teams,
// under a unique .local/tests namespace; no real cohort receipt is fabricated.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../scripts/lib/private-store.mjs';
import {loadReferencePlan} from '../scripts/lib/reference-readiness.mjs';
import {referenceScreenFixture} from './fixtures/reference-screen.mjs';
import {syntheticContextDataset} from './fixtures/context.mjs';
import {buildContext} from '../scripts/lib/context/dossier.mjs';
import {buildForecast} from '../scripts/lib/engine/forecast.mjs';
import {runReferenceScreen,runShadowPreview} from '../scripts/lib/reference-screen.mjs';
import {writeExclusive,digest,readSnapshot} from '../scripts/lib/prospective/store.mjs';
import {buildB2Diagnostic} from '../scripts/lib/diagnostic-goals-b2/diagnostic.mjs';
const {plan,input}=await loadReferencePlan(ROOT,'.local/preparation/g8-authorized/reference-plan.pending.private.json',{allowDraft:true});
const folder=path.join(ROOT,'.local/tests/reference-screen-real-cli-'+crypto.randomUUID());
await fs.mkdir(path.join(folder,'docs'),{recursive:true});await fs.copyFile(path.join(ROOT,'docs/protocollo-analisi-progressive-v1.md'),path.join(folder,'docs/protocollo-analisi-progressive-v1.md'));
const evidence=[];
for(const [index,kind] of ['simulation','no_value','missing_rules'].entries()){
 const now=new Date().toISOString(),{bundle,reference,catalog,rawFixtures}=referenceScreenFixture(kind,{now}),temp=path.join(folder,'scenario-'+index);
 await fs.mkdir(path.join(temp,'docs'),{recursive:true});await fs.copyFile(path.join(folder,'docs/protocollo-analisi-progressive-v1.md'),path.join(temp,'docs/protocollo-analisi-progressive-v1.md'));
 const acquired=new Date(Date.parse(now)-180000).toISOString(),dataset=syntheticContextDataset(bundle.journal.manifest,acquired);
 dataset.rows=dataset.rows.map(r=>{const date=r.date.replace('2026-','2025-'),season='2025-26';return {...r,date,season,key:`${season}:${r.home}:${r.away}`,availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()};});
 dataset.rows.push(...dataset.rows.map(r=>{const date=r.date.replace('2025-','2024-'),season='2024-25';return {...r,date,season,key:`${season}:${r.home}:${r.away}`,availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()};}));
 for(const year of [2022,2023])dataset.rows.push(...dataset.rows.filter(r=>r.season==='2025-26').map(r=>{const date=r.date.replace('2025-',`${year}-`),season=`${year}-${String(year+1).slice(-2)}`;return {...r,date,season,key:`${season}:${r.home}:${r.away}`,availableAtUtc:new Date(Date.parse(date)+48*3600000).toISOString()};}));
 bundle.study=input.registry.study;bundle.journal.provenance={...bundle.journal.provenance,studySha256:digest(bundle.study),datasetSha256:digest(dataset),datasetAcquiredAtUtc:acquired};
 bundle.context=buildContext({manifest:bundle.journal.manifest,dataset,evidence:bundle.context.evidence,now});
 const extension=buildForecast({...input.study,synthetic:true},dataset,reference.input.schedule,{clock:()=>new Date(Date.parse(now)-120000)});
 // The study payload and its journal link must agree; the synthetic marker is
 // confined to the test copy, not added to the registered study.
 const syntheticStudy={...input.study,synthetic:true};
 const datasetFile=path.join(temp,'dataset.json'),journalFile=path.join(temp,'journal-v1.json'),extensionFile=path.join(temp,'journal-v2.json'),studyFile=path.join(temp,'study-v2.json');
 for(const [file,payload] of [[datasetFile,dataset],[journalFile,bundle.journal],[extensionFile,extension],[studyFile,syntheticStudy]])await writeExclusive(file,payload);
 const files={};for(const key of ['report','assessment','context','combinedPrices']){
  const file=path.join(temp,key+'.json');
  if(key==='context')await writeExclusive(file,bundle[key]);else await fs.writeFile(file,JSON.stringify(bundle[key]));
  files[key]={file,value:bundle[key]};
 }
 reference.plan={studyV1File:plan.studyV1File,studyV2File:studyFile,datasetFile};reference.verified.journals={v1:{file:journalFile},v2:{file:extensionFile}};
 reference.input.registry=input.registry;
 const result=await runReferenceScreen({root:temp,reference,files,attemptId:'0001',clock:()=>new Date(),runShadow:args=>runShadowPreview({...args,root:ROOT})});
 assert.equal(result.state,{simulation:'MULTIPLA_SIMULATA',no_value:'NO_BET',missing_rules:'ANALYSIS_INCOMPLETE'}[kind]);
 const decision=await readSnapshot(path.join(path.dirname(result.packageFile),'decision.json'));
 assert.equal(decision.provenance.sourceData,'synthetic_test');assert.equal(decision.experimentalMarkets,undefined);
 // Optimized B2 is deliberately downstream and separate from the producer.
 const diagnostic=buildB2Diagnostic({journal:extension,study:syntheticStudy,report:bundle.report,assessment:bundle.assessment,context:bundle.context,decision,catalog,fixtures:rawFixtures,now:new Date()});
 await writeExclusive(path.join(temp,'diagnostic.json'),diagnostic);
 assert.equal(diagnostic.eligibleForSelector,false);assert.ok(diagnostic.pricedRecords.every(r=>r.eligibleForSelector===false));
 evidence.push({kind,state:result.state,packageSha256:result.packageSha256,sourceData:decision.provenance.sourceData,diagnosticOnly:true});
}
const result={schema:'lamultipla-reference-screen-cli-selftest-v1',atUtc:new Date().toISOString(),cases:evidence,sourceData:'SYNTHETIC_TEST_ONLY',
 registeredStudiesReadOnly:true,syntheticTeamsOnly:true,realCLI:true,providerRequests:0,realCohortActivated:false,deliveryExecuted:false};
await writeExclusive(path.join(folder,'result.private.json'),result);console.log(JSON.stringify({...result,folder}));
