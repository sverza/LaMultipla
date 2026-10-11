import {registerPlugin} from '@capacitor/core';
import {isNative} from './native';
import {createPrivateAuth,type PrivateSession} from '../../shared/private-auth.mjs';
import {createPrivateCloud} from '../../shared/private-cloud.mjs';
import {validatePrivatePairing,type PrivatePairing} from '../../shared/private-pairing.mjs';
import {receiverScope,readPrivateCursor,readPrivateDeliveryInfo} from '../../shared/private-receiver.mjs';
import {receiveAndroidPrivate,type PrivateInboxBridge} from '../../shared/private-android-receiver.mjs';
export type PrivateStatus={backgroundEnabled:boolean;pending:number;lastFailure:string};
type PrivateBridge=PrivateInboxBridge&{
  applicationId:()=>Promise<{value:string}>;loadProfile:()=>Promise<{value:PrivatePairing|null}>;saveProfile:(v:{json:string})=>Promise<void>;
  loadSession:()=>Promise<{value:PrivateSession|null}>;saveSession:(v:{json:string})=>Promise<void>;
  status:()=>Promise<PrivateStatus>;setBackground:(v:{enabled:boolean})=>Promise<void>;fcmToken:()=>Promise<{value:string}>;
  notificationOpened:()=>Promise<{value:boolean}>;
};
const Native=registerPlugin<PrivateBridge>('LaMultiplaPrivate');
let client:Promise<Awaited<ReturnType<typeof createClient>>>|null=null,running:Promise<{received:number;pending:number;acknowledged:number;sequence:number}>|null=null;
async function createClient(){
  if(!isNative)throw new Error('Ricezione privata disponibile nell’APK Android');
  const {value:profile}=await Native.loadProfile();if(!profile)throw new Error('Abbinamento privato necessario');
  const auth=createPrivateAuth({apiKey:profile.apiKey,expectedUid:profile.trust.readerUid},{load:async()=>(await Native.loadSession()).value,save:async value=>Native.saveSession({json:JSON.stringify(value)})});
  const cloud=createPrivateCloud({projectId:profile.projectId,readerUid:profile.trust.readerUid,channel:profile.trust.channel},{getIdToken:auth.getIdToken});
  return {profile,auth,cloud,scope:await receiverScope({projectId:profile.projectId,readerUid:profile.trust.readerUid,channel:profile.trust.channel},profile.trust)};
}
const getClient=()=>client??=(createClient().catch(error=>{client=null;throw error;}));
export const privateStatus=()=>Native.status();
export const privateProfile=async()=>(await Native.loadProfile()).value;
export async function privateDeliveryInfo(){if(!isNative||!(await privateProfile()))return {};const c=await getClient();return readPrivateDeliveryInfo(c.scope,c.profile.trust);}
export async function pairPrivate(value:unknown,fingerprint:string){
  const profile=await validatePrivatePairing(value,(await Native.applicationId()).value,fingerprint);
  await Native.saveProfile({json:JSON.stringify(profile)});client=null;return profile;
}
export async function loginPrivate(email:string,password:string){const c=await getClient();await c.auth.signIn(email,password);}
export async function enablePrivate(enabled:boolean){
  await Native.setBackground({enabled});if(enabled){const c=await getClient();await c.cloud.registerDevice(c.profile.deviceId,(await Native.fcmToken()).value,c.profile.trust.applicationId);}
}
export async function logoutPrivate(){await Native.setBackground({enabled:false});const c=await getClient();await c.auth.signOut();client=null;}
export async function receivePrivate(onImported:()=>Promise<void>){
  if(!running)running=(async()=>{const c=await getClient();if((await Native.notificationOpened()).value&&(await readPrivateCursor(c.scope)).sequence>0)await onImported();return receiveAndroidPrivate({native:Native,cloud:c.cloud,scope:c.scope,trust:c.profile.trust,deviceId:c.profile.deviceId,onImported});})().finally(()=>{running=null;});
  return running;
}
