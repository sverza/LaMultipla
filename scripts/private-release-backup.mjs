// Manual local backup/verification only. Never prints or persists a password.
import fs from 'node:fs/promises';
import path from 'node:path';
import {sealReleaseBackup,openReleaseBackup} from './lib/private/release-backup.mjs';
import {powershellMemory,unprotectSecret} from './lib/private/windows-vault.mjs';
const [mode,filename]=process.argv.slice(2);
if(mode==='--help'){console.log('Windows: --backup <nuovo file locale cifrato> oppure --verify <backup cifrato>. Passphrase solo nella finestra locale. Nessun invio esterno.');}
else{
 try{
  if(process.platform!=='win32'||!['--backup','--verify'].includes(mode)||!filename)throw Error('LOCAL_WINDOWS_BACKUP_ARGUMENT_REQUIRED');
  const file=path.resolve(filename),relative=path.relative(process.cwd(),file);
  if(!relative.startsWith('..')&&!path.isAbsolute(relative)||file.startsWith('\\\\')||/OneDrive|Dropbox|Google Drive|GoogleDrive|iCloud/i.test(file)||await fs.realpath(path.dirname(file))!==path.dirname(file))throw Error('BACKUP_OUTSIDE_GIT_IN_LOCAL_NON_SYNC_DIRECTORY_REQUIRED');
  const pass=JSON.parse(await powershellMemory('Add-Type -AssemblyName System.Windows.Forms;$f=New-Object Windows.Forms.Form;$f.Text="LaMultipla - backup Release privato";$f.Width=460;$f.Height=230;$f.TopMost=$true;$f.StartPosition="CenterScreen";$l=New-Object Windows.Forms.Label;$l.Text="Passphrase backup (almeno 16 caratteri). Conservala separatamente.";$l.SetBounds(15,15,420,40);$a=New-Object Windows.Forms.TextBox;$a.UseSystemPasswordChar=$true;$a.SetBounds(15,65,410,25);$b=New-Object Windows.Forms.TextBox;$b.UseSystemPasswordChar=$true;$b.SetBounds(15,100,410,25);$ok=New-Object Windows.Forms.Button;$ok.Text="Conferma";$ok.SetBounds(300,140,120,30);$ok.Add_Click({if($a.Text.Length -ge 16 -and $a.Text -eq $b.Text){$f.DialogResult=[Windows.Forms.DialogResult]::OK;$f.Close()}});$f.Controls.AddRange(@($l,$a,$b,$ok));if($f.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){throw "Annullato"};[Console]::Write((@{passphrase=$a.Text}|ConvertTo-Json -Compress));','',{sta:true,showWindow:true,timeoutMs:300000})).passphrase;
  if(mode==='--backup'){
   const base=path.join(process.env.LOCALAPPDATA,'LaMultipla/PrivateRelease'),stored=JSON.parse(await fs.readFile(path.join(base,'credentials.dpapi.json'))),
    credentials=await unprotectSecret(stored.ciphertext),keystore=await fs.readFile(path.join(base,'lamultipla-owner-release.keystore')),bundle=sealReleaseBackup(keystore,credentials,pass),verified=openReleaseBackup(bundle,pass);
   if(!verified.keystore.equals(keystore))throw Error('BACKUP_SELF_CHECK_FAILED');await fs.writeFile(file,JSON.stringify(bundle),{flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:'ENCRYPTED_BACKUP_WRITTEN_AND_ROUNDTRIP_VERIFIED',file,externalExport:false}));
  }else{const bundle=JSON.parse(await fs.readFile(file,'utf8'));openReleaseBackup(bundle,pass);console.log(JSON.stringify({status:'ENCRYPTED_BACKUP_VERIFIED',file,restored:false}));}
 }catch{console.error('Backup Release non completato: verifica percorso, passphrase e archivio locale. Nessuna sovrascrittura o esportazione esterna.');process.exitCode=1;}
}
