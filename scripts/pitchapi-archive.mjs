import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './lib/private-store.mjs';
import {digest,readSnapshot} from './lib/prospective/store.mjs';
import {privateLock} from './lib/private/process-lock.mjs';
import {loadPitchKey} from './lib/private/pitch-key.mjs';
import {readPitchResponse} from './lib/pitchapi-trial.mjs';
import {readPitchHistoryResponse,acquirePitchArchive} from './lib/pitchapi-history-acquisition.mjs';
import {readPitchAdvancedResponse} from './lib/pitchapi-advanced-acquisition.mjs';
import {ARCHIVE_VERSION,archivePut,pitchBytesHash,pitchArchiveKind,importPitchArchiveResponse,rebuildPitchArchive,planPitchArchivePilot,validatePitchArchiveGrant} from './lib/pitchapi-team-archive.mjs';

const args=process.argv.slice(2),command=args.shift();
const options={};
for(let i=0;i<args.length;i+=2){if(!['--grant','--batch-size','--stats-per-season','--advanced-per-recent-season'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))throw Error('PITCH_ARCHIVE_ARGUMENT');options[args[i]]=args[i+1];}
const directory=path.join(ROOT,'.local','pitchapi','team-archive-v1');
async function safeDirectory(dir){
 const relative=path.relative(path.join(ROOT,'.local'),path.resolve(dir));
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('PITCH_ARCHIVE_PRIVATE_PATH_REQUIRED');
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 let current=path.resolve(dir);
 while(current!==ROOT){if(await fs.realpath(current)!==current)throw Error('PITCH_ARCHIVE_PATH_LINK_REFUSED');current=path.dirname(current);}
}
async function importExisting(){
 const sources=[['pitchapi-20261021/trial',readPitchResponse],['pitchapi-history-20261021/acquisition',readPitchHistoryResponse],['pitchapi-advanced-20261021/acquisition',readPitchAdvancedResponse]];
 let imported=0;
 for(const [relative,verify] of sources){const source=path.join(ROOT,'.local','preparation',relative);
  for(const name of (await fs.readdir(source)).sort().filter(n=>n.endsWith('.receipt.json'))){
   const receipt=await readSnapshot(path.join(source,name));
   if(!pitchArchiveKind(receipt.url)&&!receipt.url.includes('/matches?'))continue;
   await verify(source,receipt.url);
   const raw=await fs.readFile(path.join(source,name.replace('.receipt.json','.response.private.json')));
   const intent=await readSnapshot(path.join(source,name.replace('.receipt.','.intent.')));
   if(intent.url!==receipt.url||intent.grantSha256!==receipt.grantSha256)throw Error('PITCH_ARCHIVE_LEGACY_INTENT_CHANGED');
   await importPitchArchiveResponse({directory,receipt,raw,source:{receiptFile:path.relative(ROOT,path.join(source,name)),receiptSha256:digest(receipt),intent}});imported++;
  }
 }
 return imported;
}
function summary(result){return {viewSha256:result.sha,coverage:result.view.coverage.map(({season,listed,candidates,statsFixtures,advancedAvailable,advancedUnavailable})=>({season,listed,candidates,statsFixtures,advancedAvailable,advancedUnavailable})),revisions:result.view.revisions.length};}
async function run(){
 if(!['import-existing','rebuild','plan','run'].includes(command))throw Error('PITCH_ARCHIVE_COMMAND_import-existing_rebuild_plan_run');
 if(command!=='run'&&(options['--grant']||options['--batch-size']))throw Error('PITCH_ARCHIVE_ARGUMENT');
 if(command!=='plan'&&(options['--stats-per-season']||options['--advanced-per-recent-season']))throw Error('PITCH_ARCHIVE_ARGUMENT');
 await safeDirectory(directory);
 // One archive lock covers imports, views and acquisition; no second scheduler.
 return privateLock(directory,async()=>{
  if(command==='import-existing'){const imported=await importExisting();const result=await rebuildPitchArchive(directory);console.log(JSON.stringify({imported,networkRequests:0,...summary(result)}));return;}
  if(command==='rebuild'){console.log(JSON.stringify({networkRequests:0,...summary(await rebuildPitchArchive(directory))}));return;}
  if(command==='plan'){
   const {view,sha}=await rebuildPitchArchive(directory);
   const plan=planPitchArchivePilot({view,viewSha256:sha,createdAtUtc:new Date().toISOString(),statsPerSeason:Number(options['--stats-per-season']??8),advancedPerRecentSeason:Number(options['--advanced-per-recent-season']??4)});
   const file=path.join(directory,'plans',digest(plan)+'.json');await archivePut(file,plan);
   const manifest=['# PitchAPI historical team pilot — private exact manifest','',`Plan SHA256: ${digest(plan)}`,`Max requests: ${plan.maxRequests}; retries: 0; no replacements.`,'','| # | Season | Fixture | Kickoff UTC | GET |','|---|---|---|---|---|',...plan.requests.map((r,i)=>`| ${i+1} | ${r.season} | ${r.fixture.home_team.name} – ${r.fixture.away_team.name} (${r.fixture.id}) | ${r.fixture.time_utc} | ${r.url} |`)].join('\n')+'\n';
   const md=file.replace('.json','.private.md');try{await fs.writeFile(md,manifest,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;if(await fs.readFile(md,'utf8')!==manifest)throw e;}
   console.log(JSON.stringify({planSha256:digest(plan),planFile:file,manifestFile:md,maxRequests:plan.maxRequests,networkRequests:0}));return;
  }
  if(!options['--grant'])throw Error('PITCH_ARCHIVE_EXPLICIT_GRANT_REQUIRED');
  const grantFile=path.resolve(ROOT,options['--grant']);
  if(!grantFile.startsWith(path.join(ROOT,'.local')+path.sep)||await fs.realpath(grantFile)!==grantFile)throw Error('PITCH_ARCHIVE_PRIVATE_GRANT_REQUIRED');
  const grant=await readSnapshot(grantFile);validatePitchArchiveGrant(grant);
  const base=await readSnapshot(path.join(directory,'views',grant.plan.sourceViewSha256+'.json'));
  const rebuilt=planPitchArchivePilot({view:base,viewSha256:grant.plan.sourceViewSha256,createdAtUtc:grant.plan.createdAtUtc,statsPerSeason:grant.plan.statsPerSeason,advancedPerRecentSeason:grant.plan.advancedPerRecentSeason});
  if(digest(rebuilt)!==grant.planSha256)throw Error('PITCH_ARCHIVE_PLAN_CHANGED');
  const size=Number(options['--batch-size']??1);if(!Number.isSafeInteger(size)||size<1||size>60)throw Error('PITCH_ARCHIVE_BATCH_SIZE');
  const acquisition=path.join(directory,'acquisition');await safeDirectory(acquisition);
  let key=null,sent=0,reused=0,stopped=null;
  const known=await rebuildPitchArchive(directory),knownUrls=new Set(known.view.observations.map(o=>o.url));
  const checkpointDir=path.join(directory,'batches',digest(grant));
  for(const request of grant.plan.requests){
   if(sent>=size)break;
   try{
    const token=pitchBytesHash(request.url);
    // An old snapshot imported after planning also prevents a duplicate request.
    if(knownUrls.has(request.url)){try{await fs.access(path.join(acquisition,token+'.intent.json'));}catch{throw Error('PITCH_ARCHIVE_NEW_CACHE_REQUIRES_REPLAN');}}
    const receipt=await acquirePitchArchive({directory:acquisition,grant,url:request.url,keyLoader:async()=>key??=await loadPitchKey(ROOT)});
    if(receipt.reused)reused++;else sent++;
    if(receipt.review.canContinue){const raw=await fs.readFile(path.join(acquisition,token+'.response.private.json'));
     const savedReceipt=Object.fromEntries(Object.entries(receipt).filter(([k])=>k!=='reused'));
     await importPitchArchiveResponse({directory,receipt:savedReceipt,raw,source:{receiptFile:path.relative(ROOT,path.join(acquisition,token+'.receipt.json')),receiptSha256:digest(savedReceipt)}});}
    const checkpoint={schema:ARCHIVE_VERSION+'-checkpoint',grantSha256:digest(grant),ordinal:receipt.ordinal,url:receipt.url,rawSha256:receipt.rawSha256,receiptSha256:digest(Object.fromEntries(Object.entries(receipt).filter(([k])=>k!=='reused'))),classification:receipt.review.classification,canContinue:receipt.review.canContinue};
    await archivePut(path.join(checkpointDir,String(receipt.ordinal).padStart(3,'0')+'.json'),checkpoint);
    console.log(JSON.stringify({ordinal:receipt.ordinal,http:receipt.status,classification:receipt.review.classification,reused:receipt.reused??false}));
    if(!receipt.review.canContinue){stopped=receipt.review.classification;break;}
   }catch(e){stopped=/^PITCH_ARCHIVE_[A-Z_]+$/.test(e.message)?e.message:'PITCH_ARCHIVE_UNEXPECTED_LOCAL_FAILURE';break;}
  }
  key=null;
  const intents=(await fs.readdir(acquisition)).filter(n=>n.endsWith('.intent.json'));let consumed=0,received=0;
  for(const n of intents){const i=await readSnapshot(path.join(acquisition,n));if(i.grantSha256===digest(grant)){consumed++;try{await readSnapshot(path.join(acquisition,n.replace('.intent.','.receipt.')));received++;}catch(e){if(e.code!=='ENOENT')throw e;}}}
  const result=await rebuildPitchArchive(directory),report={schema:ARCHIVE_VERSION+'-run',observedAtUtc:new Date().toISOString(),grantSha256:digest(grant),newRequests:sent,reused,consumedIntents:consumed,receipts:received,ambiguous:consumed-received,pending:grant.plan.maxRequests-consumed,stopped,...summary(result)};
  await archivePut(path.join(checkpointDir,'runs',digest(report)+'.json'),report);console.log(JSON.stringify(report));if(stopped)process.exitCode=1;
 });
}
run().catch(e=>{console.error(/^PITCH_ARCHIVE_[A-Za-z_-]+$/.test(e.message)?e.message:'PITCH_ARCHIVE_LOCAL_FAILURE');process.exitCode=1;});
