#!/usr/bin/env node
import {ROOT} from './lib/private-store.mjs';
import {installOddsKey,inspectOddsKey} from './lib/private/odds-key.mjs';
async function main(){
  if(process.argv.length!==3||!['--install','--inspect'].includes(process.argv[2]))throw new Error('Uso: --install oppure --inspect');
  if(process.argv[2]==='--install'){
    console.log('Si apre la finestra OddsPapi. Incolla soltanto la chiave API; non la password Firebase. Nessuna richiesta API.');
    return installOddsKey(ROOT);
  }
  return inspectOddsKey(ROOT);
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
  console.error(/^PRIVATE_ODDS_KEY_[A-Z_]+$/.test(error.code??'')?error.code:'Configurazione privata interrotta; nessuna chiave stampata e nessuna richiesta API.');
  process.exitCode=1;
});
