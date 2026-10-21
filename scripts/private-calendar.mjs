#!/usr/bin/env node
import {ROOT} from './lib/private-store.mjs';
import {collectPrivateCalendar} from './lib/orchestration/calendar-collection.mjs';
import {parseArgs} from 'node:util';
let values;try{({values}=parseArgs({strict:true,options:{refresh:{type:'boolean'},'max-age-minutes':{type:'string'},help:{type:'boolean'}}}));}catch{values={};}
const minutes=values['max-age-minutes']===undefined?1440:Number(values['max-age-minutes']);
if(values.help)console.log('--refresh [--max-age-minutes 1..1440]. Una nuova raccolta consuma una richiesta conteggiata; nessuna quota o previsione. G8 freeze richiede cache entro60 minuti.');
else if(!values.refresh||!Number.isInteger(minutes)||minutes<1||minutes>1440){
 console.error('Usare --refresh [--max-age-minutes 1..1440]. Richiede autorizzazione provider separata.');process.exitCode=1;
}else{
  collectPrivateCalendar({root:ROOT,maxAgeMs:minutes*60000}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    console.error(/^CALENDAR_[A-Z_]+$/.test(error.code??'')?error.code:'CALENDAR_COLLECTION_FAILED');process.exitCode=1;
  });
}
