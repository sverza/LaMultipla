import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadProspectiveDiagnostic} from './lib/mm-simulator-v1/prospective-reader.mjs';

// Manual, read-only local inspection. No as-of clock, synthetic override, output
// file, provider, scheduling, freeze, composition or authorization capability.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--input')throw Error('MM4_USAGE: node scripts/multimarket-read.mjs --input PRIVATE_INPUT.json');
  process.stdout.write(JSON.stringify(await loadProspectiveDiagnostic(process.cwd(),process.argv[3]),null,2)+'\n');
 }catch(e){process.stderr.write((/^MM4_[A-Z_]+(?::.*)?$/.test(e.message)?e.message:'MM4_ARCHIVE_REJECTED')+'\n');process.exitCode=1;}
}
