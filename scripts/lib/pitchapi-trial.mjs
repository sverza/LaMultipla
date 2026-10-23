import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {privateLock} from './private/process-lock.mjs';
import {writeExclusive,readSnapshot,digest} from './prospective/store.mjs';

export const PITCH_BASE='https://api.pitchapi.dev';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const id=kind=>new RegExp('^'+kind+'_[A-Za-z0-9]{6}$');
const fail=code=>new Error('PITCH_TRIAL_'+code);
const exists=async file=>{try{await fs.access(file);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};

export function pitchRequestKind(value){
 let url;try{url=new URL(value);}catch{throw fail('ENDPOINT_REFUSED');}
 if(url.origin!==PITCH_BASE||url.username||url.password||url.hash)throw fail('ENDPOINT_REFUSED');
 if(url.pathname==='/v1/leagues'&&!url.search)return 'catalog';
 if(/^\/v1\/leagues\/l_[A-Za-z0-9]{6}\/matches$/.test(url.pathname)){
  const p=[...url.searchParams];
  if(p.length===2&&p.filter(([k])=>k==='season').length===1&&p.filter(([k])=>k==='status').length===1
   &&['2026/2027','2025/2026','2024/2025'].includes(url.searchParams.get('season'))&&url.searchParams.get('status')==='played')return 'season';
 }
 if(/^\/v1\/matches\/m_[A-Za-z0-9]{6}\/(stats|events|players)$/.test(url.pathname)&&!url.search)return 'detail';
 throw fail('ENDPOINT_REFUSED');
}

// One explicit invocation = at most one transmission. Durable intents count
// against the global budget even if the process never received a response.
export async function acquirePitchTrial({directory,grant,url,keyLoader,fetchImpl=fetch,clock=()=>new Date()}){
 const now=clock();
 if(grant?.schema!=='lamultipla-pitchapi-trial-grant-v1'||grant.authorized!==true||grant.maxRequests!==12
  ||grant.scope!=='PRIVATE_DIAGNOSTIC_ONLY'||grant.retention!=='TEMPORARY_REVIEW_ONLY'
  ||!Number.isFinite(Date.parse(grant.approvedAtUtc))||Date.parse(grant.approvedAtUtc)>now.getTime()
  ||now.getTime()-Date.parse(grant.approvedAtUtc)>86400000)throw fail('EXPLICIT_GRANT_REQUIRED');
 const kind=pitchRequestKind(url),token=hash(url),grantSha256=digest(grant);
 return privateLock(directory,async()=>{
  const entries=(await fs.readdir(directory)).filter(n=>/^[a-f0-9]{64}\.intent\.json$/.test(n));
  const previous=[];
  for(const entry of entries){
   const intent=await readSnapshot(path.join(directory,entry));
   if(intent.grantSha256!==grantSha256)throw fail('GRANT_CHANGED');
   const receiptFile=path.join(directory,entry.replace('.intent.','.receipt.'));
   if(!await exists(receiptFile))throw fail('AMBIGUOUS_NO_RETRY');
   const receipt=await readSnapshot(receiptFile),raw=await fs.readFile(path.join(directory,entry.replace('.intent.json','.response.private.json')));
   if(receipt.grantSha256!==grantSha256||receipt.url!==intent.url||receipt.rawSha256!==hash(raw))throw fail('SNAPSHOT_CHANGED');
   if(!receipt.applicationSuccess)throw fail('PREVIOUS_FAILURE_STOP');
   previous.push({intent,receipt,raw});
  }
  const old=previous.find(p=>p.intent.url===url);
  if(old)return {...old.receipt,reused:true};
  if(entries.length>=grant.maxRequests)throw fail('BUDGET_EXHAUSTED');
  if(previous.filter(p=>p.intent.kind===kind).length>=({catalog:1,season:2,detail:9}[kind]))throw fail('ENDPOINT_BUDGET_EXHAUSTED');
  const key=await keyLoader();
  if(typeof key!=='string'||!key||key.length>4096||/[\s\u0000-\u001f\u007f]/u.test(key))throw fail('KEY_INVALID');
  await writeExclusive(path.join(directory,token+'.intent.json'),{schema:'lamultipla-pitchapi-trial-intent-v1',url,kind,grantSha256,startedAtUtc:now.toISOString(),ordinal:entries.length+1});
  try{
   const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{'X-API-KEY':key,'User-Agent':'LaMultipla-private-diagnostic/1.0','Accept':'application/json'},signal:AbortSignal.timeout(25000)});
   const chunks=[];let size=0;
   for await(const chunk of response.body??[]){size+=chunk.length;if(size>8*1024*1024)throw fail('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
   const raw=Buffer.concat(chunks);
   if(raw.includes(Buffer.from(key)))throw fail('UNSAFE_RESPONSE');
   let parsed;try{parsed=JSON.parse(raw.toString('utf8'));}catch{parsed=null;}
   const applicationSuccess=response.status===200&&parsed!==null&&typeof parsed==='object'&&Object.hasOwn(parsed,'data')&&!Object.hasOwn(parsed,'error');
   const code=parsed?.error?.code;
   const receipt={schema:'lamultipla-pitchapi-trial-receipt-v1',url,status:response.status,contentType:response.headers.get('content-type'),
    applicationSuccess,applicationCode:typeof code==='string'&&/^[A-Z_]{1,80}$/.test(code)?code:null,
    acquiredAtUtc:clock().toISOString(),rawSha256:hash(raw),bytes:raw.length,grantSha256,ordinal:entries.length+1,
    retention:grant.retention,trainingEligible:false,providerDate:response.headers.get('date'),retryAfter:response.headers.get('retry-after')};
   if(JSON.stringify(receipt).includes(key))throw fail('UNSAFE_RESPONSE');
   await fs.writeFile(path.join(directory,token+'.response.private.json'),raw,{flag:'wx',mode:0o600});
   await writeExclusive(path.join(directory,token+'.receipt.json'),receipt);
   return receipt;
  }catch{throw fail('STOPPED_NO_AUTOMATIC_RETRY');}
 });
}

export async function readPitchResponse(directory,url){
 pitchRequestKind(url);const token=hash(url),receipt=await readSnapshot(path.join(directory,token+'.receipt.json'));
 const raw=await fs.readFile(path.join(directory,token+'.response.private.json'));
 if(receipt.url!==url||receipt.rawSha256!==hash(raw)||!receipt.applicationSuccess)throw fail('RESPONSE_UNAVAILABLE_OR_CHANGED');
 return JSON.parse(raw.toString('utf8')).data;
}

export function selectPitchLeague(data){
 if(!Array.isArray(data?.leagues))throw fail('CATALOG_SCHEMA');
 const found=data.leagues.filter(l=>l.name==='Serie A'&&l.country_code==='ITA');
 if(found.length!==1||!id('l').test(found[0].id)||found[0].is_free!==true||!Array.isArray(found[0].seasons))throw fail('SERIE_A_IDENTITY_OR_FREE_UNVERIFIED');
 if(!found[0].seasons.includes('2026/2027'))throw fail('CURRENT_SEASON_UNAVAILABLE');
 return found[0];
}

// Explicit aliases supplied by the caller are audited input. Never fuzzy match.
export function matchPitchFixture(data,{leagueId,season,event,aliases={}}){
 if(data?.league?.id!==leagueId||data.league.season!==season||!Array.isArray(data.matches))throw fail('SEASON_IDENTITY');
 const ids=data.matches.map(m=>m.id);
 if(ids.some(n=>!id('m').test(n))||new Set(ids).size!==ids.length)throw fail('DUPLICATE_OR_INVALID_FIXTURE_IDS');
 const name=value=>Object.hasOwn(aliases,value)?aliases[value]:value;
 const found=data.matches.filter(m=>name(m.home_team?.name)===event.home&&name(m.away_team?.name)===event.away);
 if(found.length!==1)throw fail('FIXTURE_MISSING_OR_AMBIGUOUS');
 const m=found[0];
 if(!id('t').test(m.home_team?.id)||!id('t').test(m.away_team?.id)||m.home_team.id===m.away_team.id
  ||!Number.isFinite(Date.parse(m.time_utc))||Date.parse(m.time_utc)!==Date.parse(event.kickoffUtc))throw fail('FIXTURE_IDENTITY_OR_KICKOFF');
 if(m.status!=='finished'||![m.score_home,m.score_away].every(n=>Number.isInteger(n)&&n>=0))throw fail('FIXTURE_NOT_FINISHED');
 return m;
}
