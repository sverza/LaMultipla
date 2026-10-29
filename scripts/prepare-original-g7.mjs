#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {privateInput,validateAnalysisSchedule} from './lib/orchestration/analysis-plan.mjs';
import {validateRoundIdentity,timing} from './lib/orchestration/progressive-policy.mjs';
import {readRegistry} from './lib/shadow/registry.mjs';
import {digest} from './lib/prospective/store.mjs';

export async function prepareOriginalG7(root,{prepare=false,now=new Date()}={}){
  const legacyFile=await privateInput(root,'.local/orchestrator/plans/2026-27-round-07.private.json');
  const legacy=await loadJson(legacyFile);
  if(legacy.schema!=='lamultipla-private-analysis-plan-v1')throw new Error('G7_PLAN_INVALID');
  const scheduleFile=await privateInput(root,legacy.scheduleFile),studyFile=await privateInput(root,legacy.studyFile),schedule=await loadJson(scheduleFile);
  if(schedule.season!=='2026/27'||schedule.matchday!==7)throw new Error('G7_IDENTITY_INVALID');
  const identity=validateRoundIdentity(schedule);validateAnalysisSchedule(schedule,now);
  const registry=await readRegistry(root,studyFile,loadJson),config={schema:'lamultipla-progressive-manager-config-v1',studyFile,scheduleFiles:[scheduleFile],maxLegs:legacy.maxLegs??4};
  for(const key of ['contextFile','contextEvidenceFile','assessmentFile','combinedPricesFile']){
    if(legacy[key])config[key]=await privateInput(root,legacy[key]);
  }
  const first=Math.min(...schedule.events.map(e=>Date.parse(e.kickoffUtc))),at=new Date(now).getTime();
  const summary={schema:'lamultipla-original-g7-preparation-v1',checkedAtUtc:new Date(now).toISOString(),roundIdentitySha256:digest(identity),studyVerified:true,
    studyDatasetSha256:registry.study.datasetSha256,datasetLastResultDate:registry.dataset.rows.map(r=>r.date).sort().at(-1),
    officialConfirmationFresh:at-Date.parse(schedule.source.confirmedAtUtc)<=86400000,
    providerObservationFresh:at-Date.parse(schedule.source.providerObservedAtUtc)<=3600000,
    firstKickoffUtc:new Date(first).toISOString(),firstAnalysisOpenUtc:new Date(first-360*60000).toISOString(),
    firstAnalysisCloseUtc:new Date(first-150*60000).toISOString(),currentWindow:timing(schedule,now),
    missingContext:!config.contextFile&&!config.contextEvidenceFile,missingAssessment:!config.assessmentFile,missingCombinedPrices:!config.combinedPricesFile,
    newStateCloudAndClient:'NOT_VERIFIED_REQUIRES_AUTHORIZED_DEPLOY_AND_SAMSUNG_TEST',
    syntheticOrRealEndToEndVerified:false,configSha256:digest(config),preparedOnly:true,providerRequests:0,actualStakeEUR:0};
  if(prepare){
    const dir=path.join(root,'.local/preparation/g7',summary.configSha256);await fs.mkdir(dir,{recursive:true,mode:0o700});
    const filename=path.join(dir,'manager-config.private.json');
    try{await fs.writeFile(filename,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});}
    catch(e){if(e.code!=='EEXIST'||digest(await loadJson(filename))!==digest(config))throw e;}
    summary.configFile=filename;
  }
  return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  (async()=>{
    const {values}=parseArgs({options:{inspect:{type:'boolean'},prepare:{type:'boolean'}},strict:true});
    if(Number(Boolean(values.inspect))+Number(Boolean(values.prepare))!==1)throw new Error('Choose inspect or prepare');
    return prepareOriginalG7(ROOT,{prepare:values.prepare});
  })().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Preparazione G7 rifiutata: controllare piano, studio e calendario privati. Nessuna chiamata provider o attivazione.');process.exitCode=1;});
}
