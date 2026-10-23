import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {powershellMemory} from './windows-vault.mjs';
const failure=code=>Object.assign(new Error(code),{code});
const validKey=value=>typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\s\u0000-\u001f\u007f]/u.test(value);
// ConvertFrom-SecureString without -Key uses CurrentUser DPAPI on Windows.
// The provider format is not assumed; decryptability is not API validation.
const validCipher=value=>typeof value==='string'&&value.length<=65536&&value.length>=128&&value.length%2===0&&/^[a-f0-9]+$/i.test(value);
export const ODDS_KEY_DIALOG_SCRIPT=String.raw`
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -AssemblyName System.Drawing;
[System.Windows.Forms.Application]::EnableVisualStyles();
$form=[System.Windows.Forms.Form]::new();$form.Text='LaMultipla - chiave API OddsPapi';
$form.ClientSize=[System.Drawing.Size]::new(500,185);
$form.FormBorderStyle=[System.Windows.Forms.FormBorderStyle]::FixedDialog;
$form.StartPosition=[System.Windows.Forms.FormStartPosition]::CenterScreen;
$form.ShowInTaskbar=$true;$form.WindowState=[System.Windows.Forms.FormWindowState]::Normal;
$form.MaximizeBox=$false;$form.MinimizeBox=$false;
$label=[System.Windows.Forms.Label]::new();$label.Text='Chiave API del tuo account OddsPapi (Ctrl+V per incollare)';
$label.Location=[System.Drawing.Point]::new(20,18);$label.Size=[System.Drawing.Size]::new(460,24);
$key=[System.Windows.Forms.TextBox]::new();$key.Location=[System.Drawing.Point]::new(20,48);$key.Size=[System.Drawing.Size]::new(460,26);
$key.MaxLength=4096;$key.UseSystemPasswordChar=$true;$key.ShortcutsEnabled=$true;$key.TabIndex=0;
$note=[System.Windows.Forms.Label]::new();$note.Text='Salvataggio cifrato per questo utente Windows. Nessuna chiamata API.';
$note.Location=[System.Drawing.Point]::new(20,87);$note.Size=[System.Drawing.Size]::new(460,36);
$ok=[System.Windows.Forms.Button]::new();$ok.Text='Salva';$ok.Location=[System.Drawing.Point]::new(280,136);$ok.Size=[System.Drawing.Size]::new(95,28);
$ok.DialogResult=[System.Windows.Forms.DialogResult]::OK;$ok.TabIndex=1;
$cancel=[System.Windows.Forms.Button]::new();$cancel.Text='Annulla';$cancel.Location=[System.Drawing.Point]::new(385,136);$cancel.Size=[System.Drawing.Size]::new(95,28);
$cancel.DialogResult=[System.Windows.Forms.DialogResult]::Cancel;$cancel.TabIndex=2;
$form.Controls.AddRange([System.Windows.Forms.Control[]]@($label,$key,$note,$ok,$cancel));
$form.AcceptButton=$ok;$form.CancelButton=$cancel;$form.Add_Shown({$form.Activate();$key.Select()});
$secure=$null;
try {
  if($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){[Console]::Write('{"cancelled":true}');}
  elseif([string]::IsNullOrEmpty($key.Text) -or $key.Text.Length -gt 4096 -or $key.Text -match '[\s\x00-\x1f\x7f]'){
    [Console]::Write('{"invalid":true}');
  }else{
    $secure=ConvertTo-SecureString -String $key.Text -AsPlainText -Force;
    $cipher=ConvertFrom-SecureString -SecureString $secure;
    [Console]::Write((@{ciphertext=$cipher}|ConvertTo-Json -Compress));
  }
}finally{$key.Clear();$form.Dispose();if($secure){$secure.Dispose();}}
`;
export const ODDS_KEY_DECRYPT_SCRIPT=String.raw`
$secure=$null;$pointer=[IntPtr]::Zero;
try {
  $secure=ConvertTo-SecureString -String ([Console]::In.ReadToEnd());
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);
  [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer));
}finally{
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);}
  if($secure){$secure.Dispose();}
}
`;
function requireWindows(platform){if(platform!=='win32')throw failure('PRIVATE_ODDS_KEY_WINDOWS_REQUIRED');}
async function keyFile(root,{create=false}={}){
  const base=await fs.realpath(root),local=path.join(base,'.local'),directory=path.join(local,'oddspapi');
  if(create)await fs.mkdir(local,{recursive:true,mode:0o700});
  let actualLocal;try{actualLocal=await fs.realpath(local);}catch{throw failure('PRIVATE_ODDS_KEY_NOT_CONFIGURED');}
  if(path.relative(base,actualLocal)!=='.local')throw failure('PRIVATE_ODDS_KEY_PATH_INVALID');
  if(create)await fs.mkdir(directory,{recursive:true,mode:0o700});
  let actual;try{actual=await fs.realpath(directory);}catch{throw failure('PRIVATE_ODDS_KEY_NOT_CONFIGURED');}
  if(path.relative(base,actual)!==path.join('.local','oddspapi'))throw failure('PRIVATE_ODDS_KEY_PATH_INVALID');
  const file=path.join(actual,'api-key.dpapi');
  try{if(!(await fs.lstat(file)).isFile())throw failure('PRIVATE_ODDS_KEY_PATH_INVALID');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  return file;
}
export async function loadOddsKey(root,{run=powershellMemory,platform=process.platform}={}){
  requireWindows(platform);const file=await keyFile(root);
  let cipher;try{cipher=(await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'').trim();}
  catch{throw failure('PRIVATE_ODDS_KEY_NOT_CONFIGURED');}
  if(!validCipher(cipher))throw failure('PRIVATE_ODDS_KEY_CIPHERTEXT_INVALID');
  let key;try{key=await run(ODDS_KEY_DECRYPT_SCRIPT,cipher);}catch{throw failure('PRIVATE_ODDS_KEY_DECRYPT_FAILED');}
  if(!validKey(key))throw failure('PRIVATE_ODDS_KEY_FORMAT_INVALID');
  return key; // memory only; caller must never print or persist it
}
export async function installOddsKey(root,{run=powershellMemory,platform=process.platform}={}){
  requireWindows(platform);const filename=await keyFile(root,{create:true});
  try{await fs.access(filename);throw failure('PRIVATE_ODDS_KEY_ALREADY_CONFIGURED');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  let result;try{
    const text=await run(ODDS_KEY_DIALOG_SCRIPT,'',{timeoutMs:300000,sta:true,showWindow:true});
    if(typeof text!=='string'||text.length>70000)throw new Error();result=JSON.parse(text);
  }catch{throw failure('PRIVATE_ODDS_KEY_DIALOG_FAILED');}
  if(result?.cancelled===true&&Object.keys(result).length===1)throw failure('PRIVATE_ODDS_KEY_CANCELLED');
  if(result?.invalid===true&&Object.keys(result).length===1)throw failure('PRIVATE_ODDS_KEY_FORMAT_INVALID');
  if(!result||Object.keys(result).join(',')!=='ciphertext'||!validCipher(result.ciphertext))throw failure('PRIVATE_ODDS_KEY_DIALOG_INVALID');
  // Verify before publishing; the child returns only protected bytes from the
  // dialog. No plaintext key ever travels through the terminal or argv.
  let checked;try{checked=await run(ODDS_KEY_DECRYPT_SCRIPT,result.ciphertext);}catch{throw failure('PRIVATE_ODDS_KEY_DECRYPT_FAILED');}
  if(!validKey(checked))throw failure('PRIVATE_ODDS_KEY_FORMAT_INVALID');checked='';
  const temporary=filename+'.'+randomUUID()+'.tmp';let handle;
  try{
    handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(result.ciphertext+'\n');await handle.sync();await handle.close();handle=null;
    await fs.link(temporary,filename); // atomic, no overwrite, compatible with legacy PS reader
  }finally{if(handle)await handle.close();await fs.rm(temporary,{force:true});}
  const reread=await loadOddsKey(root,{run,platform});if(!validKey(reread))throw failure('PRIVATE_ODDS_KEY_FORMAT_INVALID');
  return {purpose:'PRIVATE_ODDSPAPI_UNATTENDED_KEY',configured:true,encryptedOnDisk:true,decryptableByCurrentWindowsUser:true,
    providerValidated:false,networkRequests:0,oddsApiRequests:0,tasksRegistered:false};
}
export async function inspectOddsKey(root,options={}){
  const key=await loadOddsKey(root,options);if(!validKey(key))throw failure('PRIVATE_ODDS_KEY_FORMAT_INVALID');
  return {purpose:'PRIVATE_ODDSPAPI_KEY_LOCAL_CHECK',configured:true,encryptedOnDisk:true,decryptableByCurrentWindowsUser:true,
    providerValidated:false,networkRequests:0,oddsApiRequests:0,tasksRegistered:false};
}
