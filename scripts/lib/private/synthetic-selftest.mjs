// SYNTHETIC TEST ONLY. New fixtures; never retime existing or real snapshots.
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {syntheticDecisionBundle} from '../../../tests/fixtures/decision.mjs';
import {appPackage} from '../decision/app-package.mjs';
import {envelope,writeExclusive} from '../prospective/store.mjs';
import {parseDecisionEnvelope} from '../../../shared/decision-v4.mjs';

export function syntheticDeliveryCases(now=new Date()){
  const generatedAtUtc=new Date(now).toISOString();
  return ['simulation','no_value','missing_rules'].map((kind,index)=>{
    const bundle=syntheticDecisionBundle(kind,{now:generatedAtUtc,matchday:7+index});
    return {name:'SYNTHETIC-'+kind,bundle,envelope:envelope(appPackage(bundle))};
  });
}
export async function prepareSyntheticDeliveryBatch(directory,{now=new Date()}={}){
  const cases=syntheticDeliveryCases(now),batch=path.join(directory,randomUUID()),files=[];
  for(const item of cases){
    await parseDecisionEnvelope(item.envelope);
    const filename=path.join(batch,item.name+'.json');
    await writeExclusive(filename,item.envelope.payload);
    await writeExclusive(path.join(batch,item.name+'-audit.json'),item.bundle);
    files.push({name:item.name,file:filename,sha256:item.envelope.sha256,status:item.envelope.payload.status,
      shadowCause:item.envelope.payload.shadowCause,matchday:item.envelope.payload.round.matchday});
  }
  const result={purpose:'SYNTHETIC_PRIVATE_DELIVERY_TEST_ONLY',generatedAtUtc:cases[0].envelope.payload.generatedAtUtc,
    files,actualStakeEUR:0,apiRequests:0,publication:false,jobsEnabled:false,queued:false};
  await writeExclusive(path.join(batch,'batch.json'),result);
  return result;
}
