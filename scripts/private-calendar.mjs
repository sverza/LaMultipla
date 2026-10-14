#!/usr/bin/env node
import {ROOT} from './lib/private-store.mjs';
import {collectPrivateCalendar} from './lib/orchestration/calendar-collection.mjs';
if(process.argv.length!==3||process.argv[2]!=='--refresh'){
  console.error('Usare --refresh: calendario privato, cache giornaliera, senza quote o forecast. Una raccolta nuova consuma una richiesta conteggiata.');process.exitCode=1;
}else{
  collectPrivateCalendar({root:ROOT}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    console.error(/^CALENDAR_[A-Z_]+$/.test(error.code??'')?error.code:'CALENDAR_COLLECTION_FAILED');process.exitCode=1;
  });
}
