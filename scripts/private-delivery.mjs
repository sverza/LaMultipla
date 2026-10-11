#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {windowsVault} from './lib/private/windows-vault.mjs';
import {promptPrivateLogin} from './lib/private/login-prompt.mjs';
import {enqueueDelivery,flushOutbox,privateLock} from './lib/private/outbox.mjs';
import {base64url,unbase64url,keyFingerprint} from '../shared/private-delivery.mjs';
import {createPrivateCloud,validateCloudConfig} from '../shared/private-cloud.mjs';
import {createPrivateAuth} from '../shared/private-auth.mjs';
import {writeExclusive} from './lib/prospective/store.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),directory=path.join(root,'.local','private-delivery');
function arg(name){const i=process.argv.indexOf(name);if(i<0)return null;const v=process.argv[i+1];if(!v||v.startsWith('--'))throw new Error('Argomento richiesto: '+name);return path.resolve(v);}
async function main(){
  const vault=windowsVault(path.join(directory,'writer.dpapi.json'));
  const configPath=arg('--init');
  if(configPath){
    if(process.platform!=='win32')throw new Error('Inizializzazione consentita solo sul PC Windows');
    return privateLock(directory,async()=>{
      if(await vault.load())throw new Error('Associazione già presente: nessuna chiave sovrascritta');
      const config=JSON.parse(await fs.readFile(configPath,'utf8'));validateCloudConfig(config);
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(config.writerUid)||config.writerUid===config.readerUid
        ||typeof config.apiKey!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(config.apiKey)
        ||typeof config.mobileAppId!=='string'||!/^1:[0-9]+:android:[a-f0-9]+$/.test(config.mobileAppId)
        ||typeof config.senderId!=='string'||!/^\d+$/.test(config.senderId)
        ||config.applicationId!=='it.personale.lamultipla.collaudo'||config.channel!=='synthetic_shadow')throw new Error('Prima associazione: solo progetto e APK di collaudo sintetico');
      const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
      const spki=base64url(await crypto.subtle.exportKey('spki',pair.publicKey)),id=await keyFingerprint(spki);
      const trust={readerUid:config.readerUid,applicationId:config.applicationId,channel:config.channel,keys:{[id]:spki}};
      const profile={schema:'lamultipla-private-pairing-v1',projectId:config.projectId,apiKey:config.apiKey,mobileAppId:config.mobileAppId,senderId:config.senderId,
        deviceId:randomUUID(),trust};
      // Save key first. If pairing export fails, do not silently create a new key.
      await vault.save({config,profile,privateKeyPkcs8:base64url(await crypto.subtle.exportKey('pkcs8',pair.privateKey))});
      const filename=path.join(directory,'phone-pairing.private.json');
      await fs.writeFile(filename,JSON.stringify(profile,null,2)+'\n',{flag:'wx',mode:0o600});
      return {purpose:'SYNTHETIC_PRIVATE_PAIRING',keyFingerprint:id,pairingFile:filename,jobsEnabled:false};
    });
  }
  const stored=await vault.load();if(!stored)throw new Error('Associazione privata non configurata');
  const {config,profile}=stored,trust=profile.trust,outbox=path.join(directory,'outbox');
  if(process.argv.includes('--export-pairing')){
    const filename=path.join(directory,'phone-pairing.private.json');await fs.writeFile(filename,JSON.stringify(profile,null,2)+'\n',{flag:'wx',mode:0o600});
    return {pairingFile:filename};
  }
  const queue=arg('--queue');
  if(queue){const key=await crypto.subtle.importKey('pkcs8',unbase64url(stored.privateKeyPkcs8),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const input=JSON.parse(await fs.readFile(queue,'utf8')),generated=input.payload?.generatedAtUtc;
    // No clock override: an old/future forecast cannot be made timely by CLI.
    const kickoffs=(input.payload?.selections??[]).map(s=>Date.parse(s.identity.kickoffUtc)-5*60000);
    const expiry=new Date(Math.min(Date.parse(generated)+30*60000,...kickoffs)).toISOString();
    const result=await enqueueDelivery({directory:outbox,envelope:input,trust,privateKey:key,expiresAtUtc:expiry});
    return {sequence:result.record.statement.sequence,deliveryId:result.record.statement.deliveryId,reused:result.reused,actualStakeEUR:0};
  }
  const session=windowsVault(path.join(directory,'session.dpapi.json'));
  const auth=createPrivateAuth({apiKey:config.apiKey,expectedUid:config.writerUid},session);
  if(process.argv.includes('--login')){
    return privateLock(directory,()=>promptPrivateLogin(auth));
  }
  if(process.argv.includes('--flush')){
    const cloud=createPrivateCloud(config,{getIdToken:auth.getIdToken});
    const result=await privateLock(directory,()=>flushOutbox({directory:outbox,trust,cloud,deviceId:profile.deviceId}));
    const diagnostic=path.join(directory,'diagnostics',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'.json');
    await writeExclusive(diagnostic,{schema:'lamultipla-private-flush-v1',atUtc:new Date().toISOString(),...result});
    return {...result,notifications:'not_configured',jobsEnabled:false};
  }
  throw new Error('Usare --init, --export-pairing, --queue o --flush');
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
