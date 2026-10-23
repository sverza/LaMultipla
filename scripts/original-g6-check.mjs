#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {ROOT} from './lib/private-store.mjs';
import {inspectOriginalG6,recordOriginalG6} from './lib/prospective/original-check.mjs';
import {inspectG6CheckHistory} from './lib/audit/g6-check-history.mjs';
const {values}=parseArgs({options:{inspect:{type:'boolean'},record:{type:'boolean'}},strict:true});
(async()=>{
  if(Number(Boolean(values.inspect))+Number(Boolean(values.record))!==1)throw new Error('Choose inspect or record');
  if(values.inspect){const original=await inspectOriginalG6(ROOT);return {...original.summary,...await inspectG6CheckHistory(ROOT,original)};}
  const result=await recordOriginalG6(ROOT);return {status:result.record.status,counts:result.record.counts,recordFile:result.recordFile,
    resultsFile:result.resultsFile,evaluationFile:result.evaluationFile,originalForecastUnchanged:true};
})().then(v=>console.log(JSON.stringify(v,null,2))).catch(error=>{
  console.error(error.message==='G6_NOT_DUE'?'Valutazione bloccata fino al 15 ottobre Europe/Rome; nessuna acquisizione o scrittura.':
    'Controllo G6 non completato: verificare integrità, fonte e intenti privati. Nessun originale sovrascritto.');process.exitCode=1;
});
