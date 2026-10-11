// Optional real browser test: isolated localhost only, SYNTHETIC data, no live API/feed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {syntheticDecisionBundle} from './fixtures/decision.mjs';
import {appPackage} from '../scripts/lib/decision/app-package.mjs';
import {redactedReceipt} from '../scripts/lib/decision/delivery.mjs';
import {envelope} from '../scripts/lib/prospective/store.mjs';
import assert from 'node:assert/strict';
const req=createRequire(import.meta.url),{chromium}=req(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=process.env.LAMULTIPLA_TEST_URL??'http://127.0.0.1:3100';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Browser test only permits isolated localhost, no public app');
const restoreOnly=process.env.LAMULTIPLA_TEST_RESTORE_ONLY==='true';
const folder=path.resolve('.local/e2e-v4');await fs.mkdir(folder,{recursive:true});
const simulation=envelope(appPackage(syntheticDecisionBundle())),noBet=envelope(appPackage(syntheticDecisionBundle('no_value'))),receipt=envelope(redactedReceipt(syntheticDecisionBundle()));
if(!restoreOnly)for(const [name,data] of Object.entries({simulation,noBet,receipt}))await fs.writeFile(path.join(folder,name+'.json'),JSON.stringify(data));
const legacy={id:'historic-e2e',season:'2025/26',matchday:38,date:'2026-05-24',stake:3,placement:'played',result:'won',returnAmount:17.2,notes:'SYNTHETIC historical compatibility fixture',legacyAuditMarker:'PRESERVE_RAW',
 picks:[{id:'p1',match:'Historical A - B',market:'1',odd:1.4,proposedOdd:1.4,probability:75,confidence:4,oddStatus:'bet365_verified',reasons:[],result:'won'}]};
let server=null;
if(process.env.LAMULTIPLA_TEST_EXTERNAL_SERVER!=='true'){
  const port=new URL(base).port;server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',port],{stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-4000);});
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{} await new Promise(resolve=>setTimeout(resolve,200));}
  if(!ready){server.kill();throw new Error('Local test server failed: '+logs);}
}
let browser=null,completed=0;
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  browser=await chromium.launch({headless:true,...(process.env.LAMULTIPLA_CHROMIUM_PATH?{executablePath:process.env.LAMULTIPLA_CHROMIUM_PATH}:{}),
  args:process.env.LAMULTIPLA_CHROMIUM_ARGS?JSON.parse(process.env.LAMULTIPLA_CHROMIUM_ARGS):[]});

  const context=await browser.newContext({viewport,acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const u=new URL(route.request().url());
    if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();
    if(u.pathname.endsWith('/latest-slip.json'))return route.fulfill({json:{available:false}});
    if(u.pathname.endsWith('/app-version.json'))return route.fulfill({json:{version:'1.1.0'}});return route.continue();});
  // Local preview must leave legacy migrations and automatic public-feed imports disabled.
  await page.goto(base);await page.waitForSelector('nav');
  const history=()=>page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('seriea-multipla',2);r.onsuccess=()=>resolve(r.result);});
    const rows=await new Promise(resolve=>{const r=db.transaction('slips').objectStore('slips').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return JSON.stringify(rows);});
  let backup,destination;
  if(!restoreOnly){
  await page.evaluate(async slip=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('seriea-multipla',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const t=db.transaction('slips','readwrite');t.objectStore('slips').put(slip);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();},legacy);
  await page.reload();await page.getByRole('button',{name:'Esperimento',exact:true}).click();
  const original=await history();
  await page.locator('input[type=file]').first().setInputFiles(path.join(folder,'simulation.json'));
  await page.getByTestId('experiment-card').waitFor();assert.match(await page.getByTestId('experiment-card').innerText(),/MULTIPLA SIMULATA/);
  assert.match(await page.getByTestId('experiment-card').innerText(),/DATI SINTETICI/);
  assert.equal(await page.getByTestId('observed-combined-price').innerText(),'1.40');
  assert.match(await page.getByTestId('experiment-card').innerText(),/diagnostico.*1.44/);
  assert.equal(await page.getByRole('button',{name:/conferma.*gioc|giocata effettiva/i}).count(),0);
  await page.locator('input[type=file]').first().setInputFiles(path.join(folder,'noBet.json'));
  await page.getByTestId('no-bet-cause').waitFor();assert.match(await page.getByTestId('no-bet-cause').innerText(),/Nessun valore positivo/);
  assert.equal(await history(),original);
  // Replay import is idempotent; tampering is rejected before a database write.
  await page.locator('input[type=file]').first().setInputFiles(path.join(folder,'simulation.json'));assert.equal(await page.getByTestId('experiment-card').count(),2);
  const bad=structuredClone(simulation);bad.payload.actualStakeEUR=3;await fs.writeFile(path.join(folder,'tampered.json'),JSON.stringify(bad));
  await page.locator('input[type=file]').first().setInputFiles(path.join(folder,'tampered.json'));await page.getByText(/hash snapshot/).waitFor();assert.equal(await page.getByTestId('experiment-card').count(),2);
  await page.reload();await page.getByRole('button',{name:'Esperimento',exact:true}).click();assert.equal(await page.getByTestId('experiment-card').count(),2);
  await page.locator('input[type=file]').first().setInputFiles(path.join(folder,'receipt.json'));await page.getByTestId('public-receipt').waitFor();
  assert.match(await page.getByTestId('public-receipt').innerText(),/DATI QUOTE ASSENTI/);assert.equal(await history(),original);
  await page.screenshot({path:path.join(folder,`ui-${viewport.width}.png`),fullPage:true});
  // Backups include experiments without normalizing/modifying raw financial records.
  await page.getByRole('button',{name:/Altro$/}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Esporta backup completo',exact:true}).click();
  const download=await downloadPromise;destination=path.join(folder,`backup-${viewport.width}.json`);await download.saveAs(destination);
  backup=JSON.parse(await fs.readFile(destination,'utf8'));assert.equal(backup.version,4);assert.equal(backup.experiments.length,3);
  assert.equal(backup.slips.length,1);assert.equal(backup.slips[0].returnAmount,17.2);assert.equal(await history(),original);
  }else{
    destination=path.join(folder,`backup-${viewport.width}.json`);
    backup=JSON.parse(await fs.readFile(destination,'utf8'));
    assert.equal(backup.version,4);assert.equal(backup.experiments.length,3);assert.equal(backup.slips.length,1);
    await page.getByRole('button',{name:/Altro$/}).click();
  }
  // Only this isolated, synthetic browser database is emptied to exercise an actual restore.
  await page.evaluate(async()=>{for(const [name,version,store] of [['seriea-multipla',2,'slips'],['lamultipla-experiments',1,'snapshots']]){
    const db=await new Promise(resolve=>{const r=indexedDB.open(name,version);r.onsuccess=()=>resolve(r.result);});
    await new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error);});db.close();}});
  await page.locator('input[type=file]').last().setInputFiles(destination);await page.getByText('Backup ripristinato.',{exact:true}).waitFor();
  assert.equal(await history(),JSON.stringify(backup.slips));
  await page.getByRole('button',{name:'Esperimento',exact:true}).click();assert.equal(await page.getByTestId('experiment-card').count(),2);assert.equal(await page.getByTestId('public-receipt').count(),1);
  const old={...backup,version:3};delete old.experiments;const oldPath=path.join(folder,`legacy-backup-${viewport.width}.json`);await fs.writeFile(oldPath,JSON.stringify(old));
  await page.getByRole('button',{name:/Altro$/}).click();await page.locator('input[type=file]').last().setInputFiles(oldPath);
  await page.getByText('Backup ripristinato.',{exact:true}).waitFor();assert.equal(await history(),JSON.stringify(backup.slips));
  await page.getByRole('button',{name:'Esperimento',exact:true}).click();assert.equal(await page.getByTestId('experiment-card').count(),2);
  await page.screenshot({path:path.join(folder,`restored-ui-${viewport.width}.png`),fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));await context.close();await browser.close();browser=null;completed++;
  await fs.writeFile(path.join(folder,`restore-result-${viewport.width}.json`),JSON.stringify({viewport,restoreV4:true,restoreV3:true,historyUnchanged:true,pageErrors:0,sourceData:'SYNTHETIC_TEST_ONLY'},null,2));
 }
 const result={browser:'Chromium',viewports:completed,sourceData:'SYNTHETIC_TEST_ONLY',realOddsCalls:0,historyUnchanged:true,
   tested:restoreOnly?['restore_v4','restore_v3','desktop_mobile_restored_ui']:['simulation','no_bet','inactive_override','different_combined_price','tamper_rejection','reload_persistence','public_receipt','backup_v4','restore_v4','restore_v3','desktop_mobile_ui'],deviceAndroid:false,scope:restoreOnly?'resume_restore_only':'full_synthetic_ui'};
 await fs.writeFile(path.join(folder,restoreOnly?'restore-result.json':'browser-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();server?.kill();}
