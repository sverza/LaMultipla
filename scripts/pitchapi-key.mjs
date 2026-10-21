import {installPitchKey,inspectPitchKey} from './lib/private/pitch-key.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
 const args=process.argv.slice(2);
 if(args.length!==1||!['--install','--verify'].includes(args[0]))throw Error('PITCH_KEY_USAGE_INSTALL_OR_VERIFY');
 console.log(JSON.stringify(await (args[0]==='--install'?installPitchKey(root):inspectPitchKey(root))));
}catch(error){
 // Never forward a child error, credential, payload or argv to the console.
 console.error(/^PITCH_KEY_[A-Z_]+$/.test(error.message)?error.message:'PITCH_KEY_LOCAL_OPERATION_FAILED');process.exitCode=1;
}
