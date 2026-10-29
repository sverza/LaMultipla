#!/usr/bin/env node
// Review/delivery only. The unique analysis producer remains shadow.mjs.
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ROOT,loadJson} from './lib/private-store.mjs';
import {readSnapshot,writeExclusive,digest} from './lib/prospective/store.mjs';
import {appPackage} from './lib/decision/app-package.mjs';
import {privateHandoff,redactedReceipt,verifyDecisionBundle} from './lib/decision/delivery.mjs';
import {GENERAL_POLICY,obligations} from './lib/decision/policy.mjs';
import {settlementTemplate} from './lib/decision/gates.mjs';
const {values}=parseArgs({options:{help:{type:'boolean'},obligations:{type:'boolean'},template:{type:'boolean'},
  audit:{type:'boolean'},'app-package':{type:'boolean'},handoff:{type:'boolean'},receipt:{type:'boolean'},decision:{type:'string'},journal:{type:'string'},
  report:{type:'string'},study:{type:'string'},assessment:{type:'string'}},strict:true});
async function main(){
  if(values.help){console.log('Read-only: --obligations; --audit --decision FILE --journal FILE --report FILE --study FILE [--assessment FILE]');
    console.log('Private files: --template --report FILE; --app-package (private v4), --handoff or --receipt with the same complete audit inputs. No network/publication.');return;}
  if([values.obligations,values.template,values.audit,values['app-package'],values.handoff,values.receipt].filter(Boolean).length!==1)throw new Error('Choose one action');
  if(values.obligations){console.log(JSON.stringify(obligations(),null,2));return;}
  const directory=path.join(ROOT,'.local/decisions');
  if(values.template){if(!values.report)throw new Error('--report required');
    const report=await loadJson(values.report),output={schema:'lamultipla-selection-review-template-v1',reportSha256:digest(report),
      instruction:'Copy actual reviewed rules/evidence; blank fields never grant permission. No probabilities here.',
      estimates:report.selections.filter(q=>q.marketType==='1x2'&&q.period==='fulltime'&&q.marketName==='Full Time Result')
        .map(q=>({quoteId:q.quoteId,settlementVerification:settlementTemplate(report,q)}))};
    const filename=path.join(directory,'templates',digest(output)+'.json');await writeExclusive(filename,output);
    console.log('Template privato di liquidazione:',filename);return;}
  for(const k of ['decision','journal','report','study'])if(!values[k])throw new Error(`--${k} required`);
  const bundle={decision:await readSnapshot(values.decision),journal:await readSnapshot(values.journal),report:await loadJson(values.report),
    study:await loadJson(values.study),assessment:values.assessment?await loadJson(values.assessment):{}};
  const verification=verifyDecisionBundle(bundle);
  if(values.audit){console.log(JSON.stringify({verification,governance:bundle.decision.governance},null,2));return;}
  const output=values['app-package']?appPackage(bundle):values.handoff?privateHandoff(bundle):redactedReceipt(bundle);
  const filename=path.join(directory,values['app-package']?'app-v4':values.handoff?'handoffs':'receipts',digest(output)+'.json');await writeExclusive(filename,output);
  console.log('Pacchetto locale (nessuna pubblicazione):',filename);
  console.log(JSON.stringify({sha256:digest(output),generalProtocol:GENERAL_POLICY.version,decision:'NO_BET',
    cause:'MODEL_NOT_AUTHORIZED',actualStakeEUR:0,publicationAuthorized:false}));
}
main().catch(e=>{console.error('Decisione interrotta:',e.code==='EEXIST'?'Pacchetto già esistente; nessuna sovrascrittura':e.message);process.exitCode=1;});
