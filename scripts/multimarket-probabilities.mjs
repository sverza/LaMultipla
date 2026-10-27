import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT} from './lib/private-store.mjs';
import {loadProbabilityDiagnostic} from './lib/mm-simulator-v1/probability-reader.mjs';
import {probabilityMarkdown} from './lib/mm-simulator-v1/probability-report.mjs';

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')process.stdout.write('node scripts/multimarket-probabilities.mjs --input PRIVATE_INPUT.json [--markdown]\nSolo lettura, nessuna API, fit, EV o composizione.\n');
  else{
   if(![2,3].includes(args.length)||args[0]!=='--input'||args.length===3&&args[2]!=='--markdown')throw Error('MM2_USAGE_INVALID');
   const report=await loadProbabilityDiagnostic(ROOT,path.resolve(args[1]));
   process.stdout.write(args[2]==='--markdown'?probabilityMarkdown(report):JSON.stringify(report,null,2)+'\n');
  }
 }catch(error){process.stderr.write((/^MM2?_[A-Z_]+$/.test(error.message)?error.message:'MM2_PRIVATE_INPUT_OR_FROZEN_REFERENCE_REJECTED')+'\n');process.exitCode=1;}
}
