// Optional browser integration: signed SYNTHETIC artifacts, loopback only, no phone.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {syntheticMultimarketApp} from './fixtures/multimarket-app.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=process.env.LAMULTIPLA_TEST_URL;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base??''))throw Error('LOOPBACK_STATIC_SERVER_REQUIRED');
const folder=path.resolve(process.env.LAMULTIPLA_MM_BROWSER_OUTPUT??'.local/e2e-multimarket');
if(!folder.startsWith(path.resolve('.local')+path.sep))throw Error('PRIVATE_OUTPUT_REQUIRED');
await fs.mkdir(folder,{recursive:true});
const s=await syntheticMultimarketApp(path.join(folder,'SYNTHETIC-fixtures'),{now:new Date().toISOString()});
for(const [name,data]of Object.entries({trust:s.trust,...s.frames}))await fs.writeFile(path.join(folder,name+'.json'),JSON.stringify(data),{flag:'wx'});
const tampered=structuredClone(s.frames.simulation);tampered.envelope.payload.actualStakeEUR=1;
await fs.writeFile(path.join(folder,'tampered.json'),JSON.stringify(tampered),{flag:'wx'});
let completed=0;
for(const width of [1280,390]){
 const browser=await chromium.launch({headless:true,...(process.env.LAMULTIPLA_CHROMIUM_PATH?{executablePath:process.env.LAMULTIPLA_CHROMIUM_PATH}:{})}),context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],blocked=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){blocked.push(url.hostname);return route.abort();}return route.continue();});
  await page.goto(base);await page.getByRole('button',{name:'Esperimento',exact:true}).click();
  assert.match(await page.locator('button.brand small').innerText(),/stake reale 0/);
  const section=page.getByTestId('multimarket-section');await section.waitFor();
  await page.getByTestId('mm-key-file').setInputFiles(path.join(folder,'trust.json'));await page.getByTestId('mm-message').filter({hasText:'Chiave pubblica abilitata'}).waitFor();
  for(const name of ['simulation','noBet','incomplete']){
   await page.getByTestId('mm-frame-file').setInputFiles(path.join(folder,name+'.json'));
   await page.getByTestId('multimarket-card').nth(completed%3).waitFor();completed++;
  }
  assert.equal(await page.getByTestId('multimarket-card').count(),3);
  const text=await section.innerText();for(const label of ['MULTIPLA ESPLORATIVA','NO BET ESPLORATIVO','ANALYSIS_INCOMPLETE','NON VERIFICATO','Non è un prezzo offerto.'])assert.ok(text.includes(label),label);
  await page.getByTestId('mm-frame-file').setInputFiles(path.join(folder,'simulation.json'));await page.getByTestId('mm-message').filter({hasText:'già presente'}).waitFor();
  await page.getByTestId('mm-frame-file').setInputFiles(path.join(folder,'tampered.json'));await page.getByTestId('mm-message').filter({hasText:'hash envelope alterato'}).waitFor();
  assert.equal(await page.getByTestId('multimarket-card').count(),3);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Esporta archivio multimercato',exact:true}).click();
  const saved=path.join(folder,`backup-${width}.json`);await(await download).saveAs(saved);
  await page.getByTestId('mm-backup-file').setInputFiles(saved);await page.getByTestId('mm-message').filter({hasText:'ripristinato senza sostituzioni'}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Esperimento',exact:true}).click();await page.getByTestId('multimarket-card').nth(2).waitFor();
  assert.equal(await page.getByTestId('multimarket-card').count(),3);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await page.getByTestId('multimarket-section').screenshot({path:path.join(folder,`mm-ui-${width}.png`)});
 }finally{await context.close();await browser.close();}
}
console.log(JSON.stringify({synthetic:true,viewports:2,states:3,signedImport:true,persistentReload:true,backupRestore:true,tamperRejected:true,duplicateRejected:true,providerRequests:0}));
