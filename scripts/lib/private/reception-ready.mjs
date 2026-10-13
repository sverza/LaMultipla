import path from 'node:path';
import {windowsVault} from './windows-vault.mjs';
import {privateChannelPaths} from './channels.mjs';
import {privateLock} from './process-lock.mjs';
import {createPrivateAuth} from '../../../shared/private-auth.mjs';
import {createPrivateCloud} from '../../../shared/private-cloud.mjs';
export async function ensureShadowReception(root,{stored,cloud}={}){
  const paths=privateChannelPaths(root,'shadow');
  stored??=await windowsVault(paths.writer).load();
  if(stored?.config?.channel!=='shadow'||stored?.profile?.trust?.channel!=='shadow')throw Object.assign(new Error('PRIVATE_REAL_CHANNEL_NOT_CONFIGURED'),{code:'PRIVATE_REAL_CHANNEL_NOT_CONFIGURED'});
  if(!cloud){const auth=createPrivateAuth({apiKey:stored.config.apiKey,expectedUid:stored.config.writerUid},windowsVault(paths.session));
    cloud=createPrivateCloud(stored.config,{getIdToken:()=>privateLock(path.join(paths.base,'shared-auth'),()=>auth.getIdToken())});}
  const device=await cloud.device(stored.profile.deviceId);
  if(device?.applicationId!==stored.profile.trust.applicationId||typeof device?.fcmToken!=='string'||!device.fcmToken||device.fcmToken.length>4096)
    throw Object.assign(new Error('PRIVATE_SHADOW_RECEIVER_NOT_REGISTERED'),{code:'PRIVATE_SHADOW_RECEIVER_NOT_REGISTERED'});
  return {registered:true,actualStakeEUR:0,oddsApiRequests:0};
}
