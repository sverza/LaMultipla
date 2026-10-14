import {createPrivateKey,sign} from 'node:crypto';
const OAUTH='https://oauth2.googleapis.com/token',SCOPE='https://www.googleapis.com/auth/firebase.messaging';
export function validateFcmCredential(value,projectId){
  if(value?.type!=='service_account'||value.project_id!==projectId
    ||typeof value.client_email!=='string'||!value.client_email.endsWith('@'+projectId+'.iam.gserviceaccount.com')
    ||typeof value.private_key!=='string'||value.token_uri!==OAUTH)throw new Error('Credenziale FCM non valida per il progetto');
  const key=createPrivateKey(value.private_key);
  if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw new Error('Chiave FCM RSA non valida');
  return {client_email:value.client_email,project_id:projectId,private_key:value.private_key,type:'service_account',token_uri:OAUTH};
}
export function createFcmNotifier({credential,projectId,deviceId,applicationId,readerUid,cloud,fetchImpl=fetch,clock=()=>Date.now()}){
  credential=validateFcmCredential(credential,projectId);let session,refreshing;
  async function request(url,body,headers){
    let response;try{response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers,body});}
    catch{throw new Error('Trasporto FCM indisponibile');}
    if(!response.ok)throw new Error('FCM HTTP '+response.status);
    const text=await response.text();if(text.length>32768)throw new Error('Risposta FCM troppo grande');
    try{return JSON.parse(text);}catch{throw new Error('Risposta FCM non valida');}
  }
  async function token(){
    if(session?.expiresAt>clock()+60000)return session.token;
    refreshing??=(async()=>{
      const seconds=Math.floor(clock()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:credential.client_email,scope:SCOPE,aud:OAUTH,iat:seconds,exp:seconds+3600});
      const assertion=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),credential.private_key).toString('base64url');
      const data=await request(OAUTH,new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString(),{'Content-Type':'application/x-www-form-urlencoded'});
      if(typeof data.access_token!=='string'||!data.access_token||data.token_type!=='Bearer'||!Number.isFinite(data.expires_in)||data.expires_in<120||data.expires_in>3600)throw new Error('Sessione FCM non valida');
      session={token:data.access_token,expiresAt:clock()+data.expires_in*1000};return session.token;
    })().finally(()=>{refreshing=null;});return refreshing;
  }
  return async frame=>{
    const statement=JSON.parse(frame.statement),remaining=Math.floor((Date.parse(statement.expiresAtUtc)-clock())/1000);
    if(remaining<=0)throw new Error('Avviso scaduto');
    if(statement.applicationId!==applicationId||statement.readerUid!==readerUid)throw new Error('Destinatario FCM non valido');
    const device=await cloud.device(deviceId);
    if(!device||device.applicationId!==applicationId||typeof device.fcmToken!=='string'||device.fcmToken.length<20||device.fcmToken.length>4096)throw new Error('Dispositivo non abbinato');
    // Signed metadata only. The authenticated Firestore path carries the package.
    const message={token:device.fcmToken,data:{statement:frame.statement,signature:frame.signature},android:{priority:'HIGH',ttl:Math.min(remaining,86400)+'s',restricted_package_name:applicationId}};
    if(Buffer.byteLength(JSON.stringify(message.data))>3500)throw new Error('Avviso FCM troppo grande');
    const data=await request('https://fcm.googleapis.com/v1/projects/'+projectId+'/messages:send',JSON.stringify({message}),{'Content-Type':'application/json',Authorization:'Bearer '+await token()});
    if(typeof data.name!=='string'||!data.name.startsWith('projects/'+projectId+'/messages/'))throw new Error('Accettazione FCM non valida');
    return {accepted:true,deviceAcknowledged:false};
  };
}
