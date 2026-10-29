import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {privateLock} from './private/process-lock.mjs';
import {writeExclusive,readSnapshot,digest} from './prospective/store.mjs';
import {reviewPitchAdvanced} from './pitchapi-advanced.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>new Error('PITCH_ADVANCED_'+code);
const exists=async file=>{try{await fs.access(file);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
const urlFor=id=>'https://api.pitchapi.dev/v1/matches/'+id+'/advanced';

function validate(grant){
 if(grant?.schema!=='lamultipla-pitchapi-advanced-grant-v1'||grant.authorized!==true||grant.maxRequests!==18
  ||grant.scope!=='PRIVATE_TEAM_ADVANCED_DIAGNOSTIC_ONLY'||grant.retention!=='PRIVATE_USER_CONFIRMED'
  ||!/^[a-f0-9]{64}$/.test(grant.proposalSha256)||!Number.isFinite(Date.parse(grant.approvedAtUtc))
  ||!Array.isArray(grant.requests)||grant.requests.length!==18||new Set(grant.requests.map(r=>r.url)).size!==18
  ||!grant.requests.every(r=>/^m_[A-Za-z0-9]{6}$/.test(r.fixture?.id)&&r.url===urlFor(r.fixture.id)
   &&r.fixture.status==='finished'&&Number.isFinite(Date.parse(r.fixture.time_utc))
   &&[r.fixture.home_team,r.fixture.away_team].every(t=>/^t_[A-Za-z0-9]{6}$/.test(t?.id)&&typeof t.name==='string'&&t.name.length>0)
   &&r.fixture.home_team.id!==r.fixture.away_team.id))throw fail('EXACT_GRANT_REQUIRED');
}
async function entry(directory,token,grant){
 const intent=await readSnapshot(path.join(directory,token+'.intent.json'));
 if(intent.grantSha256!==digest(grant)||hash(intent.url)!==token||!grant.requests.some(r=>r.url===intent.url))throw fail('INTENT_CHANGED');
 if(!await exists(path.join(directory,token+'.receipt.json')))throw fail('AMBIGUOUS_NO_RETRY');
 const receipt=await readSnapshot(path.join(directory,token+'.receipt.json'));
 const raw=await fs.readFile(path.join(directory,token+'.response.private.json'));
 if(receipt.url!==intent.url||receipt.grantSha256!==intent.grantSha256||receipt.rawSha256!==hash(raw))throw fail('SNAPSHOT_CHANGED');
 let body;try{body=JSON.parse(raw.toString('utf8'));}catch{body=null;}
 const request=grant.requests.find(r=>r.url===intent.url);
 const review=reviewPitchAdvanced({fixture:request.fixture,status:receipt.status,body,observedAtUtc:receipt.acquiredAtUtc});
 if(!/^application\/json(?:\s*;|$)/i.test(receipt.contentType??'')){review.classification='CONTENT_TYPE_ERROR';review.canContinue=false;}
 if(digest(review)!==digest(receipt.review))throw fail('REVIEW_CHANGED');
 return {receipt,body};
}

// Dedicated, single-grant eighteen-call ledger; older trials and their grants
// stay immutable. Only expected coverage absence permits another transmission.
export async function acquirePitchAdvanced({directory,grant,url,keyLoader,fetchImpl=fetch,clock=()=>new Date()}){
 validate(grant);const at=clock().getTime(),request=grant.requests.find(r=>r.url===url);
 if(!request||!Number.isFinite(at)||at<Date.parse(grant.approvedAtUtc)||at-Date.parse(grant.approvedAtUtc)>86400000||Date.parse(request.fixture.time_utc)>=at)throw fail('GRANT_OR_WINDOW_INVALID');
 return privateLock(directory,async()=>{
  const grantFile=path.join(directory,'grant.json');
  if(await exists(grantFile)){if(digest(await readSnapshot(grantFile))!==digest(grant))throw fail('GRANT_CHANGED_NO_RENEWAL');}
  else await writeExclusive(grantFile,grant);
  const names=(await fs.readdir(directory)).filter(n=>/^[a-f0-9]{64}\.intent\.json$/.test(n));
  const previous=[];
  for(const name of names){const old=await entry(directory,name.slice(0,64),grant);if(!old.receipt.review.canContinue)throw fail('PREVIOUS_FAILURE_STOP');previous.push(old.receipt);}
  const existing=previous.find(r=>r.url===url);if(existing)return {...existing,reused:true};
  if(names.length>=18)throw fail('BUDGET_EXHAUSTED');
  // Enforce frozen order as well as membership; an interrupted request cannot
  // be skipped by requesting a different fixture on a subsequent invocation.
  if(grant.requests[names.length].url!==url)throw fail('REQUEST_ORDER_INVALID');
  const key=await keyLoader();if(typeof key!=='string'||!key||key.length>4096||/[\s\u0000-\u001f\u007f]/u.test(key))throw fail('KEY_INVALID');
  const token=hash(url),grantSha256=digest(grant);
  await writeExclusive(path.join(directory,token+'.intent.json'),{url,grantSha256,ordinal:names.length+1,startedAtUtc:clock().toISOString()});
  try{
   const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{'X-API-KEY':key,Accept:'application/json','User-Agent':'LaMultipla-team-advanced-diagnostic/1.0'},signal:AbortSignal.timeout(25000)});
   const chunks=[];let size=0;
   for await(const chunk of response.body??[]){size+=chunk.length;if(size>8*1024*1024)throw fail('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
   const raw=Buffer.concat(chunks);if(raw.includes(Buffer.from(key)))throw fail('UNSAFE_RESPONSE');
   let body;try{body=JSON.parse(raw.toString('utf8'));}catch{body=null;}
   const acquiredAtUtc=clock().toISOString(),contentType=response.headers.get('content-type');
   const review=reviewPitchAdvanced({fixture:request.fixture,status:response.status,body,observedAtUtc:acquiredAtUtc});
   if(!/^application\/json(?:\s*;|$)/i.test(contentType??'')){review.classification='CONTENT_TYPE_ERROR';review.canContinue=false;}
   const result={schema:'lamultipla-pitchapi-advanced-receipt-v1',url,grantSha256,ordinal:names.length+1,status:response.status,contentType,
    acquiredAtUtc,rawSha256:hash(raw),bytes:raw.length,providerDate:response.headers.get('date'),retryAfter:response.headers.get('retry-after'),review,
    retention:grant.retention,trainingEligible:false};
   if(JSON.stringify(result).includes(key))throw fail('UNSAFE_RESPONSE');
   await fs.writeFile(path.join(directory,token+'.response.private.json'),raw,{flag:'wx',mode:0o600});
   await writeExclusive(path.join(directory,token+'.receipt.json'),result);return result;
  }catch{throw fail('STOPPED_NO_AUTOMATIC_RETRY');}
 });
}

export async function readPitchAdvancedResponse(directory,url){
 const grant=await readSnapshot(path.join(directory,'grant.json'));validate(grant);
 if(!grant.requests.some(r=>r.url===url))throw fail('ENDPOINT_REFUSED');
 return entry(directory,hash(url),grant);
}
