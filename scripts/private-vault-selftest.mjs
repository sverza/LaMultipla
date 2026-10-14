// Synthetic Windows DPAPI test. No provider calls, cloud login or jobs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {windowsVault,unprotectSecret} from './lib/private/windows-vault.mjs';
async function main(){
  if(process.platform!=='win32')throw new Error('Questo collaudo DPAPI deve essere eseguito sul PC Windows');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),parent=path.join(root,'.local','private-vault-selftest');
  await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'run-'));
  try{const filename=path.join(directory,'synthetic.dpapi.json'),vault=windowsVault(filename),marker='SYNTHETIC_ONLY_'+randomUUID();
    await vault.save({marker});const serialized=await fs.readFile(filename,'utf8');
    if(serialized.includes(marker)||(await vault.load()).marker!==marker)throw new Error('DPAPI non ha superato il collaudo');
    // Modify protected bytes. Same-user decryption must reject altered ciphertext.
    const data=JSON.parse(serialized),buffer=Buffer.from(data.ciphertext,'base64');buffer[buffer.length-1]^=1;let refused=false;
    try{await unprotectSecret(buffer.toString('base64'));}catch{refused=true;}
    if(!refused)throw new Error('DPAPI non ha respinto il contenuto alterato');
    console.log(JSON.stringify({purpose:'SYNTHETIC_WINDOWS_DPAPI_TEST',encryptedOnDisk:true,sameUserRoundTrip:true,tamperingRejected:true,apiRequests:0,jobsEnabled:false}));
  }finally{await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(()=>{console.error('Collaudo DPAPI non riuscito: nessuna credenziale visualizzata.');process.exitCode=1;});
