#!/usr/bin/env node
// Explicit manual audit; default is local-only. No scheduler or delivery mode.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ROOT} from './lib/private-store.mjs';
import {windowsVault} from './lib/private/windows-vault.mjs';
import {privateChannelPaths} from './lib/private/channels.mjs';
import {readOutbox,privateLock} from './lib/private/outbox.mjs';
import {createPrivateAuth} from '../shared/private-auth.mjs';
import {createPrivateCloud} from '../shared/private-cloud.mjs';
import {auditPrivateTransport} from './lib/private/transport-audit.mjs';
const {values}=parseArgs({strict:true,options:{help:{type:'boolean'},local:{type:'boolean'},cloud:{type:'boolean'},channel:{type:'string'},'delivery-id':{type:'string'}}});
async function main(){
 if(values.help){console.log('Manual read-only transport audit: [--local | --cloud] [--channel shadow|synthetic_shadow] [--delivery-id HASH]. Default local: no network. Cloud: 3 Firestore GET, or 4 with ID; normal existing Auth session refresh may update its DPAPI cache. No queue, publish, FCM, ACK write, ADB or config changes.');return;}
 if(values.local&&values.cloud)throw Error('TRANSPORT_AUDIT_CHOOSE_ONE_MODE');
 const paths=privateChannelPaths(ROOT,values.channel??'shadow'),stored=await windowsVault(paths.writer).load();
 if(!stored||stored.config.channel!==stored.profile.trust.channel||stored.config.channel!==(values.channel??'shadow')
  ||stored.config.projectId!==stored.profile.projectId||stored.config.readerUid!==stored.profile.trust.readerUid)throw Error('TRANSPORT_AUDIT_PAIRING_MISMATCH');
 const records=await readOutbox(paths.outbox,stored.profile.trust),shadowPrepared=await fs.stat(privateChannelPaths(ROOT,'shadow').writer).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
 let cloud=null;
 if(values.cloud){
  const auth=createPrivateAuth({apiKey:stored.config.apiKey,expectedUid:stored.config.writerUid},windowsVault(paths.session));
  const client=createPrivateCloud(stored.config,{getIdToken:()=>privateLock(path.join(paths.base,'shared-auth'),()=>auth.getIdToken())});
  cloud={device:id=>client.device(id),head:()=>client.head(),ack:id=>client.ack(id),event:n=>client.event(n)};
 }
 console.log(JSON.stringify(await auditPrivateTransport({profile:stored.profile,records,shadowPrepared,cloud,deliveryId:values['delivery-id']??null}),null,2));
}
main().catch(error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:Number.isInteger(error.status)?`TRANSPORT_AUDIT_HTTP_${error.status}`:'TRANSPORT_AUDIT_STOPPED_NO_DELIVERY_EXECUTED');process.exitCode=1;});
