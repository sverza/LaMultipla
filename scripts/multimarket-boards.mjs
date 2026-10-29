import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptOddsPapi} from './lib/mm-simulator-v1/oddspapi.mjs';
import {INPUT_SCHEMA,exactFields,parseSource,hashBytes} from './lib/mm-simulator-v1/contracts.mjs';

// Local files only. No output file, client, clock override, forecasting or delivery.
export async function loadOfflineBoards(filename){
 const bytes=await fs.readFile(filename),config=parseSource(bytes,{ref:filename,sha256:hashBytes(bytes)});
 if(!exactFields(config,['schema','source','bindings'])||config.schema!==INPUT_SCHEMA)throw Error('MM_INPUT_INVALID');
 const read=ref=>{if(typeof ref!=='string'||ref.includes('://'))throw Error('MM_LOCAL_FILE_REQUIRED');return fs.readFile(path.resolve(path.dirname(filename),ref));};
 const [rawBytes,catalogBytes,reportBytes]=await Promise.all([read(config.source?.raw?.ref),read(config.source?.catalog?.ref),read(config.source?.report?.ref)]);
 return adaptOddsPapi({rawBytes,catalogBytes,reportBytes,source:config.source,bindings:config.bindings});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==4||process.argv[2]!=='--input')throw Error('MM_USAGE: node scripts/multimarket-boards.mjs --input PRIVATE_INPUT.json');
  process.stdout.write(JSON.stringify(await loadOfflineBoards(path.resolve(process.argv[3])),null,2)+'\n');
 }catch(error){process.stderr.write((/^MM_[A-Z_]+(?::.*)?$/.test(error.message)?error.message:'MM_LOCAL_INPUT_REJECTED')+'\n');process.exitCode=1;}
}
