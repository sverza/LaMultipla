import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {privateChannelPaths} from './channels.mjs';
import {privateLock,readOutbox} from './outbox.mjs';
import {digest,readSnapshot} from '../prospective/store.mjs';
import {unbase64url,textSha256} from '../../../shared/private-delivery.mjs';
import {createShadowTransition,verifyShadowTransition} from '../../../shared/private-transition.mjs';
export async function prepareShadowProfile({root,sourceVault,targetVault,now=new Date(),afterSave=async()=>{}}){
  const source=privateChannelPaths(root),target=privateChannelPaths(root,'shadow');
  const realRoot=await fs.realpath(root);
  for(const directory of [path.join(root,'.local'),source.directory]){
    const real=await fs.realpath(directory);if(path.relative(realRoot,real)!==path.relative(root,directory))throw new Error('Percorso privato non valido');
  }
  for(const directory of [path.dirname(target.directory),target.directory]){
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    if(path.relative(realRoot,await fs.realpath(directory))!==path.relative(root,directory))throw new Error('Percorso privato non valido');
  }
  return privateLock(source.directory,async()=>{
    const stored=await sourceVault.load();if(!stored||stored.profile.trust.channel!=='synthetic_shadow')throw new Error('Abbinamento sintetico esistente richiesto');
    const records=await readOutbox(source.outbox,stored.profile.trust,{now}),tip=records.at(-1);
    const cursor={sequence:records.length,deliveryHash:tip?.deliveryHash??null};
    if(tip){
      const receipt=await readSnapshot(path.join(source.orchestration,'receipts',digest(tip.frame)+'.json'));
      if(receipt.schema!=='lamultipla-delivery-pump-receipt-v1'||receipt.tipHash!==digest(tip.frame)||receipt.sequence!==records.length||receipt.acknowledged!==records.length
        ||!Number.isFinite(Date.parse(receipt.confirmedAtUtc))||Date.parse(receipt.confirmedAtUtc)>new Date(now).getTime())throw new Error('Consegne sintetiche ancora da confermare');
    }
    let next=await targetVault.load(),reused=Boolean(next);
    if(!next){
      const profile={...stored.profile,deviceId:randomUUID(),trust:{...stored.profile.trust,channel:'shadow'}};
      const key=await crypto.subtle.importKey('pkcs8',unbase64url(stored.privateKeyPkcs8),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
      const transition=await createShadowTransition({profile:stored.profile,nextProfile:profile,cursor,privateKey:key,now});
      next={config:{...stored.config,channel:'shadow'},profile,privateKeyPkcs8:stored.privateKeyPkcs8,transition};
      await targetVault.save(next); // save before export, never regenerate after crash
      await afterSave();
    }
    if(next.privateKeyPkcs8!==stored.privateKeyPkcs8||next.config.writerUid!==stored.config.writerUid||next.config.channel!=='shadow')throw new Error('Preparazione shadow incompatibile');
    const verified=await verifyShadowTransition(next.transition,{profile:stored.profile,cursor,now});
    if(digest(verified.profile)!==digest(next.profile))throw new Error('Preparazione shadow alterata');
    const filename=path.join(target.directory,'phone-shadow-transition.private.json'),serialized=JSON.stringify(next.transition,null,2)+'\n';
    const temporary=filename+'.'+randomUUID()+'.tmp';let handle;
    try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(serialized);await handle.sync();await handle.close();handle=null;
      try{await fs.link(temporary,filename);}catch(e){if(e.code!=='EEXIST'||await fs.readFile(filename,'utf8')!==serialized)throw e;}
    }finally{if(handle)await handle.close();await fs.rm(temporary,{force:true});}
    return {purpose:'PREPARE_PRIVATE_SHADOW_CHANNEL',reused,keyPreserved:true,syntheticArchivePreserved:true,confirmedSyntheticDeliveries:cursor.sequence,
      transitionFile:filename,transitionSha256:await textSha256(serialized),networkRequests:0,oddsApiRequests:0,receptionEnabled:false,tasksRegistered:false};
  });
}
