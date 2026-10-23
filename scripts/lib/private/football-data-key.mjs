import fs from 'node:fs/promises';
import path from 'node:path';
import {powershellMemory} from './windows-vault.mjs';
import {ODDS_KEY_DIALOG_SCRIPT,ODDS_KEY_DECRYPT_SCRIPT} from './odds-key.mjs';
const valid=v=>typeof v==='string'&&v.length>0&&v.length<=4096&&!/[\s\u0000-\u001f\u007f]/u.test(v);
// Windows PowerShell may inherit PSModulePath from a newer bundled runtime.
// Resolve its own Security module explicitly; never relax the execution policy.
export const FOOTBALL_SECURITY_IMPORT=String.raw`Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;`;
async function filename(root,create=false){if(process.platform!=='win32')throw Error('FOOTBALL_KEY_WINDOWS_REQUIRED');
 const base=await fs.realpath(path.join(root,'.local'));const dir=path.join(base,'football-data');if(create)await fs.mkdir(dir,{recursive:true,mode:0o700});
 if(await fs.realpath(dir)!==dir)throw Error('FOOTBALL_KEY_PATH_INVALID');return path.join(dir,'api-key.dpapi');}
export async function loadFootballDataKey(root,{run=powershellMemory}={}){
 const file=await filename(root);if((await fs.lstat(file)).isSymbolicLink()||await fs.realpath(file)!==file)throw Error('FOOTBALL_KEY_PATH_INVALID');
 const cipher=(await fs.readFile(file,'utf8')).trim();if(!/^[a-f0-9]{128,65536}$/i.test(cipher))throw Error('FOOTBALL_KEY_INVALID');
 const key=await run(FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DECRYPT_SCRIPT,cipher);if(!valid(key))throw Error('FOOTBALL_KEY_INVALID');return key;
}
export async function installFootballDataKey(root,{run=powershellMemory}={}){
 const file=await filename(root,true);try{await fs.access(file);throw Error('FOOTBALL_KEY_ALREADY_PRESENT');}catch(e){if(e.code!=='ENOENT')throw e;}
 const script=FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DIALOG_SCRIPT.replaceAll('OddsPapi','football-data.org');
 let result;try{result=JSON.parse(await run(script,'',{timeoutMs:300000,sta:true,showWindow:true}));}catch{throw Error('FOOTBALL_KEY_DIALOG_FAILED');}
 if(result?.cancelled)throw Error('FOOTBALL_KEY_CANCELLED');if(result?.invalid)throw Error('FOOTBALL_KEY_FORMAT_INVALID');
 if(!/^[a-f0-9]{128,65536}$/i.test(result?.ciphertext??''))throw Error('FOOTBALL_KEY_NOT_SAVED');
 if(!valid(await run(FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DECRYPT_SCRIPT,result.ciphertext)))throw Error('FOOTBALL_KEY_INVALID');
 await fs.writeFile(file,result.ciphertext+'\n',{flag:'wx',mode:0o600});return {encryptedOnDisk:true,networkRequests:0,providerValidated:false};
}
