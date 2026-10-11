import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
// Static command only. Plaintext travels over child stdin/stdout in memory,
// never arguments, environment variables, log files or shell interpolation.
export async function powershellMemory(script,input=''){
  if(process.platform!=='win32')throw new Error('DPAPI richiede Windows e lo stesso utente di accesso');
  const encoded=Buffer.from("$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);"+script,'utf16le').toString('base64');
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let chunks=[],length=0;const timer=setTimeout(()=>{child.kill();reject(new Error('Archivio protetto: timeout'));},15000);
    child.stdout.on('data',b=>{length+=b.length;if(length>1024*1024){child.kill();return;}chunks.push(b);});
    // Never forward stderr: platform errors may quote sensitive input.
    child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('PowerShell non disponibile'));});
    child.on('close',code=>{clearTimeout(timer);if(code||length>1024*1024)reject(new Error('Operazione archivio protetto non riuscita'));else resolve(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
const setup='Add-Type -AssemblyName System.Security;';
export async function protectSecret(value){return (await powershellMemory(setup+
  '$b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());$c=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Convert]::ToBase64String($c));',JSON.stringify(value))).trim();}
export async function unprotectSecret(ciphertext){
  if(typeof ciphertext!=='string'||!/^[A-Za-z0-9+/=]+$/.test(ciphertext))throw new Error('Archivio protetto non valido');
  const text=await powershellMemory(setup+
    '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Text.Encoding]::UTF8.GetString($p));',ciphertext);
  try{return JSON.parse(text);}catch{throw new Error('Contenuto archivio protetto non valido');}
}
export function windowsVault(filename){return {
  load:async()=>{let data;try{data=JSON.parse(await fs.readFile(filename,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error('Archivio protetto non leggibile');}
    if(data.schema!=='lamultipla-windows-dpapi-v1')throw new Error('Archivio protetto non riconosciuto');return unprotectSecret(data.ciphertext);},
  save:async value=>{
    const data={schema:'lamultipla-windows-dpapi-v1',ciphertext:await protectSecret(value)};
    await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});const temporary=filename+'.'+randomUUID()+'.tmp';
    let handle;try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(data));await handle.sync();await handle.close();handle=null;
      await fs.rename(temporary,filename);}finally{if(handle)await handle.close();await fs.rm(temporary,{force:true});}
  }
};}
