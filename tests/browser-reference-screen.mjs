// Optional browser E2E, localhost only. No phone, pairing, API or production cloud.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {referenceScreenFixture,screenNow} from './fixtures/reference-screen.mjs';
import {runReferenceScreen} from '../scripts/lib/reference-screen.mjs';
import {createDecision} from '../scripts/lib/shadow/pipeline.mjs';
import {governance} from '../scripts/lib/decision/governance.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const folder=path.resolve('.local/tests/browser-reference-screen-'+crypto.randomUUID());await fs.mkdir(path.join(folder,'docs'),{recursive:true});
await fs.copyFile('docs/protocollo-analisi-progressive-v1.md',path.join(folder,'docs/protocollo-analisi-progressive-v1.md'));
const packages={};
for(const [i,kind] of ['simulation','no_value','missing_rules'].entries()){
 const {bundle,reference}=referenceScreenFixture(kind);
 // Independent fake private channels/round stores; never competing real proposals.
 const temp=path.join(folder,'scenario-'+i);await fs.mkdir(path.join(temp,'docs'),{recursive:true});
 await fs.copyFile('docs/protocollo-analisi-progressive-v1.md',path.join(temp,'docs/protocollo-analisi-progressive-v1.md'));
 const files=Object.fromEntries(['report','assessment','context','combinedPrices'].map(k=>[k,{file:path.join(temp,k+'.json'),value:bundle[k]}]));
 const result=await runReferenceScreen({root:temp,reference,files,attemptId:'0001',clock:()=>new Date(screenNow),runShadow:async({metadata})=>{
  const d=createDecision({...bundle,progressive:metadata});d.final=false;d.governance=governance(d);return d;
 }});packages[kind]=result.packageFile;
}
const base='http://127.0.0.1:3101',server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3101'],{stdio:['ignore','pipe','pipe']});
let logs='',browser;
for(const stream of [server.stdout,server.stderr])stream.on('data',c=>{logs=(logs+c).slice(-3000);});
try{
 let ready=false;for(let n=0;n<120;n++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'Local server unavailable: '+logs);
 browser=await chromium.launch({headless:true,...(process.env.LAMULTIPLA_CHROMIUM_PATH?{executablePath:process.env.LAMULTIPLA_CHROMIUM_PATH}:{})});
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname.endsWith('/latest-slip.json'))return route.fulfill({json:{available:false}});
   if(url.pathname.endsWith('/app-version.json'))return route.fulfill({json:{version:'1.1.0'}});return route.continue();
  });
  await page.goto(base);await page.waitForSelector('nav');
  await page.evaluate(async()=>{
   const db=await new Promise(resolve=>{const r=indexedDB.open('seriea-multipla',2);r.onsuccess=()=>resolve(r.result);});
   await new Promise(resolve=>{const t=db.transaction('slips','readwrite');t.objectStore('slips').put({id:'SYNTHETIC_LEGACY',marker:'PRESERVE',season:'2025/26',matchday:38,date:'2026-05-24',stake:3,placement:'played',result:'won',returnAmount:6,
    picks:[{id:'synthetic-pick',match:'Synthetic A - Synthetic B',market:'1',odd:2,proposedOdd:2,probability:60,confidence:3,oddStatus:'bet365_verified',reasons:[],result:'won'}]});t.oncomplete=resolve;});db.close();
  });
  await page.getByRole('button',{name:'Esperimento',exact:true}).click();
  for(const kind of ['simulation','no_value','missing_rules'])await page.locator('input[type=file]').first().setInputFiles(packages[kind]);
  await page.getByText('Evidenze insufficienti · giornata 8',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('round-state').count(),2);assert.equal(await page.getByTestId('experiment-card').count(),1);
  assert.match(await page.getByTestId('experiment-card').innerText(),/MULTIPLA SIMULATA/);
  assert.match(await page.getByTestId('round-state').allInnerTexts().then(t=>t.join('\n')),/NO BET provvisorio/);
  await page.locator('input[type=file]').first().setInputFiles(packages.simulation);
  const altered=JSON.parse(await fs.readFile(packages.simulation,'utf8'));altered.payload.actualStakeEUR=3;
  const bad=path.join(folder,'tampered.json');await fs.writeFile(bad,JSON.stringify(altered));
  await page.locator('input[type=file]').first().setInputFiles(bad);await page.getByText(/hash snapshot/i).waitFor();
  await page.reload();await page.getByRole('button',{name:'Esperimento',exact:true}).click();
  assert.equal(await page.getByTestId('round-state').count(),2);assert.equal(await page.getByTestId('experiment-card').count(),1);
  const legacy=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('seriea-multipla',2);r.onsuccess=()=>resolve(r.result);});
   const result=await new Promise(resolve=>{const r=db.transaction('slips').objectStore('slips').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return result;});
  assert.equal(legacy.length,1);assert.equal(legacy[0].marker,'PRESERVE');assert.equal(legacy[0].returnAmount,6);assert.equal(legacy[0].picks[0].odd,2);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(folder,'ui-'+viewport.width+'.png'),fullPage:true});await context.close();
 }
 const result={sourceData:'SYNTHETIC_TEST_ONLY',viewports:2,states:3,duplicateRejected:true,tamperRejected:true,reopenPersistence:true,legacyUnchanged:true,
  actualAndroidDevice:false,productionCloud:false,apiCalls:0};
 await fs.writeFile(path.join(folder,'result.private.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,folder}));
}finally{await browser?.close();server.kill();}
