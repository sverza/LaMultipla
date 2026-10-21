import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {privateLock} from './private/process-lock.mjs';
import {writeExclusive,readSnapshot,digest} from './prospective/store.mjs';
import {pitchHistoryDiscoveryPlan} from './pitchapi-history-plan.mjs';

const hash=raw=>createHash('sha256').update(raw).digest('hex');
const fail=code=>new Error('PITCH_HISTORY_'+code);
const exists=async f=>{try{await fs.access(f);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
const discovery=pitchHistoryDiscoveryPlan().requests.map(r=>r.url);
function allowed(url){return discovery.includes(url)||/^https:\/\/api\.pitchapi\.dev\/v1\/matches\/m_[A-Za-z0-9]{6}\/(stats|lineups)$/.test(url);}
function validateGrant(grant){
 if(grant?.schema!=='lamultipla-pitchapi-history-grant-v1'||grant.authorized!==true||grant.maxTotalRequests!==30
  ||grant.scope!=='PRIVATE_DIAGNOSTIC_ONLY'||grant.retention!=='TEMPORARY_REVIEW_ONLY'
  ||!Array.isArray(grant.endpoints)||grant.endpoints.length<1||grant.endpoints.length>30
  ||grant.maxRequests!==grant.endpoints.length||new Set(grant.endpoints).size!==grant.endpoints.length
  ||!grant.endpoints.every(url=>typeof url==='string'&&allowed(url))||!Number.isFinite(Date.parse(grant.approvedAtUtc)))throw fail('EXPLICIT_GRANT_REQUIRED');
}
async function readEntry(directory,token){
 const intent=await readSnapshot(path.join(directory,token+'.intent.json'));
 const grant=await readSnapshot(path.join(directory,'grants',intent.grantSha256+'.json'));validateGrant(grant);
 if(digest(grant)!==intent.grantSha256||!grant.endpoints.includes(intent.url)||hash(intent.url)!==token)throw fail('GRANT_OR_INTENT_CHANGED');
 const receiptFile=path.join(directory,token+'.receipt.json');
 if(!await exists(receiptFile))throw fail('AMBIGUOUS_NO_RETRY');
 const receipt=await readSnapshot(receiptFile),raw=await fs.readFile(path.join(directory,token+'.response.private.json'));
 if(receipt.grantSha256!==intent.grantSha256||receipt.url!==intent.url||receipt.rawSha256!==hash(raw))throw fail('SNAPSHOT_CHANGED');
 return {intent,receipt,raw};
}

// One ledger across all separately approved phases. The original twelve-call
// trial is never extended, rewritten or charged to this thirty-call ceiling.
export async function acquirePitchHistory({directory,grant,url,keyLoader,fetchImpl=fetch,clock=()=>new Date()}){
 validateGrant(grant);const at=clock().getTime();
 if(!Number.isFinite(at)||Date.parse(grant.approvedAtUtc)>at||at-Date.parse(grant.approvedAtUtc)>86400000||!grant.endpoints.includes(url))throw fail('EXPLICIT_GRANT_REQUIRED');
 const window=grant.requestWindows?.[url];
 if(url.endsWith('/lineups')&&!window)throw fail('LINEUP_WINDOW_REQUIRED');
 if(window&&(!Number.isFinite(Date.parse(window.notBeforeUtc))||!Number.isFinite(Date.parse(window.notAfterUtc))
  ||Date.parse(window.notBeforeUtc)>=Date.parse(window.notAfterUtc)))throw fail('WINDOW_INVALID');
 if(window&&(at<Date.parse(window.notBeforeUtc)||at>=Date.parse(window.notAfterUtc)))throw fail('OUTSIDE_REQUEST_WINDOW');
 return privateLock(directory,async()=>{
  const entries=(await fs.readdir(directory)).filter(n=>/^[a-f0-9]{64}\.intent\.json$/.test(n));
  const previous=[];
  for(const name of entries){const old=await readEntry(directory,name.slice(0,64));
   if(!old.receipt.applicationSuccess)throw fail('PREVIOUS_FAILURE_STOP');previous.push(old);}
  const old=previous.find(p=>p.intent.url===url);if(old)return {...old.receipt,reused:true};
  if(entries.length>=30)throw fail('GLOBAL_BUDGET_EXHAUSTED');
  const grantSha256=digest(grant);
  if(previous.filter(p=>p.intent.grantSha256===grantSha256).length>=grant.maxRequests)throw fail('PHASE_BUDGET_EXHAUSTED');
  const key=await keyLoader();if(typeof key!=='string'||!key||key.length>4096||/[\s\u0000-\u001f\u007f]/u.test(key))throw fail('KEY_INVALID');
  const grantFile=path.join(directory,'grants',grantSha256+'.json');
  if(await exists(grantFile)){if(digest(await readSnapshot(grantFile))!==grantSha256)throw fail('GRANT_CHANGED');}else await writeExclusive(grantFile,grant);
  const token=hash(url);
  await writeExclusive(path.join(directory,token+'.intent.json'),{schema:'lamultipla-pitchapi-history-intent-v1',url,grantSha256,ordinal:entries.length+1,startedAtUtc:clock().toISOString()});
  try{
   const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{'X-API-KEY':key,Accept:'application/json','User-Agent':'LaMultipla-private-history-diagnostic/1.0'},signal:AbortSignal.timeout(25000)});
   const chunks=[];let size=0;
   for await(const chunk of response.body??[]){size+=chunk.length;if(size>8*1024*1024)throw fail('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
   const raw=Buffer.concat(chunks);if(raw.includes(Buffer.from(key)))throw fail('UNSAFE_RESPONSE');
   let body;try{body=JSON.parse(raw.toString('utf8'));}catch{body=null;}
   const code=body?.error?.code;
   const result={schema:'lamultipla-pitchapi-history-receipt-v1',url,grantSha256,ordinal:entries.length+1,status:response.status,
    contentType:response.headers.get('content-type'),applicationSuccess:response.status===200&&body!==null&&typeof body==='object'&&Object.hasOwn(body,'data')&&!Object.hasOwn(body,'error'),
    applicationCode:typeof code==='string'&&/^[A-Z_]{1,80}$/.test(code)?code:null,acquiredAtUtc:clock().toISOString(),rawSha256:hash(raw),bytes:raw.length,
    providerDate:response.headers.get('date'),retryAfter:response.headers.get('retry-after'),retention:grant.retention,trainingEligible:false};
   if(JSON.stringify(result).includes(key))throw fail('UNSAFE_RESPONSE');
   await fs.writeFile(path.join(directory,token+'.response.private.json'),raw,{flag:'wx',mode:0o600});
   await writeExclusive(path.join(directory,token+'.receipt.json'),result);return result;
  }catch{throw fail('STOPPED_NO_AUTOMATIC_RETRY');}
 });
}

export async function readPitchHistoryResponse(directory,url){
 if(typeof url!=='string'||!allowed(url))throw fail('ENDPOINT_REFUSED');
 const {receipt,raw}=await readEntry(directory,hash(url));if(!receipt.applicationSuccess)throw fail('RESPONSE_UNAVAILABLE');
 return JSON.parse(raw.toString('utf8')).data;
}
