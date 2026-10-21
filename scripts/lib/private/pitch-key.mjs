import fs from 'node:fs/promises';
import path from 'node:path';
import {powershellMemory} from './windows-vault.mjs';
import {FOOTBALL_SECURITY_IMPORT} from './football-data-key.mjs';
import {ODDS_KEY_DIALOG_SCRIPT,ODDS_KEY_DECRYPT_SCRIPT} from './odds-key.mjs';

// Reuse the tested native GUI/CurrentUser DPAPI transport, never another
// provider's storage. No network, environment export or plaintext file.
export const PITCH_KEY_DIALOG_SCRIPT=FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DIALOG_SCRIPT.replaceAll('OddsPapi','PitchAPI');
const decryptScript=FOOTBALL_SECURITY_IMPORT+ODDS_KEY_DECRYPT_SCRIPT;
const validKey=v=>typeof v==='string'&&v.length>0&&v.length<=4096&&!/[\s\u0000-\u001f\u007f]/u.test(v);
const validCipher=v=>typeof v==='string'&&v.length%2===0&&/^[a-f0-9]{128,65536}$/i.test(v);
const fail=code=>new Error('PITCH_KEY_'+code);

async function filename(root,create=false){
 if(process.platform!=='win32')throw fail('WINDOWS_REQUIRED');
 const base=await fs.realpath(root),local=path.join(base,'.local');
 if(await fs.realpath(local)!==local)throw fail('PATH_INVALID');
 const dir=path.join(local,'pitchapi');
 if(create)await fs.mkdir(dir,{recursive:true,mode:0o700});
 if(await fs.realpath(dir)!==dir)throw fail('PATH_INVALID');
 const file=path.join(dir,'api-key.dpapi');
 try{if(!(await fs.lstat(file)).isFile()||await fs.realpath(file)!==file)throw fail('PATH_INVALID');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 return file;
}

export async function loadPitchKey(root,{run=powershellMemory}={}){
 const file=await filename(root);
 const cipher=(await fs.readFile(file,'utf8')).trim();
 if(!validCipher(cipher))throw fail('CIPHERTEXT_INVALID');
 let key;
 try{key=await run(decryptScript,cipher);}catch{throw fail('DECRYPT_FAILED');}
 if(!validKey(key))throw fail('FORMAT_INVALID');
 return key; // Memory only: authorized PitchAPI caller must never log this.
}

export async function inspectPitchKey(root,options={}){
 await loadPitchKey(root,options);
 return {configured:true,encryptedOnDisk:true,decryptableByCurrentWindowsUser:true,providerValidated:false,networkRequests:0};
}

export async function installPitchKey(root,{run=powershellMemory}={}){
 const file=await filename(root,true);
 try{await fs.access(file);throw fail('ALREADY_PRESENT');}catch(error){if(error.code!=='ENOENT')throw error;}
 let result;
 try{
  const reply=await run(PITCH_KEY_DIALOG_SCRIPT,'',{timeoutMs:300000,sta:true,showWindow:true});
  if(typeof reply!=='string'||reply.length>70000)throw fail('DIALOG_FAILED');
  result=JSON.parse(reply);
 }catch{throw fail('DIALOG_FAILED');}
 if(result?.cancelled===true&&Object.keys(result).length===1)throw fail('CANCELLED');
 if(result?.invalid===true&&Object.keys(result).length===1)throw fail('FORMAT_INVALID');
 if(!result||Object.keys(result).join(',')!=='ciphertext'||!validCipher(result.ciphertext))throw fail('DIALOG_INVALID');
 let checked;
 try{checked=await run(decryptScript,result.ciphertext);}catch{throw fail('DECRYPT_FAILED');}
 if(!validKey(checked))throw fail('FORMAT_INVALID');checked='';
 // Exclusive publication; no temporary file and no replacement of a key.
 await fs.writeFile(file,result.ciphertext+'\n',{flag:'wx',mode:0o600});
 return inspectPitchKey(root,{run});
}
